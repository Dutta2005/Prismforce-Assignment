# Design — Internal HR FAQ & Policy Assistant

## 1. Architecture

```text
                    ADMIN
                      |
               POST /policies/upload
                      |
               Markdown / text file
                      |
              +-------v--------+
              | Policy parser  |
              | + chunker      |
              +-------+--------+
                      |
             Local embedding model
                      |
              +-------v--------+
              |   Chroma Cloud |
              | vectors + text |
              | + metadata     |
              +----------------+

                   EMPLOYEE
                      |
                POST /qa/ask
                      |
              Local query embedding
                      |
              +-------v--------+
              | Hybrid search  |
              | (Vector + Kw)  |
              | with RRF       |
              +-------+--------+
                      |
               distance threshold
                 /           \
            weak /             \ strong
                /               \
          REFUSE                 Gemini grounded answer
          before LLM             + JSON schema
                                      |
                               citation ID validation
                                      |
                                JSON API response
                                      |
                                  React UI
```

The backend is intentionally split into small modules: chunking, Gemini access, Chroma access, retrieval/grounding, and HTTP routes. This keeps each design decision changeable without rewriting the entire application.

## 2. Chunking & retrieval

### Chunking strategy

The source format for the assignment is Markdown/text, so the first version uses document structure rather than a blind fixed-token splitter.

The parser:

1. Detects Markdown headings (`#` through `######`).
2. Maintains the current heading path, for example `Health Benefits > Standard Health Tier > Dental Benefits`.
3. Extracts Markdown tables, preserving context by representing each row alongside its respective column headers.
4. Groups nearby paragraphs/list blocks from the same section until the configured character target is reached.
5. Splits an unusually long block at a sensible line/sentence boundary with configurable overlap.

Default target: **1400 characters**, overlap: **180 characters**.

I used characters instead of a tokenizer because this assignment has a very small corpus and I wanted a transparent implementation with no hidden tokenizer behavior. For a much larger corpus I would move to token-aware chunking.

### Metadata

Every stored chunk has:

```json
{
  "document_name": "health-benefits.md",
  "section": "Health Benefits > Standard Health Tier > Dental Benefits",
  "section_path": "Health Benefits > Standard Health Tier > Dental Benefits",
  "chunk_index": 3
}
```

The chunk ID is a UUID and is also passed to Gemini during answering. This lets the model refer to an exact retrieved chunk rather than inventing a citation string.

### Retrieval

At query time:

1. Embed the employee question with the same local embedding model used at ingestion.
2. Perform a hybrid search against Chroma, querying for both the explicit query vector and keyword full-text matches.
3. Fuse the vector and keyword results using Reciprocal Rank Fusion (RRF) and retrieve the top `K` candidates.
4. Apply a distance threshold (default `1.45` in this prototype).
5. Only the surviving chunks are eligible context for the answer model.

The threshold is a **safety gate, not a guarantee of semantic correctness**. It should be calibrated against a small evaluation set before treating the value as production-ready.

### Why explicit embeddings

Chroma can embed documents itself, but this prototype sends precomputed vectors. That makes the embedding model an explicit application-level dependency and guarantees the same embedding model is used for both indexing and querying. It also makes later migration to another embedding provider straightforward.

## 3. Grounding and anti-hallucination design

The most important requirement is not generation quality; it is safe refusal.

There are four layers of defense.

### Layer 1 — No external knowledge source

The answer request contains only the employee question and retrieved policy excerpts. The model is explicitly instructed not to use outside knowledge.

### Layer 2 — Retrieval confidence gate

If all top-K vector results are weaker than the configured threshold, the request stops before Gemini generation and returns:

> I don’t have enough information in the uploaded HR policies to answer that. Please contact HR.

This means an obviously off-policy question can be refused without spending an LLM call.

### Layer 3 — Structured output

Gemini is constrained to return:

```json
{
  "answer": "...",
  "should_refuse": false,
  "citation_ids": ["chunk-uuid-1"]
}
```

Structured output is used because the public API contract requires JSON, and because it separates model reasoning from the response object expected by clients.

### Layer 4 — Server-side citation validation

The model only sees citation IDs that came from retrieval, and the backend verifies every returned ID against the retrieved set. Invalid IDs are discarded. If no valid citation remains, the server refuses rather than returning an uncited answer.

This is stronger than simply asking the model to output `document_name` and `section` text, because free-form source names are easy for a model to fabricate.

### What about the model answering incorrectly from a relevant chunk?

The current prototype reduces this risk but does not eliminate it. A chunk can be semantically related yet still fail to contain the exact answer. The model prompt therefore says not to infer missing numbers, benefits, exceptions, eligibility, or definitions. The next hardening step would be a second verification stage that asks a smaller model or deterministic rule layer: “Does the answer follow from these exact excerpts?”

## 4. Schema & APIs

### Upload

`POST /api/policies/upload`

Header: `x-user-role: admin`

Body: multipart file.

Response:

```json
{
  "ok": true,
  "document_name": "leave-policy.md",
  "chunks_indexed": 4
}
```

Uploading a file with the same filename first deletes chunks with that filename and then indexes the replacement. This gives the prototype simple replacement semantics without adding a separate policy-version table.

### Question

