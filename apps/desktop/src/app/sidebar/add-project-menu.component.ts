/**
 * `AddProjectMenuComponent` — the `+` button + 3-item dropdown menu
 * that replaces the deleted `AddRepoDialog`.
 *
 * Menu items:
 *   1. **Open project** — fires `FolderPickerService.openAndAddRepo()`
 *      (native OS folder picker). On selection, the path is forwarded
 *      to `ProjectStore.addRepo`. On cancellation, nothing happens.
 *   2. **Open GitHub project** — v0.2 placeholder, `disabled` with a
 *      `Coming in v0.2` tooltip.
 *   3. **Quick start** — v0.2 placeholder for the bundled demo repo,
 *      `disabled` with a `Coming in v0.2` tooltip.
 *
 * Visuals: the trigger inherits from `[hlmBtn]` with the host-set
 * variant/size inputs so each call site (sidebar strip, sidebar-empty
 * card, empty-center CTA) can dial the button down to icon-only or up
 * to a full "+ Add repository" label as needed.
 *
 * Error handling: `openAndAddRepo` may throw `MozartError` (typically
 * when the picked folder isn't a git repo). For the post-1.8b refactor
 * we log to `console.error` only — a sonner/toast integration is the
 * documented v0.2 follow-up (see `docs/TODO.md` § 5).
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmTooltipImports } from '@mozart/ui/tooltip';

import { FolderPickerService } from '../services/folder-picker.service';

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'icon-xs';

@Component({
  selector: 'app-add-project-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmTooltipImports,
  ],
  template: `
    <button
      hlmBtn
      type="button"
      class="trigger-btn"
      [variant]="variant()"
      [size]="size()"
      [hlmDropdownMenuTrigger]="menu"
      [attr.aria-label]="ariaLabel()"
    >
      {{ label() }}
    </button>

    <ng-template #menu>
      <hlm-dropdown-menu>
        <button
          hlmDropdownMenuItem
          type="button"
          class="open-project-item"
          (click)="openProject()"
        >
          Open project
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          [hlmTooltip]="'Coming in v0.2'"
        >
          Open GitHub project
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          [hlmTooltip]="'Coming in v0.2'"
        >
          Quick start
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .trigger-btn { font-family: var(--font-sans); }
  `,
})
export class AddProjectMenuComponent {
  private readonly folderPicker = inject(FolderPickerService);

  // Visual knobs — each call site (sidebar strip, sidebar-empty card,
  // empty-center CTA) dials these to match its surrounding design.
  readonly variant = input<ButtonVariant>('ghost');
  readonly size = input<ButtonSize>('icon-xs');
  readonly label = input<string>('+');
  readonly ariaLabel = input<string>('Add project');

  protected openProject(): void {
    void this.folderPicker.openAndAddRepo().catch((err) => {
      // Sonner/toast UI is out of scope for the post-1.8b refactor;
      // surface the error on the dev console so it isn't silent. The
      // follow-up to render this as a toast is tracked in TODO.md as
      // part of the F7/F8 v0.2 menu work.
      console.error('[AddProjectMenu] open project failed:', err);
    });
  }
}
