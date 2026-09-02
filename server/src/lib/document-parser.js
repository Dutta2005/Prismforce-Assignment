import { PDFParse } from 'pdf-parse';
import { chunkMarkdown } from './chunker.js';

export async function parsePdf({ documentName, buffer }) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
        const result = await parser.getText({
            lineEnforce: '\n',
            itemJoiner: ' '
        });

        const pages = Array.isArray(result.pages) ? result.pages : [];
        const chunks = [];

        for (const page of pages) {
            const pageText = page.text?.replace(/\s+$/g, '').trim();
            if (!pageText) continue;

            const pageChunks = chunkMarkdown({
                documentName,
                content: pageText,
                page: page.num
            });

            for (const chunk of pageChunks) {
                chunk.metadata.source_type = 'pdf';
                chunk.metadata.section = `Page ${page.num}`;
                chunk.metadata.section_path = `Page ${page.num}`;
                chunks.push(chunk);
            }
        }

        if (chunks.length === 0) {
            throw new Error('The PDF contains no extractable text. It may be scanned/image-only; OCR is not enabled in this prototype.');
        }

        return chunks.map((chunk, index) => ({
            ...chunk,
            metadata: {
                ...chunk.metadata,
                chunk_index: index,
                page: Number(chunk.metadata.page)
            }
        }));

    } catch (error) {
        console.log('PDF parsing error: ', error);
    } finally {
        await parser.destroy();
    }
}