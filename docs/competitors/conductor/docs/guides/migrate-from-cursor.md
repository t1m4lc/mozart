---
title: Work with Cursor and VS Code
description: Open Conductor workspaces in Cursor or VS Code, and bring Cursor MCP servers and rules into Conductor
url: /docs/guides/migrate-from-cursor
site: www.conductor.build
---

# Work with Cursor and VS Code



Use this guide when you want to open Conductor workspaces in Cursor, keep Cursor windows easy to identify, or migrate Cursor MCP servers and rules into Conductor.

## Open workspaces in Cursor or VS Code [#open-workspaces-in-cursor-or-vs-code]

From a workspace, click `Open In` or press Command + O to open the workspace directory in Cursor or VS Code.

If the workspace is already open, Conductor focuses the existing editor window.

## Name Cursor windows by branch [#name-cursor-windows-by-branch]

When several workspaces are open in Cursor, use the window title to show the branch and workspace name.

1. In Cursor, open User Settings with Command + Shift + P, then choose `Preferences: Open User Settings`.
2. Search for `window.title`.
3. Set it to:

```text
${activeRepositoryBranchName}${separator}${rootName}${separator}${profileName}
```

Cursor will show the branch name in the title bar, like:

```text
my-feature — tokyo
```

## Migrate MCP servers [#migrate-mcp-servers]

Cursor stores MCP config in `~/.cursor/mcp.json` (global) and `.cursor/mcp.json` (project-level). Conductor uses Claude Code's MCP config.

### Global MCP servers [#global-mcp-servers]

Copy your servers from `~/.cursor/mcp.json` into `~/.claude.json`:

Cursor (~/.cursor/mcp.json)

Conductor (~/.claude.json)

```json
{
    "mcpServers": {
        "context7": {
            "command": "npx",
            "args": ["-y", "@upstash/context7-mcp"]
        }
    }
}
```

```json
{
    "mcpServers": {
        "context7": {
            "command": "npx",
            "args": ["-y", "@upstash/context7-mcp"]
        }
    }
}
```

The format is the same. Copy the `mcpServers` object into `~/.claude.json`.

### Project-level MCP servers [#project-level-mcp-servers]

Copy from `.cursor/mcp.json` to `.mcp.json` in your project root:

Cursor (.cursor/mcp.json)

Conductor (.mcp.json)

```json
{
    "mcpServers": {
        "my-project-server": {
            "command": "node",
            "args": ["./tools/mcp-server.js"]
        }
    }
}
```

```json
{
    "mcpServers": {
        "my-project-server": {
            "command": "node",
            "args": ["./tools/mcp-server.js"]
        }
    }
}
```

You can also add MCPs from inside Conductor. See [MCP docs](/docs/reference/mcp) for more.

## Migrate rules and instructions [#migrate-rules-and-instructions]

Cursor uses `.cursorrules` or `.cursor/rules/*.mdc` files for custom instructions. In Conductor, the equivalent is `CLAUDE.md`.

### .cursorrules [#cursorrules]

Copy the contents of your `.cursorrules` file into a `CLAUDE.md` file at the root of your project:

```bash
cp .cursorrules CLAUDE.md
```

### .cursor/rules/\*.mdc [#cursorrulesmdc]

`.mdc` files have YAML frontmatter that you'll want to strip. Copy just the markdown body into `CLAUDE.md`:

```bash
for f in .cursor/rules/*.mdc; do
  echo "" >> CLAUDE.md
  # Strip frontmatter (content between --- markers)
  sed '1{/^---$/!q;};1,/^---$/d' "$f" >> CLAUDE.md
done
```

### Global instructions [#global-instructions]

Cursor's global AI rules map to `~/.claude/CLAUDE.md`, which applies to all projects:

```bash
# Create global instructions
mkdir -p ~/.claude
echo "Your global instructions here" > ~/.claude/CLAUDE.md
```

## Use the migration script [#use-the-migration-script]

We've published a script that automates all of the above. It handles global and project-level MCP servers, `.cursorrules`, and `.mdc` rule files.

```bash
curl -fsSL https://gist.githubusercontent.com/cbh123/4187d4c6774a557b26ed6bcf054f42e2/raw/migrate-cursor-to-conductor.sh | bash
```

Or to preview what it would do without making changes:

```bash
curl -fsSL https://gist.githubusercontent.com/cbh123/4187d4c6774a557b26ed6bcf054f42e2/raw/migrate-cursor-to-conductor.sh -o migrate.sh
chmod +x migrate.sh
./migrate.sh --dry-run
```

The script won't overwrite existing MCP servers or CLAUDE.md content — it
only appends.

## Quick reference [#quick-reference]

| Cursor | Conductor / Claude Code | Codex |
| --- | --- | --- |
| `~/.cursor/mcp.json` | `~/.claude.json` | `~/.codex/config.toml` |
| `.cursor/mcp.json` | `.mcp.json` | `.codex/config.toml` |
| `.cursorrules` | `CLAUDE.md` | `AGENTS.md` |
| `.cursor/rules/*.mdc` | `CLAUDE.md` | `AGENTS.md` |
| Global AI rules | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` |

 
