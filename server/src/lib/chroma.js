import { CloudClient } from "chromadb";
import { env } from "../config/env.js";

const chroma = new CloudClient({
    apiKey: env.chromaApiKey,
    tenant: env.chromaTenant,
    database: env.chromaDatabase,
});

let collectionPromise;

export function getCollection() {
    if (!collectionPromise) {
        collectionPromise = chroma.getOrCreateCollection({
            name: env.chromaCollection,
            metadata: {
                description: 'HR policy chunks for the assignment RAG service',
                embedding_model: env.localEmbeddingModel
            },
            embeddingFunction: null
        });
    }

    return collectionPromise;
}

export async function addChunks(chunks, embeddings) {
    const collection = await getCollection();
    if (chunks.length !== embeddings.length) {
        throw new Error(
            `Chunk/embedding count mismatch: ${chunks.length} chunks, ${embeddings.length} embeddings`
        );
    }

    const invalidIndex = embeddings.findIndex(
        (vector) => vector.length !== env.embeddingDimension
    );

    if (invalidIndex !== -1) {
        throw new Error(
            `Refusing to index vector ${invalidIndex}: expected dimension ${env.embeddingDimension}, got ${embeddings[invalidIndex].length}`
        );
    }

    await collection.add({
        ids: chunks.map((chunk) => chunk.id),
        embeddings,
        documents: chunks.map((chunk) => chunk.text),
        metadatas: chunks.map((chunk) => chunk.metadata)
    });
    return chunks.length;
}

export async function searchChunks(queryEmbedding, nResults = env.topK) {
    const collection = await getCollection();
    const result = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults,
        include: ['documents', 'metadatas', 'distances']
    });

    const ids = result.ids?.[0] || [];
    const documents = result.documents?.[0] || [];
    const metadatas = result.metadatas?.[0] || [];
    const distances = result.distances?.[0] || [];

    return ids.map((id, index) => ({
        id,
        document: documents[index] || '',
        metadata: metadatas[index] || {},
        distance: distances[index] ?? Infinity,
    }));
}

export async function deleteDocument(documentName) {
    const collection = await getCollection();
    await collection.delete({
        where: {
            document_name: documentName
        }
    });
}

export async function countChunks() {
    const collection = await getCollection();
    return collection.count();
}

export async function keywordSearch(query, nResults = env.topK) {
    const collection = await getCollection();

    const words = query.trim().split(/\s+/).filter(w => w.length > 2);

    if (words.length === 0) {
        if (query.trim().length > 0) {
            words.push(query.trim());
        } else {
            return [];
        }
    }

    const whereDocument = words.length === 1
        ? { "$contains": words[0] }
        : { "$and": words.map(w => ({ "$contains": w })) };

    try {
        const result = await collection.get({
            whereDocument,
            limit: nResults,
            include: ['documents', 'metadatas']
        });

        const ids = result.ids || [];
        const documents = result.documents || [];
        const metadatas = result.metadatas || [];

        return ids.map((id, index) => ({
            id,
            document: documents[index] || '',
            metadata: metadatas[index] || {},
            distance: 0,
        }));
    } catch (error) {
        console.error("Keyword search error:", error);
        return [];
    }
}