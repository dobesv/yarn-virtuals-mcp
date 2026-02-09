import fs from "fs/promises";
import normalizeLineEndings from "./normalizeLineEndings.js";

export default async function readFileLines(filePath, startLine, endLine) {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = normalizeLineEndings(content).split('\n');
    // startLine and endLine are 1-based, inclusive
    const start = Math.max(1, startLine) - 1;
    const end = Math.min(lines.length, endLine);
    return lines.slice(start, end).join('\n');
}
