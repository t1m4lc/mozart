---
title: Files to copy
description: Configure which gitignored files Conductor copies into new workspaces
url: /docs/reference/files-to-copy
site: www.conductor.build
---

# Files to copy



"Files to copy" lets you specify [glob patterns](https://code.visualstudio.com/docs/editor/glob-patterns) that are automatically copied into each new workspace. Patterns are configured per repo in Settings -> \[repo name].

The default pattern is `.env*`.

To share these patterns across a team, commit a [`.worktreeinclude`](#resolution-order) file at the repo root instead of configuring them per machine in settings.




## Resolution order [#resolution-order]

The patterns used for a given repo come from the first source that exists:

1. **`.worktreeinclude`** at the repo root or on remote. If present, the file's contents win and the settings UI shows a read-only preview.
2. **Repo settings** (`Settings → {repo name} → Files to copy`), stored in the local DB.

For team-shared patterns, commit a `.worktreeinclude` file at the repo root.

## Pattern format [#pattern-format]

Patterns use [`.gitignore` syntax](https://git-scm.com/docs/gitignore) via the [`ignore`](https://www.npmjs.com/package/ignore) library, including negation.

Example:

```txt
.env
.env.*
config/local.json
!*.example
```

* `#` starts a comment.
* `!` negates a previous match.
* Trailing `/` matches a directory only.
* Leading `/` anchors to the repo root.

 
