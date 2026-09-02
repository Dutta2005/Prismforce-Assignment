import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

const ai = new GoogleGenAI({
    apiKey: env.geminiApiKey,
    httpOptions: {
        timeout: 15_000,
        retryOptions: { attempts: 1 },
    },
});

const answerSchema = {
    type: 'object',
    properties: {
        answer: {
            type: 'string',
            description: 'A concise answer supported only by the supplied policy excerpts. Empty when refusing.',
        },
        should_refuse: {
            type: 'boolean',
            description: 'True when the supplied policy excerpts do not contain enough information to answer safely.',
        },
        citation_ids: {
            type: 'array',
            description: 'IDs of retrieved chunks that directly support the answer. Must be empty when refusing.',
            items: { type: 'string' },
        },
    },
    required: ['answer', 'should_refuse', 'citation_ids'],
    additionalProperties: false,
};

export async function generateGroundedAnswer({ question, contexts }) {
    const contextText = contexts.map((chunk, index) => {
        return [
            `SOURCE ${index + 1}`,
            `chunk_id: ${chunk.id}`,
            `document: ${chunk.metadata.document_name}`,
            `section: ${chunk.metadata.section}`,
            ...(chunk.metadata.page ? [`page: ${chunk.metadata.page}`] : []),
            `content:\n${chunk.document}`,
        ].join('\n');
    }).join('\n\n---\n\n');

    const prompt = [
        'You are an internal HR policy assistant.',
        '',
        'Answer ONLY from the supplied policy excerpts.',
        'Do not use outside knowledge or assumptions.',
        'If the excerpts do not clearly answer the question, refuse.',
        'Do not invent numbers, benefits, exceptions, eligibility rules, or citation IDs.',
        'For table questions, use only the rows/cells present in the excerpts.',
        '',
        `EMPLOYEE QUESTION:\n${question}`,
        '',
        `RETRIEVED POLICY EXCERPTS:\n${contextText}`,
    ].join('\n');

    let response;
    try {
        response = await ai.models.generateContent({
            model: env.geminiLlmModel,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: answerSchema,
                temperature: 0,
                maxOutputTokens: 220,
            },
        });
    } catch (error) {
        if (error?.status === 429 || /429|quota|rate.?limit|resource.?exhausted/i.test(error?.message || '')) {
            const quotaError = new Error('Gemini rate limit reached. Check the project quota in Google AI Studio and retry later.');
            quotaError.code = 'GEMINI_RATE_LIMIT';
            quotaError.cause = error;
            throw quotaError;
        }
        throw error;
    }

    let parsed;
    try {
        parsed = JSON.parse(response.text);
    } catch {
        throw new Error('Gemini returned invalid structured output.');
    }

    if (typeof parsed.answer !== 'string' || typeof parsed.should_refuse !== 'boolean' || !Array.isArray(parsed.citation_ids)) {
        throw new Error('Gemini structured output failed validation.');
    }

    return parsed;
}
