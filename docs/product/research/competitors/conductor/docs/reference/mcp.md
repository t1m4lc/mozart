---
title: MCP
description: Connect agents to external tools and data sources
url: /docs/reference/mcp
site: www.conductor.build
---

# MCP



Conductor can connect agents to external tools and data sources through the Model Context Protocol (MCP). MCP servers can expose tools, databases, APIs, and other context to agents.

Learn more about MCP in the [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp) and the [Codex MCP docs](https://developers.openai.com/codex/mcp).

## Add an MCP server [#add-an-mcp-server]

### Claude Code [#claude-code]

Add an MCP server for Claude Code with the Claude Code CLI:

```bash
claude mcp add <server-name> -s user -- <command> [args...]
```

For example, add Context7 for documentation search:

```bash
claude mcp add context7 -s user -- npx -y @upstash/context7-mcp
```

### Codex [#codex]

Add an MCP server for Codex with the Codex CLI:

```bash
codex mcp add <server-name> -- <command> [args...]
```

For example, add Context7 for documentation search:

```bash
codex mcp add context7 -- npx -y @upstash/context7-mcp
```

Codex stores MCP configuration in `~/.codex/config.toml`. The Codex CLI and IDE extension share this configuration.

You can also edit `config.toml` directly:

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
```

Codex also supports streamable HTTP MCP servers:

```bash
codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp
```

For more options, see the [Codex configuration reference](https://developers.openai.com/codex/config-reference).

## Project-level MCP servers [#project-level-mcp-servers]

If a repository has an `.mcp.json` file at its project root, Conductor agents in that workspace inherit those MCP servers.

For Codex, you can scope MCP servers to a trusted project with `.codex/config.toml`.

If you're moving project-level MCP config from Cursor, see [Work with Cursor and VS Code](/docs/guides/migrate-from-cursor).

## Good candidates [#good-candidates]

MCP works best for tools an agent needs repeatedly, such as documentation search, issue tracking, databases, and internal APIs.

Common examples include Context7 for documentation search and Linear for issue management.

## Privacy [#privacy]

MCP servers can send data to external services. Review the server you install and disable custom MCP servers when your repository requires enterprise data privacy.

 
