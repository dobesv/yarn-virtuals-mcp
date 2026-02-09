# yarn-virtuals-mcp

An MCP (Model Context Protocol) server that lets AI assistants browse source code of npm packages inside Yarn PnP projects.

Yarn Berry (v2+) with Plug'n'Play stores packages in zip archives under `.yarn/cache/`. These files are only accessible through Yarn's patched `fs` module. This MCP server runs under Yarn's PnP runtime, giving AI tools transparent read access to package source code inside those archives.

## Tools

| Tool | Description |
|------|-------------|
| `yarn_resolve_package` | Resolve a package name to its virtual filesystem path |
| `yarn_read_file` | Read a file from a Yarn PnP virtual path |
| `yarn_read_multiple_files` | Read multiple files simultaneously |
| `yarn_list_directory` | List directory contents |
| `yarn_directory_tree` | Recursive tree view as JSON |
| `yarn_search_files` | Search for files matching a glob pattern |
| `yarn_get_file_info` | Get file metadata (size, timestamps) |

All tools are **read-only** and restricted to the allowed directories passed at startup.

## Installation

### Option 1: npx (no install needed)

The server auto-detects and loads `.pnp.cjs` from the working directory, so `npx` works:

```bash
npx yarn-virtuals-mcp .
```

### Option 2: Clone and build

```bash
git clone https://github.com/dobesv/yarn-virtuals-mcp.git
cd yarn-virtuals-mcp
npm install
npm run build
```

## Setup

### Claude Code

Add as a user-level MCP server:

```bash
claude mcp add --transport stdio --scope user yarn-virtuals-mcp -- npx yarn-virtuals-mcp .
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "yarn-virtuals-mcp": {
      "command": "npx",
      "args": ["yarn-virtuals-mcp", "."]
    }
  }
}
```

### Gemini CLI

Add to your `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "yarn-virtuals-mcp": {
      "command": "npx",
      "args": ["yarn-virtuals-mcp", "."]
    }
  }
}
```

### Generic MCP Client

Run the server on stdio, passing allowed directories as arguments:

```bash
npx yarn-virtuals-mcp /path/to/your/yarn/project
```

## Usage

The typical workflow is:

1. **Resolve a package** to find where it lives:
   ```
   yarn_resolve_package({ package: "@google/genai", workspace: "@myapp/server" })
   ```
   Returns `packageRoot`, `entryPoint`, `version`, etc.

2. **Browse the source** using the returned path:
   ```
   yarn_list_directory({ path: "<packageRoot>" })
   yarn_read_file({ path: "<packageRoot>/dist/index.d.ts", head: 50 })
   yarn_search_files({ path: "<packageRoot>", pattern: "**/*.d.ts" })
   ```

## How It Works

Yarn PnP replaces `node_modules` with zip archives in `.yarn/cache/` and a runtime patch (`.pnp.cjs`) that intercepts `require`/`import` calls. Paths through `.yarn/__virtual__/` don't exist on the real filesystem - they're resolved by Yarn's patched `fs` module.

This server:
1. Loads `.pnp.cjs` automatically if not already in a Yarn PnP environment
2. Uses `createRequire()` to resolve packages through Yarn's module resolution
3. Provides MCP filesystem tools that work with the PnP-patched `fs`

## Auto-Allow in Claude Code

Since all tools are read-only, you can auto-allow them in `~/.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__yarn-virtuals-mcp__*"
    ]
  }
}
```

## License

MIT
