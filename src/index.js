#!/usr/bin/env node

// Auto-bootstrap Yarn PnP if not already active.
// Searches upward from cwd to find .pnp.cjs (supports monorepo subdirectories).
import findYarnRoot from "./findYarnRoot.js";
import { createRequire as _createRequire } from "module";
import { join as _join } from "path";
const yarnRoot = findYarnRoot();
if (!yarnRoot) {
    console.error("Error: Could not find .pnp.cjs — are you inside a Yarn PnP project?");
    process.exit(1);
}
if (!process.versions.pnp) {
    const _require = _createRequire(import.meta.url);
    _require(_join(yarnRoot, '.pnp.cjs')).setup();
    console.error("yarn-virtuals-mcp: Loaded Yarn PnP from " + _join(yarnRoot, '.pnp.cjs'));
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createRequire } from "module";
import path from "path";
import { z } from "zod";
import normalizePath from "./normalizePath.js";
import { setAllowedDirectories } from "./allowedDirectories.js";
import validatePath from "./validatePath.js";
import getFileStats from "./getFileStats.js";
import readFileContent from "./readFileContent.js";
import readFileLines from "./readFileLines.js";
import searchFilesWithValidation from "./searchFilesWithValidation.js";
import tailFile from "./tailFile.js";
import headFile from "./headFile.js";
import findWorkspaceDir from "./findWorkspaceDir.js";
import findPackageRoot from "./findPackageRoot.js";
import buildTree from "./buildTree.js";
import updateAllowedDirectoriesFromRoots from "./updateAllowedDirectoriesFromRoots.js";

// Auto-discover allowed directory from Yarn workspace root
const allowedDirectories = [normalizePath(yarnRoot)];
setAllowedDirectories(allowedDirectories);
console.error("yarn-virtuals-mcp: Allowed directory: " + yarnRoot);

// Server setup
const server = new McpServer({
    name: "yarn-virtuals-mcp",
    version: "1.0.0",
});

// --- yarn_resolve_package tool ---
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

server.registerTool("yarn_read_file", {
    title: "Read File (Yarn PnP)",
    description: "Read a file from a Yarn PnP virtual path (inside .yarn/cache zip archives or __virtual__ directories). " +
        "Use this for paths returned by yarn_resolve_package. For normal filesystem files, use your built-in file reading tools instead. " +
        "Supports 'head' and 'tail' parameters to read partial files, or 'startLine'/'endLine' to read a specific line range (1-based, inclusive).",
    inputSchema: {
        path: z.string().describe("Absolute path to the file (typically from yarn_resolve_package output)"),
        tail: z.number().optional().describe("If provided, returns only the last N lines of the file"),
        head: z.number().optional().describe("If provided, returns only the first N lines of the file"),
        startLine: z.number().optional().describe("If provided with endLine, returns lines from startLine to endLine (1-based, inclusive)"),
        endLine: z.number().optional().describe("If provided with startLine, returns lines from startLine to endLine (1-based, inclusive)")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const modes = [args.head, args.tail, args.startLine || args.endLine].filter(Boolean);
    if (modes.length > 1) {
        throw new Error("Cannot combine head, tail, and startLine/endLine parameters");
    }
    let content;
    if (args.startLine != null && args.endLine != null) {
        content = await readFileLines(validPath, args.startLine, args.endLine);
    }
    else if (args.startLine != null || args.endLine != null) {
        throw new Error("Both startLine and endLine must be provided together");
    }
    else if (args.tail) {
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
});

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
    const treeData = await buildTree(args.path, args.path, args.excludePatterns);
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

// Handle MCP roots notifications
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
        }
        catch (error) {
            console.error("Failed to request initial roots from client:", error instanceof Error ? error.message : String(error));
        }
    }
};

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("yarn-virtuals-mcp server running on stdio");
