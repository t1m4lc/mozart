import { ChangeDetectionStrategy, Component } from '@angular/core';

// Generic shell top-bar layout primitive. Owns the chrome the three
// panes share at the top of the viewport:
//   - h-10 height (aligns with shell-left + shell-right headers)
//   - bg-sidebar surface + border-b separator
//   - flex row, gap-1, items-center
//   - tauri drag region (so the user can drag the window from here;
//     interactive children opt out via `data-tauri-drag-region="false"`)
//
// Pure layout — content is projected via <ng-content>. Domain-specific
// toolbars (e.g. `app-workspace-toolbar`) compose this primitive
// instead of re-deriving the chrome classes.
@Component({
  selector: 'app-shell-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex h-10 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar px-1',
    // Non-empty value: Angular's host attribute binding can drop empty
    // strings in some setups, leaving Tauri's drag-region hook without
    // the attribute to walk back from on mousedown. Any truthy value
    // satisfies Tauri's `[data-tauri-drag-region]` matcher.
    'data-tauri-drag-region': 'true',
  },
  template: `<ng-content />`,
})
export class ShellTopBar {}
