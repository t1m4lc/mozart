# hunk-expand-bar

Single-row expand bar shown between or above/below diff hunks. Up to
two arrow buttons (`direction: 'up' | 'down' | 'both'`); shift-click
doubles the step; emits `(expand)` with `{direction, count}` so the
host renderer decides where the new context lands.

Knows nothing about hunks, parsers, or fetches — it's a dumb control.
