import { promises as fs } from "fs";
import parseRootUri from "./parseRootUri.js";

export default async function getValidRootDirectories(requestedRoots) {
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
