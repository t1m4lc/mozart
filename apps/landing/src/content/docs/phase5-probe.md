---
description: Phase 5 probe — delete in Phase 6
order: 999
---

This file exists to validate the docs content pipeline. It will be deleted in Phase 6.

## Why this exists

Phase 5 wires up `@analogjs/content` for docs without authoring real copy. The probe proves:

- `injectContentFiles()` discovers a docs entry
- `injectContent()` resolves and renders it via `<analog-markdown>`
- the prerenderer emits `/docs/phase5-probe/index.html` into `dist/`
- the `.prose` typography reads correctly against the stone theme

### A nested heading

Some inline `code`, a [link](https://mozart.build), and a list:

1. First
2. Second
3. Third

> Block quotes render with a muted accent.