`POST /api/qa/ask`

```json
{
  "question": "Does the Standard health tier cover dental implants?"
}
```

Response:

```json
{
  "answer": "No. The Standard health tier does not cover dental implants.",
  "citations": [
    {
      "chunk_id": "uuid",
      "document_name": "health-benefits.md",
      "section": "Health Benefits > Standard Health Tier > Dental Benefits",
      "relevance_distance": 0.22
    }
  ],
  "refused": false
}
```

For refusal, `answer` contains the safe fallback, `citations` is empty, and `refused` is `true`.

The API deliberately does not return retrieved document text to the UI. That keeps the external response small while retaining enough citation metadata for the user and enough retrieval detail for debugging.

## 5. Trade-offs considered

### A. LangChain/LlamaIndex vs a thin custom RAG layer

**Rejected for v1:** a full orchestration framework.

Why: the evaluation emphasizes that the candidate can explain the retrieval and grounding decisions. The assignment only needs one vector store, one embedding path, and one generator. A thin implementation makes the data flow obvious and reduces framework-specific abstractions.

I would introduce a framework when the system gains multiple retrievers, reranking, tracing, tools, or complex chains.

### B. Token-based recursive chunking vs Markdown-aware chunking

**Rejected for v1:** generic recursive character/token splitting as the primary strategy.

Why: the input is structured Markdown. A section heading is meaningful metadata and the table example is explicitly part of the evaluation. Keeping the table and heading context together is more valuable than achieving mathematically uniform chunk sizes.

### C. LLM confidence score vs retrieval threshold

**Rejected for v1:** trusting a model-generated “confidence: 0.91”.

Why: confidence is another model assertion and can be miscalibrated. The first gate is based on retrieval distance, which is directly observable from the vector search. This is still heuristic, so the threshold must be evaluated on representative questions.

### D. Local vector DB vs Chroma Cloud

**Rejected for the assignment:** local-only Chroma.

Why: Chroma Cloud removes setup friction around persistence and gives a realistic hosted vector-store boundary while still keeping the data model simple. The same repository can later swap the Chroma client for another store behind `chroma.js`.

## 6. Future Improvements

I would harden the system in this order:

1. **Evaluation harness first.** Add a small gold dataset with factual, table, paraphrase, ambiguous, and off-policy questions. Measure retrieval recall, citation correctness, answer correctness, and refusal precision. This protects against regressions when changing chunking or ranking.
2. **Versioning and auth.** Add policy IDs, versions/effective dates, real authentication, and role enforcement in the server rather than the demo header.
3. **Observability and feedback.** Store anonymized retrieval traces, refusal reasons, latency, and thumbs up/down feedback for evaluation.

### Recently Implemented Extensions

- **Hybrid retrieval:** Keyword/full-text retrieval was added alongside vector search to handle exact policy identifiers, clause numbers, and names. The vector and lexical rankings are fused using reciprocal rank fusion (RRF) before the safety gate.
- **Table-aware Ingestion:** The chunker explicitly parses tables to represent each individual data row with its column headers inline, ensuring relational structure is heavily preserved for retrieval without compromising standard chunk logic.

## PDF ingestion

The repository includes `data/policies/health-benefits-sample.pdf` as a small text-based PDF fixture for demonstrating the new upload path.

PDF is supported as an additional input format without changing the retrieval or answer layers. The upload route validates `.pdf`, and `server/src/lib/document-parser.js` uses `pdf-parse` to extract each page independently. The extracted page text is passed through the existing chunker, so Chroma still stores the same `id/document/metadata` shape. The only PDF-specific metadata is `source_type=pdf` and `page`.

This is deliberately a **text-PDF** implementation. If extraction produces no text, ingestion fails rather than indexing an empty document. Scanned PDFs require OCR, which is left for a later hardening step. The chosen `pdf-parse` package exposes page-level text and also has a separate table-extraction API, so table-aware PDF ingestion can be added without replacing the rest of the RAG pipeline. citeturn130513search1turn364808search2

For PDF citations, `section` becomes `Page N` because arbitrary PDF text does not reliably contain semantic heading information. If a later parser can recover document headings or bookmarks, the same metadata field can carry that section name while retaining `page`.

## 7. Stretch direction deliberately left as an extension point

The retrieval boundary is isolated in `server/src/lib/rag.js` and `server/src/lib/chroma.js`. The `hybridSearch()` implementation returns the same candidate shape:

```js
{
  id,
  document,
  metadata,
  distance
}
```

That means the answer-generation and citation-validation layers do not need to know whether the candidate came from vectors only, lexical search, or a fused ranking.

## 8. Failure paths

- Empty question -> safe local response; no embedding or LLM call.
- Unsupported/unreadable upload -> HTTP error; no partial indexing.
- Zero chunks -> upload rejected.
- Chroma unavailable -> health endpoint reports failure and API returns an error rather than hallucinating.
- Local embedding failure -> request fails; no answer is generated.
- Weak retrieval -> refusal before LLM.
- Gemini JSON parse/schema failure -> request fails closed.
- Missing/invalid citation IDs -> refusal.

The principle is simple: **any uncertainty in the retrieval or grounding pipeline fails closed rather than producing a confident policy statement.**
