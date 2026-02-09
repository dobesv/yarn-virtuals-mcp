#!/usr/bin/env node

// Auto-bootstrap Yarn PnP if not already active.
// This allows `npx yarn-virtuals-mcp .` to work without `yarn node`.
// Searches upward from cwd to find .pnp.cjs (supports monorepo subdirectories).
import { existsSync as _existsSync } from "fs";
import { resolve as _resolve, dirname as _dirname, join as _join } from "path";
import { createRequire as _createRequire } from "module";
if (!process.versions.pnp) {
    let _dir = _resolve(process.cwd());
    while (true) {
        const _candidate = _join(_dir, '.pnp.cjs');
        if (_existsSync(_candidate)) {
            const _require = _createRequire(import.meta.url);
            _require(_candidate).setup();
            console.error("yarn-virtuals-mcp: Loaded Yarn PnP from " + _candidate);
            break;
        }
        const _parent = _dirname(_dir);
        if (_parent === _dir) break;
        _dir = _parent;
    }
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RootsListChangedNotificationSchema, } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream, readFileSync, existsSync } from "fs";
import { createRequire } from "module";
import { execSync } from "child_process";
import path from "path";
import { z } from "zod";
import { minimatch } from "minimatch";
import { normalizePath, expandHome } from './path-utils.js';
import { getValidRootDirectories } from './roots-utils.js';
import {
    formatSize, validatePath, getFileStats, readFileContent,
    searchFilesWithValidation, tailFile, headFile, setAllowedDirectories,
} from './lib.js';

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Usage: yarn-virtuals-mcp [allowed-directory] [additional-directories...]");
    console.error("Note: This server must be run via 'yarn node' to access Yarn PnP virtual paths.");
}

// Store allowed directories in normalized and resolved form
let allowedDirectories = await Promise.all(args.map(async (dir) => {
    const expanded = expandHome(dir);
    const absolute = path.resolve(expanded);
    try {
        const resolved = await fs.realpath(absolute);
        return normalizePath(resolved);
    }
    catch (error) {
        return normalizePath(absolute);
    }
}));

// Validate that all directories exist and are accessible
await Promise.all(allowedDirectories.map(async (dir) => {
    try {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) {
            console.error(`Error: ${dir} is not a directory`);
            process.exit(1);
        }
    }
    catch (error) {
        console.error(`Error accessing directory ${dir}:`, error);
        process.exit(1);
    }
}));

setAllowedDirectories(allowedDirectories);

// Server setup
const server = new McpServer({
    name: "yarn-virtuals-mcp",
    version: "1.0.0",
});

// --- yarn_resolve_package tool ---
function findWorkspaceDir(workspaceName) {
    const out = execSync('yarn workspaces list --json', { encoding: 'utf8', cwd: process.cwd(), timeout: 10000 });
    for (const line of out.trim().split('\n')) {
        const ws = JSON.parse(line);
        if (ws.name === workspaceName) return path.resolve(process.cwd(), ws.location);
    }
    const direct = path.resolve(process.cwd(), workspaceName);
    if (existsSync(direct)) return direct;
    throw new Error(`Workspace not found: ${workspaceName}`);
}

function findPackageRoot(entryPoint) {
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

server.registerTool("yarn_resolve_package", {
    title: "Resolve Yarn Package",
    description: "Resolve an npm package name to its filesystem path in the Yarn PnP virtual filesystem. " +
        "Returns the entry point, package root directory, name, version, and description. " +
        "Use the returned packageRoot with the other yarn_* tools to browse the package source code.",
    inputSchema: {
        package: z.string().describe('Package name, e.g. "@google/genai" or "lodash"'),
        workspace: z.string().optional().describe('Optional workspace name to resolve from, e.g. "@myapp/server"')
    },
    outputSchema: {
        entryPoint: z.string(),
        packageRoot: z.string(),
        name: z.string(),
        version: z.string(),
        description: z.string()
    },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const from = args.workspace ? findWorkspaceDir(args.workspace) : process.cwd();
    const req = createRequire(path.join(from, 'package.json'));
    let entry;
    try {
        entry = req.resolve(args.package);
    } catch {
        try {
            entry = path.dirname(req.resolve(args.package + '/package.json'));
        } catch (e) {
            throw new Error(`Cannot resolve "${args.package}" from "${from}": ${e.message}`);
        }
    }
    const root = findPackageRoot(entry);
    let info = {};
    try { info = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); } catch {}
    const result = {
        entryPoint: entry,
        packageRoot: root,
        name: info.name || args.package,
        version: info.version || 'unknown',
        description: info.description || ''
    };
    const text = JSON.stringify(result, null, 2);
    return {
        content: [{ type: "text", text }],
        structuredContent: result
    };
});

// --- Read-only filesystem tools for Yarn PnP virtual paths ---

const readTextFileHandler = async (args) => {
    const validPath = await validatePath(args.path);
    if (args.head && args.tail) {
        throw new Error("Cannot specify both head and tail parameters simultaneously");
    }
    let content;
    if (args.tail) {
        content = await tailFile(validPath, args.tail);
    }
    else if (args.head) {
        content = await headFile(validPath, args.head);
    }
    else {
        content = await readFileContent(validPath);
    }
    return {
        content: [{ type: "text", text: content }],
        structuredContent: { content }
    };
};

