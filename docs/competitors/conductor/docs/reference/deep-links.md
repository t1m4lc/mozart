---
title: Deep Links
description: Open Conductor and trigger actions via conductor:// URLs
url: /docs/reference/deep-links
site: www.conductor.build
---

# Deep Links



Conductor registers the `conductor://` URL scheme. Clicking a deep link (or opening it via `open conductor://...`) will activate Conductor and trigger the corresponding action.

## Supported links [#supported-links]

### Prompt [#prompt]

```
conductor://prompt=<encoded prompt>
```

Creates a new workspace in the first available repository with the given prompt pre-filled.

### Prompt + repository path [#prompt--repository-path]

```
conductor://prompt=<encoded prompt>&path=<repo path>
```

Same as above, but targets the repository at the given path. Falls back to the first repo if the path doesn't match.

### Linear issue [#linear-issue]

```
conductor://linear_id=<issue ID>&prompt=<optional prompt>
```

Fetches the Linear issue, auto-detects the matching repository, and either navigates to an existing workspace on that issue's branch or creates a new one. Requires a connected Linear account.

### Async plan [#async-plan]

```
conductor://async?repo=<repo name>&plan=<base64 plan>
```

Creates a new workspace with a base64-encoded plan attached as a markdown file. The `repo` parameter is optional and defaults to the first repository.

## Notes [#notes]

* All parameter values should be URL-encoded.
* The generic links (`prompt`, `path`, `linear_id`) use a flat `key=value&key=value` format directly after `conductor://`, without a hostname or path.
* The `async` link uses standard URL structure with a hostname (`conductor://async?...`).

 
