import fs from "fs/promises";
import path from "path";
import normalizePath from "./normalizePath.js";
import expandHome from "./expandHome.js";
import isPathWithinAllowedDirectories from "./isPathWithinAllowedDirectories.js";
import getAllowedDirectories from "./allowedDirectories.js";

export default async function validatePath(requestedPath) {
    const allowedDirectories = getAllowedDirectories();
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
