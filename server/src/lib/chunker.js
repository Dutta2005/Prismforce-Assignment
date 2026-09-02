import crypto from 'node:crypto';
import { env } from '../config/env.js';

function headingLevel(line) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    return match ? match[1].length : 0;
}

function headingText(line) {
    return line.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trim();
}

function isTableLine(line) {
    return /^\s*\|.*\|\s*$/.test(line);
}

function normalizeMarkdown(raw) {
    return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function parseBlocks(markdown) {
    const lines = markdown.split('\n');
    const blocks = [];
    let current = [];
    let section = 'General';
    let sectionPath = [];
    let i = 0;

    const flush = () => {
        if (current.length === 0) return;
        const text = current.join('\n').trim();
        if (text) blocks.push({ text, section, sectionPath: [...sectionPath] });
        current = [];
    };

    while (i < lines.length) {
        const line = lines[i];
        const level = headingLevel(line);

        if (level) {
            flush();
            const title = headingText(line);
            sectionPath = sectionPath.slice(0, level - 1);
            sectionPath[level - 1] = title;
            section = sectionPath.filter(Boolean).join(' > ') || title;
            i += 1;
            continue;
        }

        if (isTableLine(line)) {
            flush();
            const table = [line];
            i += 1;
            while (i < lines.length && (isTableLine(lines[i]) || lines[i].trim() === '')) {
                table.push(lines[i]);
                i += 1;
            }
            const text = table.join('\n').trim();
            if (text) blocks.push({ text, section, sectionPath: [...sectionPath] });
            continue;
        }

        if (line.trim() === '') {
            flush();
        } else {
            current.push(line);
        }
        i += 1;
    }

    flush();
    return blocks;
}

function splitLongBlock(block) {
    const pieces = [];
    let start = 0;
    const text = block.text;
    const size = env.chunkTargetChars;
    const overlap = Math.min(env.chunkOverlapChars, Math.floor(size / 3));

    while (start < text.length) {
        let end = Math.min(start + size, text.length);
        if (end < text.length) {
            const slice = text.slice(start, end);
            const boundary = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '));
            if (boundary > size * 0.55) end = start + boundary + (slice[boundary] === '.' ? 1 : 0);
        }
        pieces.push({ ...block, text: text.slice(start, end).trim() });
        if (end >= text.length) break;
        start = Math.max(0, end - overlap);
    }
    return pieces;
}

export function chunkMarkdown({ documentName, content, page = null }) {
    const blocks = parseBlocks(normalizeMarkdown(content));
    const expanded = blocks.flatMap(splitLongBlock);
    const chunks = [];
    let current = null;

    for (const block of expanded) {
        const candidate = current ? `${current.text}\n\n${block.text}` : block.text;
        const sameSection = current && current.section === block.section;

        if (current && sameSection && candidate.length <= env.chunkTargetChars) {
            current.text = candidate;
            continue;
        }

        if (current) chunks.push(current);
        current = {
            text: block.text,
            section: block.section,
            sectionPath: block.sectionPath,
        };
    }
    if (current) chunks.push(current);

    return chunks.map((chunk, index) => ({
        id: crypto.randomUUID(),
        text: chunk.text,
        metadata: {
            document_name: documentName,
            section: chunk.section,
            section_path: chunk.sectionPath.join(' > '),
            chunk_index: index,
            ...(page !== null ? { page } : {}),
        },
    }));
}
