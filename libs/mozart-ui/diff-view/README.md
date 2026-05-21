# diff-view

Unified-diff renderer for a single file. Parses the diff text, builds
hunks with surrounding gaps, and renders rows with marker columns and
hunk-expand bars. Optionally fetches extra context lines through a
caller-supplied `FetchContextLines` callback.

The card chrome (path, copy, expand-all, status badge, stats) lives in
`@mozart-ui/file-diff-card`. This component is the diff body only.
