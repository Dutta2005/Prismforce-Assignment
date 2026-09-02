import { Router } from 'express';
import { answerQuestion } from '../lib/rag.js';

const router = Router();

router.post('/ask', async (req, res, next) => {
    try {
        const question = req.body?.question;
        if (typeof question !== 'string') {
            return res.status(400).json({ error: 'question must be a string.' });
        }
        const result = await answerQuestion(question);
        return res.json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
