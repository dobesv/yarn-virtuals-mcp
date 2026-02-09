import { existsSync } from "fs";
import { resolve, dirname, join } from "path";

export default function findYarnRoot(startDir = process.cwd()) {
    let dir = resolve(startDir);
    while (true) {
        if (existsSync(join(dir, '.pnp.cjs'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}
