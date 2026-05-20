# code-editor

`<mz-code-editor>` — a thin Angular wrapper over a CodeMirror 6
`EditorView`. Standalone component, signal-input API, no domain
imports.

Inputs:

- `value` — string buffer. External writes update the view only when
  the value differs from the editor's current content, so local dirty
  edits are not overwritten.
- `language` — language id (`typescript`, `javascript`, `json`, `css`,
  `html`, `markdown`, `rust`, or `text`). Unknown ids fall back to
  plain text.
- `readOnly` — boolean; disables editing.
- `theme` — `'light' | 'dark'`; defaults to `light`.

Outputs:

- `valueChange` — emitted after the user stops typing for ~150ms
  (debounced via `requestIdleCallback` fallback to `setTimeout`).

The editor is rendered into a `viewChild`-resolved host div and torn
down on `DestroyRef`. P2.1 uses it for Edit mode; future atoms can
reuse the same component for diff merge or in-place review editors.
