# codemirror-theme

Mozart-tuned CodeMirror 6 themes. Exports `mozartLightTheme` and
`mozartDarkTheme` as `Extension` arrays — drop them straight into an
`EditorView` extension list. Each bundles the `EditorView.theme`
styling and a matching highlight style.

Visual targets:

- Light bg = white; gutter `text-muted-foreground` faint.
- Current line `bg-foreground/5`.
- Selection `bg-blue-400/20`.
- Comments muted; keywords / types tinted to match the Mozart brand.

Stays library-pure — no Angular, no DOM access, no service. Importable
from either the desktop app or `apps/sandbox`.
