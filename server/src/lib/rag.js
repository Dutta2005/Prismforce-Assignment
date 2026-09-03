import { generateGroundedAnswer } from './gemini.js';
import { embedMany, embedText } from './local-embedder.js';
import { addChunks, deleteDocument, searchChunks, keywordSearch } from './chroma.js';
import { env } from '../config/env.js';
import { chunkMarkdown } from './chunker.js';
import { parsePdf } from './document-parser.js';

export async function ingestPolicy({ documentName, fileType, buffer }) {
    const chunks = fileType === 'pdf'
        ? await parsePdf({ documentName, buffer })
        : chunkMarkdown({
            documentName,
            content: buffer.toString('utf8'),
        });
    if (chunks.length === 0) {
        throw new Error('The policy file contains no indexable text.');
    }

    const embeddings = await embedMany(chunks.map((chunk) => chunk.text));

    if (embeddings.length !== chunks.length) {
        throw new Error(
            `Embedding count mismatch: ${embeddings.length} embeddings for ${chunks.length} chunks.`
        );
    }

    for (const [index, vector] of embeddings.entries()) {
        if (vector.length !== env.embeddingDimension) {
            throw new Error(
                `Embedding dimension mismatch at index ${index}: expected ${env.embeddingDimension}, got ${vector.length}.`
            );
        }
    }

    // Replacement semantics: uploading the same filename re-indexes it instead of creating stale duplicates.
    await deleteDocument(documentName);
    await addChunks(chunks, embeddings);

    const pages = chunks.reduce((max, chunk) => Math.max(max, Number(chunk.metadata.page || 0)), 0);

    return {
        document_name: documentName,
        chunks_indexed: chunks.length,
        ...(pages > 0 ? { pages } : {}),
    };
}

export async function answerQuestion(question) {
    const startedAt = Date.now();
    const normalizedQuestion = question?.trim();
    if (!normalizedQuestion) {
        return {
            answer: 'Please enter a question.',
            citations: [],
            refused: true,
            reason: 'empty_query',
        };
    }

    const queryEmbedding = await embedText(normalizedQuestion);
    const candidates = await hybridSearch(normalizedQuestion, queryEmbedding);

    // Chroma distances are only meaningful within the same collection/embedding setup.
    // The threshold is a safety gate: weak retrieval never reaches the LLM.
    const groundedCandidates = candidates.filter((item) => item.distance <= env.distanceThreshold);

    if (groundedCandidates.length === 0) {
        return {
            answer: 'I don’t have enough information in the uploaded HR policies to answer that. Please contact HR.',
            citations: [],
            refused: true,
            reason: 'weak_retrieval',
            retrieval: candidates.map(toRetrievalDebug),
            latency_ms: Date.now() - startedAt,
        };
    }

    let modelResult;
    try {
        modelResult = await generateGroundedAnswer({
            question: normalizedQuestion,
            contexts: groundedCandidates,
        });
    } catch (error) {
        if (error?.code === 'GEMINI_RATE_LIMIT') {
            const quotaError = new Error(error.message);
            quotaError.code = error.code;
            throw quotaError;
        }
        throw error;
    }

    const validIds = new Set(groundedCandidates.map((item) => item.id));
    const validCitationIds = modelResult.citation_ids.filter((id) => validIds.has(id));

    // Server-side citation validation prevents the model from inventing a document or section.
    if (modelResult.should_refuse || validCitationIds.length === 0 || !modelResult.answer.trim()) {
        return {
            answer: 'I don’t have enough information in the uploaded HR policies to answer that. Please contact HR.',
            citations: [],
            refused: true,
            reason: modelResult.should_refuse ? 'model_refusal' : 'missing_valid_citation',
            retrieval: groundedCandidates.map(toRetrievalDebug),
            latency_ms: Date.now() - startedAt,
        };
    }

    const citationMap = new Map(groundedCandidates.map((item) => [item.id, item]));
    const citations = [...new Set(validCitationIds)].map((id) => {
        const source = citationMap.get(id);
        return {
            chunk_id: source.id,
            document_name: source.metadata.document_name,
            section: source.metadata.section,
            ...(source.metadata.page ? { page: Number(source.metadata.page) } : {}),
            relevance_distance: source.distance,
        };
    });

    return {
        answer: modelResult.answer.trim(),
        citations,
        refused: false,
        retrieval: groundedCandidates.map(toRetrievalDebug),
        latency_ms: Date.now() - startedAt,
    };
}

function toRetrievalDebug(item) {
    return {
        document_name: item.metadata.document_name,
        section: item.metadata.section,
        distance: Number(item.distance.toFixed(4)),
    };
}

async function hybridSearch(query, queryEmbedding) {
    const vectorResults = await searchChunks(queryEmbedding, env.topK);
    const keywordResults = await keywordSearch(query, env.topK);

    return fuseResults(vectorResults, keywordResults);
}

function fuseResults(vectorResults, keywordResults) {
    const rrfK = 60;
    const scores = new Map();
    const items = new Map();

    const scoreResults = (results) => {
        results.forEach((item, index) => {
            const rank = index + 1;
            const score = 1 / (rrfK + rank);
            scores.set(item.id, (scores.get(item.id) || 0) + score);
            
            if (!items.has(item.id) || item.distance < items.get(item.id).distance) {
                items.set(item.id, item);
            }
        });
    };

    scoreResults(vectorResults);
    scoreResults(keywordResults);

    // Sort by combined RRF score descending
    return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => items.get(id));
}