server.registerTool("yarn_read_file", {
    title: "Read File (Yarn PnP)",
    description: "Read a file from a Yarn PnP virtual path (inside .yarn/cache zip archives or __virtual__ directories). " +
        "Use this for paths returned by yarn_resolve_package. For normal filesystem files, use your built-in file reading tools instead. " +
        "Supports 'head' and 'tail' parameters to read partial files.",
    inputSchema: {
        path: z.string().describe("Absolute path to the file (typically from yarn_resolve_package output)"),
        tail: z.number().optional().describe("If provided, returns only the last N lines of the file"),
        head: z.number().optional().describe("If provided, returns only the first N lines of the file")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, readTextFileHandler);

server.registerTool("yarn_read_multiple_files", {
    title: "Read Multiple Files (Yarn PnP)",
    description: "Read multiple files from Yarn PnP virtual paths simultaneously. " +
        "More efficient than reading files one by one. Use for paths from yarn_resolve_package.",
    inputSchema: {
        paths: z.array(z.string())
            .min(1)
            .describe("Array of absolute file paths to read (typically from yarn_resolve_package output)")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const results = await Promise.all(args.paths.map(async (filePath) => {
        try {
            const validPath = await validatePath(filePath);
            const content = await readFileContent(validPath);
            return `${filePath}:\n${content}\n`;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `${filePath}: Error - ${errorMessage}`;
        }
    }));
    const text = results.join("\n---\n");
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});

server.registerTool("yarn_list_directory", {
    title: "List Directory (Yarn PnP)",
    description: "List files and directories at a Yarn PnP virtual path. " +
        "Results have [FILE] and [DIR] prefixes. Use for paths from yarn_resolve_package.",
    inputSchema: {
        path: z.string().describe("Absolute path to the directory (typically from yarn_resolve_package output)")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const formatted = entries
        .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
        .join("\n");
    return {
        content: [{ type: "text", text: formatted }],
        structuredContent: { content: formatted }
    };
});

server.registerTool("yarn_directory_tree", {
    title: "Directory Tree (Yarn PnP)",
    description: "Get a recursive tree view of a Yarn PnP virtual directory as JSON. " +
        "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
        "Use for paths from yarn_resolve_package.",
    inputSchema: {
        path: z.string().describe("Absolute path to the directory (typically from yarn_resolve_package output)"),
        excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const rootPath = args.path;
    async function buildTree(currentPath, excludePatterns = []) {
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
                entryData.children = await buildTree(subPath, excludePatterns);
            }
            result.push(entryData);
        }
        return result;
    }
    const treeData = await buildTree(rootPath, args.excludePatterns);
    const text = JSON.stringify(treeData, null, 2);
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});

server.registerTool("yarn_search_files", {
    title: "Search Files (Yarn PnP)",
    description: "Recursively search for files matching a glob pattern within a Yarn PnP virtual path. " +
        "Returns full paths to matching items. Use for paths from yarn_resolve_package.",
    inputSchema: {
        path: z.string().describe("Absolute path to search within (typically from yarn_resolve_package output)"),
        pattern: z.string().describe("Glob pattern, e.g. '**/*.d.ts' or '**/*.js'"),
        excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const results = await searchFilesWithValidation(validPath, args.pattern, allowedDirectories, { excludePatterns: args.excludePatterns });
    const text = results.length > 0 ? results.join("\n") : "No matches found";
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});

server.registerTool("yarn_get_file_info", {
    title: "Get File Info (Yarn PnP)",
    description: "Get metadata (size, timestamps, permissions) for a file at a Yarn PnP virtual path. " +
        "Use for paths from yarn_resolve_package.",
    inputSchema: {
        path: z.string().describe("Absolute path to the file (typically from yarn_resolve_package output)")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const info = await getFileStats(validPath);
    const text = Object.entries(info)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});

// Updates allowed directories based on MCP client roots
async function updateAllowedDirectoriesFromRoots(requestedRoots) {
    const validatedRootDirs = await getValidRootDirectories(requestedRoots);
    if (validatedRootDirs.length > 0) {
        allowedDirectories = [...validatedRootDirs];
        setAllowedDirectories(allowedDirectories);
        console.error(`Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`);
    }
    else {
        console.error("No valid root directories provided by client");
    }
}

server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    try {
        const response = await server.server.listRoots();
        if (response && 'roots' in response) {
            await updateAllowedDirectoriesFromRoots(response.roots);
        }
    }
    catch (error) {
        console.error("Failed to request roots from client:", error instanceof Error ? error.message : String(error));
    }
});

server.server.oninitialized = async () => {
    const clientCapabilities = server.server.getClientCapabilities();
    if (clientCapabilities?.roots) {
        try {
            const response = await server.server.listRoots();
            if (response && 'roots' in response) {
                await updateAllowedDirectoriesFromRoots(response.roots);
            }
            else {
                console.error("Client returned no roots set, keeping current settings");
            }
        }
        catch (error) {
            console.error("Failed to request initial roots from client:", error instanceof Error ? error.message : String(error));
        }
    }
    else {
        if (allowedDirectories.length > 0) {
            console.error("Client does not support MCP Roots, using allowed directories set from server args:", allowedDirectories);
        }
        else {
            throw new Error(`Server cannot operate: No allowed directories available. Please start with directory arguments or use a client that supports MCP roots.`);
        }
    }
};

// Start server
async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("yarn-virtuals-mcp server running on stdio");
    if (allowedDirectories.length === 0) {
        console.error("Started without allowed directories - waiting for client to provide roots via MCP protocol");
    }
}
runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
