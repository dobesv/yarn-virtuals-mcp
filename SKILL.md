---
name: yarn-virtuals-helper
description: Use this skill when the user wants to browse, read, or explore source code of an npm dependency/package in a Yarn PnP project. Trigger phrases include "look at the source of", "browse package source", "read the source code of", "how does [package] work", "show me the code for [package]", "yarn virtual", "yarn cache source", "package internals", or when you need to understand how a third-party dependency works by reading its actual source.
---

# Browsing Dependency Source Code in Yarn PnP Projects

Yarn Berry (v2+) with PnP stores packages in zip archives under `.yarn/cache/`. These files are **only accessible through Yarn's patched `fs` module** — normal tools like `Read`, `Glob`, or `Grep` cannot read them.

## Use the yarn-virtuals-mcp MCP Server

The `yarn-virtuals-mcp` MCP server provides filesystem tools that run with Yarn PnP support, giving transparent access to virtual/zip paths. **Always prefer these MCP tools over bash commands.**

### Step 1: Resolve the package

Use `yarn_resolve_package` to find a package's location:

```
mcp__yarn-virtuals-mcp__yarn_resolve_package({ package: "@google/genai", workspace: "@formative/workflow-bot" })
```

This returns `packageRoot`, `entryPoint`, `version`, etc.

### Step 2: Browse the source

Use the yarn-specific tools with the resolved paths:

- **`mcp__yarn-virtuals-mcp__yarn_list_directory`** — list package contents
- **`mcp__yarn-virtuals-mcp__yarn_read_file`** — read source files (supports `head`/`tail` params)
- **`mcp__yarn-virtuals-mcp__yarn_read_multiple_files`** — read several files at once
- **`mcp__yarn-virtuals-mcp__yarn_directory_tree`** — recursive tree view
- **`mcp__yarn-virtuals-mcp__yarn_search_files`** — search for files matching a glob pattern
- **`mcp__yarn-virtuals-mcp__yarn_get_file_info`** — file metadata (size, timestamps)

**Important:** These tools are specifically for Yarn PnP virtual paths. For normal filesystem files, use the standard built-in tools (Read, Glob, Grep, etc.) instead.

### Example workflow

1. Resolve the package:
   `yarn_resolve_package({ package: "@google/genai", workspace: "@formative/workflow-bot" })`
   → packageRoot: `/project/.yarn/__virtual__/.../node_modules/@google/genai`

2. List its contents:
   `yarn_list_directory({ path: "<packageRoot>" })`

3. Read a specific file:
   `yarn_read_file({ path: "<packageRoot>/dist/index.d.ts", head: 50 })`

4. Search for type definitions:
   `yarn_search_files({ path: "<packageRoot>", pattern: "**/*.d.ts" })`
