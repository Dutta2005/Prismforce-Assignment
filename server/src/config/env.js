import 'dotenv/config';

export const env = {
    port: Number(process.env.PORT || 8000),
    clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",

    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiLlmModel:
        process.env.GEMINI_LLM_MODEL || "gemini-3.5-flash-lite",

    localEmbeddingModel:
        process.env.LOCAL_EMBEDDING_MODEL ||
        "Xenova/all-MiniLM-L6-v2",

    embeddingDimension: Number(
        process.env.EMBEDDING_DIMENSION || 384
    ),

    chromaHost: process.env.CHROMA_HOST || "api.trychroma.com",
    chromaPort: Number(process.env.CHROMA_PORT || 443),
    chromaApiKey: process.env.CHROMA_API_KEY,
    chromaTenant: process.env.CHROMA_TENANT,
    chromaDatabase: process.env.CHROMA_DATABASE,

    chromaCollection:
        process.env.CHROMA_COLLECTION ||
        "hr_policy_chunks_local",

    topK: Number(process.env.TOP_K || 6),
    distanceThreshold: Number(process.env.DISTANCE_THRESHOLD || 1.45),
    chunkTargetChars: Number(process.env.CHUNK_TARGET_CHARS || 1400),
    chunkOverlapChars: Number(process.env.CHUNK_OVERLAP_CHARS || 180),
};