import { promises as fs } from "fs";
import path from "path";
import os from "os";
import normalizePath from "./normalizePath.js";

export default async function parseRootUri(rootUri) {
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
