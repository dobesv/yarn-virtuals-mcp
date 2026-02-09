import path from "path";
import { readFileSync } from "fs";

export default function findPackageRoot(entryPoint) {
    // First, try to find package root from node_modules path structure.
    // Yarn PnP virtual paths contain node_modules segments like:
    //   .yarn/__virtual__/.../node_modules/@scope/pkg/dist/index.js
    const parts = entryPoint.split(path.sep);
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i] === 'node_modules' && i + 1 < parts.length) {
            // Scoped package: node_modules/@scope/pkg
            if (parts[i + 1].startsWith('@') && i + 2 < parts.length) {
                return parts.slice(0, i + 3).join(path.sep);
            }
            // Regular package: node_modules/pkg
            return parts.slice(0, i + 2).join(path.sep);
        }
    }
    // Fallback: walk up looking for package.json using the fs module
    // (use fs import which may be PnP-patched at runtime)
    let dir = path.dirname(entryPoint);
    while (dir !== path.dirname(dir)) {
        try {
            readFileSync(path.join(dir, 'package.json'));
            return dir;
        } catch {}
        dir = path.dirname(dir);
    }
    return path.dirname(entryPoint);
}
