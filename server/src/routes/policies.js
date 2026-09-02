import { Router } from "express";
import multer from 'multer';
import { ingestPolicy } from "../lib/rag.js";
import { getRole } from "../lib/auth.js";


const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const name = file.originalname.toLowerCase();
        const allowedExtensions = name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.pdf');
        const allowedMime = [
            'text/markdown',
            'text/plain',
            'application/pdf',
            'application/octet-stream'
        ];
        cb(null, allowedExtensions && allowedMime.includes(file.mimetype));
    }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
    if (getRole(req) !== 'admin') return res.status(403).json({ error: 'Admin role required.' });
    if (!req.file) return res.status(400).json({ error: 'Upload a .md, .txt, or .pdf file.' });

    try {
        const extension = req.file.originalname.toLowerCase().split('.').pop();
        const result = await ingestPolicy({
            documentName: req.file.originalname,
            fileType: extension,
            buffer: req.file.buffer,
        });
        res.status(201).json({ ok: true, ...result });
    } catch (error) {
        next(error);
    }
});

export default router;