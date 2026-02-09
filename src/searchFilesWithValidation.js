import fs from "fs/promises";
import path from "path";
import { minimatch } from "minimatch";
import validatePath from "./validatePath.js";

export default async function searchFilesWithValidation(rootPath, pattern, allowedDirectories, options = {}) {
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
