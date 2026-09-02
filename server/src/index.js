import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import policiesRouter from './routes/policies.js';
import qaRouter from './routes/qa.js';
import { countChunks } from './lib/chroma.js';

const app = express();
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (_req, res) => {
    try {
        const chunks = await countChunks();
        res.json({ ok: true, indexed_chunks: chunks });
    } catch (error) {
        res.status(503).json({ ok: false, error: error.message });
    }
});

app.use('/api/policies', policiesRouter);
app.use('/api/qa', qaRouter);

app.use((error, _req, res, _next) => {
    console.error(error);
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.code === 'GEMINI_RATE_LIMIT' ? 429 : 500;
    res.status(status).json({
        error:
            status === 413
                ? 'File is too large. Maximum size is 10 MB.'
                : status === 429
                    ? error.message
                    : 'Internal server error.',
        detail: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
});

app.listen(env.port, () => {
    console.log(`HR Policy RAG API running at http://localhost:${env.port}`);
});
