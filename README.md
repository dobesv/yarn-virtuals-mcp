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

All tools are **read-only** and restricted to the auto-discovered Yarn workspace root.

## Installation

No install needed. Run directly using `yarn dlx`:

```bash
yarn dlx @dobesv/yarn-virtuals-mcp
```

The server automatically finds `.pnp.cjs` by searching upward from the current directory and uses the Yarn workspace root as the allowed directory.

## Setup

### Claude Code

Add as a user-level MCP server:

```bash
claude mcp add --transport stdio --scope user yarn-virtuals-mcp -- yarn dlx @dobesv/yarn-virtuals-mcp
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "yarn-virtuals-mcp": {
      "command": "yarn",
      "args": ["dlx", "@dobesv/yarn-virtuals-mcp"]
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
      "command": "yarn",
      "args": ["dlx", "@dobesv/yarn-virtuals-mcp"]
    }
  }
}
```

### Generic MCP Client

Run the server on stdio from within any Yarn PnP project:

```bash
yarn dlx @dobesv/yarn-virtuals-mcp
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
1. Auto-discovers the Yarn workspace root by searching upward for `.pnp.cjs`
2. Loads `.pnp.cjs` automatically if not already in a Yarn PnP environment
3. Uses `createRequire()` to resolve packages through Yarn's module resolution
4. Provides MCP filesystem tools that work with the PnP-patched `fs`

## Auto-Allow in Claude Code

Since all tools are read-only, you can auto-allow them so Claude never prompts for permission:

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak
jq '.permissions.allow = ((.permissions.allow // []) + ["mcp__yarn-virtuals-mcp__*"] | unique)' \
  ~/.claude/settings.json.bak > ~/.claude/settings.json
```

## License

MIT
