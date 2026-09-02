import { pipeline } from "@huggingface/transformers";
import { env } from "../config/env.js";

let extractor = null;

async function getExtractor() {
    if (!extractor) {
        extractor = await pipeline(
            "feature-extraction",
            env.localEmbeddingModel
        );
    }

    return extractor;
}

export async function embedText(text) {
    const extractor = await getExtractor();

    const output = await extractor(text, {
        pooling: "mean",
        normalize: true,
    });

    const vector = Array.from(output.data);

    if (vector.length !== env.embeddingDimension) {
        throw new Error(
            `Embedding dimension mismatch: expected ${env.embeddingDimension}, got ${vector.length}`
        );
    }

    return vector;
}

export async function embedMany(texts) {
    const vectors = [];

    for (const text of texts) {
        vectors.push(await embedText(text));
    }

    return vectors;
}