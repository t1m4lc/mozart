---
title: Security and permissions
description: How local execution, tool approvals, macOS permissions, and network traffic work
url: /docs/reference/security-and-permissions
site: www.conductor.build
---

# Security and permissions



Conductor runs agents on your Mac. Agents use your local environment and can interact with files, terminals, and tools that your user account can access.

## Local execution [#local-execution]

Conductor is a Mac app, not a hosted IDE. Your workspaces, chats, and repository files are stored locally unless a connected provider or integration receives data as part of a request.

## Agent permissions [#agent-permissions]

Agents can read and write files, run commands, and use configured tools. Some tool calls may ask for approval before the agent continues.

Use approvals when you want to review actions such as shell commands, file changes, MCP tool use, web fetches, or other tool access before they run.

## macOS permission prompts [#macos-permission-prompts]

macOS may show a permission prompt when an agent or shell command tries to access a protected folder such as Downloads, Desktop, or Reminders. The prompt may name Conductor because Conductor is the app launching the process.

Approve only access you expect the task to need.

## Network traffic [#network-traffic]

Model requests go to your model provider. By default, this is Anthropic for Claude Code. If you configure another provider, traffic goes to that provider.

For provider setup, see [Configure model providers](/docs/guides/providers).

## Enterprise data privacy [#enterprise-data-privacy]

Enterprise data privacy disables features that require external AI providers, such as AI-generated chat titles and custom MCP servers.

You can enable it in:

* `Settings` -> `Privacy` for your machine
* `enterpriseDataPrivacy` in [`conductor.json`](/docs/reference/conductor-json) for a repository

 
