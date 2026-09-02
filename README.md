# HR Policy Assistant — Node.js RAG Prototype

A small Retrieval-Augmented Generation (RAG) service for internal HR policy questions.

The prototype is intentionally backend-heavy and explainable:

`Markdown policy -> heading-aware chunks -> Gemini embeddings -> Chroma Cloud -> vector retrieval -> retrieval safety gate -> Gemini grounded JSON -> server-side citation validation -> React UI`

## Why this stack

- **Node.js + Express** — simple HTTP API and easy JavaScript-only walkthrough.
- **Gemini via `@google/genai`** — current Google Gen AI JavaScript SDK. The current SDK is 2.19.0 in this prototype.
- **Local Embeddings (`@huggingface/transformers`)** — explicit local embeddings are generated using `Xenova/all-MiniLM-L6-v2` so the same embedding path is used during ingestion and querying without external API dependency for embeddings.
- **Chroma Cloud** — managed vector storage; the application sends precomputed vectors and metadata.
- **React + Vite** — intentionally minimal UI so the retrieval/backend design stays the focus.

Google now recommends the Interactions API for new Gemini integrations. This prototype uses that API for the final grounded answer and JSON schema. The older `generateContent` path still exists, but Google describes it as legacy. See DESIGN.md for the decision and the exact current API references used while building this repository.

## Prerequisites

- Node.js 20+
- A Google AI Studio Gemini API key
- A Chroma Cloud database and API key

Node 22+ is also a safe choice. The Gemini SDK notes that a future 3.x release will require Node 22, so pinning the current 2.x line here keeps the assignment reproducible.

## Setup in under 10 minutes

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Configure environment variables

Go to `server/` folder and copy `.env.example` to `.env` and fill in the keys/IDs:

```bash
cd server
cp .env.example .env
```

Required values:

```env
GEMINI_API_KEY=...
CHROMA_API_KEY=...
CHROMA_TENANT=...
CHROMA_DATABASE=...
```

The Chroma Cloud dashboard/CLI provides the connection values. The Chroma docs also support environment-based `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE` configuration.

### 3. Start the API

```bash
npm --workspace server run dev
```

API: `http://localhost:4000`

### 4. Start the UI

In another terminal:

```bash
npm --workspace client run dev
```

Open the Vite URL (normally `http://localhost:5173`).

## Demo flow

1. Select **Admin**.
2. Upload the three sample policies from `data/policies/` one at a time.
3. Switch to **Employee**.
4. Ask:
   - `How many casual leave days can I carry forward?`
   - `Does the Standard health tier cover dental implants?`
   - `Can I expense a personal home gym?`
5. The first two should return grounded answers with citations. The third should refuse.
6. For the PDF path, upload `data/policies/health-benefits-sample.pdf` as Admin and ask the dental-implant question. The citation should include the PDF filename and page number.

## API

### `POST /api/policies/upload`

Header:

```text
x-user-role: admin
```

Multipart form field:

```text
file=<policy.md | policy.txt | policy.pdf>
```

Response:

```json
{
  "ok": true,
  "document_name": "leave-policy.md",
  "chunks_indexed": 4,
  "pages": 0
}
```

### `POST /api/qa/ask`

```json
{
  "question": "What is the casual leave carry-forward limit?"
}
```

Response shape:

```json
{
  "answer": "Employees can carry forward up to 5 unused casual leave days into the next calendar year.",
  "citations": [
    {
      "chunk_id": "...",
      "document_name": "leave-policy.md",
      "section": "Casual Leave > Carry Forward",
      "relevance_distance": 0.18
    }
  ],
  "refused": false
}
```

A refusal returns the same top-level shape with `refused: true` and an empty `citations` array.

## Environment variables

See `.env.example`. The important model/configuration knobs are:

- `GEMINI_LLM_MODEL` — final answer model. Default: `gemini-3.5-flash-lite`.
- `LOCAL_EMBEDDING_MODEL` — embedding model via Hugging Face transformers. Default: `Xenova/all-MiniLM-L6-v2`.
- `EMBEDDING_DIMENSION` — vector dimension for the embedder. Default: `384`.
- `TOP_K` — number of candidates retrieved from Chroma.
- `DISTANCE_THRESHOLD` — retrieval safety threshold; weak matches do not reach the LLM.
- `CHUNK_TARGET_CHARS` and `CHUNK_OVERLAP_CHARS` — chunk sizing controls.

## Security notes

- Gemini and Chroma secrets stay on the server.
- The UI never receives either API key.
- The role switch is intentionally hardcoded for the assignment; it is **not** production authentication.
- Policy answers never call web search or external knowledge sources.
- Citation IDs are validated server-side against retrieved chunks.

## Current Gemini / Chroma references used

- Google Gemini API overview and current JS SDK: https://ai.google.dev/gemini-api/docs
- Gemini Interactions API: https://ai.google.dev/api/interactions-api-v1
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini embeddings: https://ai.google.dev/gemini-api/docs/embeddings
- Chroma Cloud clients: https://docs.trychroma.com/docs/run-chroma/clients
- Chroma JS collection API: https://docs.trychroma.com/reference/js-collection

## PDF support

PDF upload is handled in the same ingestion pipeline as Markdown/TXT. The server uses `pdf-parse` to extract text page-by-page, then sends each page through the existing chunker. Each indexed chunk keeps `page` metadata, so an answer can cite `document.pdf` + `Page N`. `pdf-parse` 2.4.5 supports Node.js 20.16+ and exposes per-page text through `result.pages`. citeturn130513search1turn364808search2

This prototype supports **text-based PDFs**. A scanned/image-only PDF has no extractable text, so ingestion rejects it with a clear error. OCR is intentionally not included in the minimum implementation.

The current PDF path does not claim perfect table extraction. PDFs whose tables are represented as selectable text may work, but layout-heavy tables can lose their row/column structure during text extraction. A stronger second iteration would use PDF table extraction and store table rows as structured chunks. `pdf-parse` also exposes a `getTable()` API that can be used for that upgrade. citeturn130513search1
