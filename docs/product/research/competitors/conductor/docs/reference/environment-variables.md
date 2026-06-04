---
title: Conductor environment variables
description: Variables available to terminals and scripts in a workspace
url: /docs/reference/environment-variables
site: www.conductor.build
---

# Conductor environment variables



Conductor makes these environment variables available in workspace terminals and [scripts](/docs/reference/scripts).

| Variable | Description |
| --- | --- |
| `CONDUCTOR_WORKSPACE_NAME` | Workspace name |
| `CONDUCTOR_WORKSPACE_PATH` | Workspace path |
| `CONDUCTOR_ROOT_PATH` | Path to the repository root directory |
| `CONDUCTOR_DEFAULT_BRANCH` | Name of the default branch, usually `main` |
| `CONDUCTOR_PORT` | First port in a range of 10 ports assigned to the workspace |

## Common uses [#common-uses]

Use `CONDUCTOR_ROOT_PATH` when a setup script needs a file from the repository root:

```bash
ln -s "$CONDUCTOR_ROOT_PATH/.env" .env
```

Use `CONDUCTOR_PORT` when multiple workspaces need to run the same app without port conflicts:

```bash
npm run dev -- --port "$CONDUCTOR_PORT"
```

For script behavior, see [Scripts](/docs/reference/scripts).

 
