import fs from "fs/promises";
import normalizeLineEndings from "./normalizeLineEndings.js";

export default async function tailFile(filePath, numLines) {
    const CHUNK_SIZE = 1024;
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    if (fileSize === 0) return '';
    const fileHandle = await fs.open(filePath, 'r');
    try {
        const lines = [];
        let position = fileSize;
        let chunk = Buffer.alloc(CHUNK_SIZE);
        let linesFound = 0;
        let remainingText = '';
        while (position > 0 && linesFound < numLines) {
            const size = Math.min(CHUNK_SIZE, position);
            position -= size;
            const { bytesRead } = await fileHandle.read(chunk, 0, size, position);
            if (!bytesRead) break;
            const readData = chunk.slice(0, bytesRead).toString('utf-8');
            const chunkText = readData + remainingText;
            const chunkLines = normalizeLineEndings(chunkText).split('\n');
            if (position > 0) {
                remainingText = chunkLines[0];
                chunkLines.shift();
            }
            for (let i = chunkLines.length - 1; i >= 0 && linesFound < numLines; i--) {
                lines.unshift(chunkLines[i]);
                linesFound++;
            }
        }
        return lines.join('\n');
    }
    finally {
        await fileHandle.close();
    }
}
