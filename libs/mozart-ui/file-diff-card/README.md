# file-diff-card

A single-file diff card: collapsible header (path, copy, expand-all,
stats, status badge) plus a body that mounts `@mozart-ui/diff-view` for
textual statuses or a placeholder for binary / too-large / no-diff /
renamed.

GitHub-PR inspired. Building block for review surfaces — the card is a
unit; rendering a list of cards is the caller's job.

Status branches:

- `modified` / `added` / `deleted` / `renamed` — mount diff body.
- `binary` — "Binary file changed" placeholder.
- `too-large` — placeholder with a "Show anyway" button (caller decides
  what to do; emits `showAnyway`).
- `no-diff` — "No textual changes" placeholder.

Renamed files render `oldPath → path` in the header when both are
present and different; otherwise the single `path`.

The path-header chrome lives here, not inside `@mozart-ui/diff-view` —
the diff view is body-only and reusable standalone (preview, snippet
renderers, etc.).
