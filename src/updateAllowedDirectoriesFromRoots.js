import getValidRootDirectories from "./getValidRootDirectories.js";
import { setAllowedDirectories } from "./allowedDirectories.js";

export default async function updateAllowedDirectoriesFromRoots(requestedRoots) {
    const validatedRootDirs = await getValidRootDirectories(requestedRoots);
    if (validatedRootDirs.length > 0) {
        setAllowedDirectories(validatedRootDirs);
        console.error(`Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`);
    }
    else {
        console.error("No valid root directories provided by client");
    }
}
