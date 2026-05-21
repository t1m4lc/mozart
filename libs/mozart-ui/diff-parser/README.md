# diff-parser

Pure-TS parser for unified-diff text. Maps each line to a tagged
`DiffLine` and groups bodies into `DiffHunk`s so diff renderers can
assign styling and draw expand bars without re-scanning the text.

Exports `parseGroupedDiff` (preamble + hunks) and a back-compatible
flat `parseUnifiedDiff` view.
