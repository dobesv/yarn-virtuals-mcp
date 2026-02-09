import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { normalizePath } from './path-utils.js';

async function parseRootUri(rootUri) {
    try {
        const rawPath = rootUri.startsWith('file://') ? rootUri.slice(7) : rootUri;
        const expandedPath = rawPath.startsWith('~/') || rawPath === '~'
            ? path.join(os.homedir(), rawPath.slice(1))
            : rawPath;
        const absolutePath = path.resolve(expandedPath);
        const resolvedPath = await fs.realpath(absolutePath);
        return normalizePath(resolvedPath);
    }
    catch {
        return null;
    }
}

export async function getValidRootDirectories(requestedRoots) {
    const validatedDirectories = [];
    for (const requestedRoot of requestedRoots) {
        const resolvedPath = await parseRootUri(requestedRoot.uri);
        if (!resolvedPath) {
            console.error(`Skipping invalid path or inaccessible: ${requestedRoot.uri}`);
            continue;
        }
        try {
            const stats = await fs.stat(resolvedPath);
            if (stats.isDirectory()) {
                validatedDirectories.push(resolvedPath);
            }
            else {
                console.error(`Skipping non-directory root: ${resolvedPath}`);
            }
        }
        catch (error) {
            console.error(`Skipping invalid directory: ${resolvedPath} due to error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return validatedDirectories;
}
