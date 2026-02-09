import fs from "fs/promises";
import path from "path";
import { minimatch } from 'minimatch';
import { normalizePath, expandHome } from './path-utils.js';
import { isPathWithinAllowedDirectories } from './path-validation.js';

let allowedDirectories = [];

export function setAllowedDirectories(directories) {
    allowedDirectories = [...directories];
}

export function getAllowedDirectories() {
    return [...allowedDirectories];
}

export function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i < 0 || i === 0) return `${bytes} ${units[0]}`;
    const unitIndex = Math.min(i, units.length - 1);
    return `${(bytes / Math.pow(1024, unitIndex)).toFixed(2)} ${units[unitIndex]}`;
}

export function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, '\n');
}

export async function validatePath(requestedPath) {
    const expandedPath = expandHome(requestedPath);
    const absolute = path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(process.cwd(), expandedPath);
    const normalizedRequested = normalizePath(absolute);
    const isAllowed = isPathWithinAllowedDirectories(normalizedRequested, allowedDirectories);
    if (!isAllowed) {
        throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
    }
    // Handle symlinks by checking their real path to prevent symlink attacks.
    // For Yarn PnP virtual paths (inside .yarn/__virtual__ or .yarn/cache/*.zip),
    // realpath may fail with ENOENT since the path only exists through Yarn's
    // patched fs. In that case, return the path as-is since we already confirmed
    // it's within allowed directories.
    try {
        const realPath = await fs.realpath(absolute);
        const normalizedReal = normalizePath(realPath);
        if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
            throw new Error(`Access denied - symlink target outside allowed directories: ${realPath} not in ${allowedDirectories.join(', ')}`);
        }
        return realPath;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return absolute;
        }
        throw error;
    }
}

export async function getFileStats(filePath) {
    const stats = await fs.stat(filePath);
    return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8).slice(-3),
    };
}

export async function readFileContent(filePath, encoding = 'utf-8') {
    return await fs.readFile(filePath, encoding);
}

export async function tailFile(filePath, numLines) {
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

export async function headFile(filePath, numLines) {
    const fileHandle = await fs.open(filePath, 'r');
    try {
        const lines = [];
        let buffer = '';
        let bytesRead = 0;
        const chunk = Buffer.alloc(1024);
        while (lines.length < numLines) {
            const result = await fileHandle.read(chunk, 0, chunk.length, bytesRead);
            if (result.bytesRead === 0) break;
            bytesRead += result.bytesRead;
            buffer += chunk.slice(0, result.bytesRead).toString('utf-8');
            const newLineIndex = buffer.lastIndexOf('\n');
            if (newLineIndex !== -1) {
                const completeLines = buffer.slice(0, newLineIndex).split('\n');
                buffer = buffer.slice(newLineIndex + 1);
                for (const line of completeLines) {
                    lines.push(line);
                    if (lines.length >= numLines) break;
                }
            }
        }
        if (buffer.length > 0 && lines.length < numLines) {
            lines.push(buffer);
        }
        return lines.join('\n');
    }
    finally {
        await fileHandle.close();
    }
}

export async function searchFilesWithValidation(rootPath, pattern, allowedDirectories, options = {}) {
    const { excludePatterns = [] } = options;
    const results = [];
    async function search(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            try {
                await validatePath(fullPath);
                const relativePath = path.relative(rootPath, fullPath);
                const shouldExclude = excludePatterns.some(excludePattern => minimatch(relativePath, excludePattern, { dot: true }));
                if (shouldExclude) continue;
                if (minimatch(relativePath, pattern, { dot: true })) {
                    results.push(fullPath);
                }
                if (entry.isDirectory()) {
                    await search(fullPath);
                }
            }
            catch {
                continue;
            }
        }
    }
    await search(rootPath);
    return results;
}
