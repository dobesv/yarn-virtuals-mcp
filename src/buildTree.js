import fs from "fs/promises";
import path from "path";
import { minimatch } from "minimatch";
import validatePath from "./validatePath.js";

export default async function buildTree(currentPath, rootPath, excludePatterns = []) {
    const validPath = await validatePath(currentPath);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));
        const shouldExclude = excludePatterns.some(pattern => {
            if (pattern.includes('*')) {
                return minimatch(relativePath, pattern, { dot: true });
            }
            return minimatch(relativePath, pattern, { dot: true }) ||
                minimatch(relativePath, `**/${pattern}`, { dot: true }) ||
                minimatch(relativePath, `**/${pattern}/**`, { dot: true });
        });
        if (shouldExclude)
            continue;
        const entryData = {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
        };
        if (entry.isDirectory()) {
            const subPath = path.join(currentPath, entry.name);
            entryData.children = await buildTree(subPath, rootPath, excludePatterns);
        }
        result.push(entryData);
    }
    return result;
}
