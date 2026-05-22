import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideClipboardCopy,
  lucideEye,
  lucideTrash2,
} from '@ng-icons/lucide';
import { RepositoriesFacade } from './data/repositories.facade';

// Context menu surfaced on right-click of a row in the Changes tab.
// Item order is locked by product (P2.5): View / Staged / --- / Copy
// path / --- / Discard changes. The Staged toggle reads the file's
// index state via `RepositoriesFacade.isStaged` each time the menu
// opens — we never cache it inside the menu so the ✓ always reflects
// the current git state, even after a parallel `git add` from the
// terminal.
@Component({
  selector: 'app-ui-changes-context-menu',
  imports: [NgIcon, HlmDropdownMenuImports, HlmIconImports],
  providers: [
    provideIcons({
      lucideCheck,
      lucideClipboardCopy,
      lucideEye,
      lucideTrash2,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <hlm-dropdown-menu class="w-52">
      <hlm-dropdown-menu-group>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="view.emit()"
        >
          <ng-icon hlm name="lucideEye" size="xs" /> View
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="toggleStaged.emit()"
        >
          @if (staged()) {
            <ng-icon hlm name="lucideCheck" size="xs" />
          } @else {
            <!-- Reserve the icon slot so labels align whether or not
                 the ✓ is showing — matches the alignment in the
                 workspace status sub-menu. -->
            <span class="inline-block size-3"></span>
          }
          Staged
        </button>
      </hlm-dropdown-menu-group>
      <hlm-dropdown-menu-separator />
      <hlm-dropdown-menu-group>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="copyPath.emit()"
        >
          <ng-icon hlm name="lucideClipboardCopy" size="xs" /> Copy path
        </button>
      </hlm-dropdown-menu-group>
      <hlm-dropdown-menu-separator />
      <hlm-dropdown-menu-group>
        <button
          hlmDropdownMenuItem
          type="button"
          variant="destructive"
          class="cursor-pointer"
          (triggered)="discardChanges.emit()"
        >
          <ng-icon hlm name="lucideTrash2" size="xs" /> Discard changes
        </button>
      </hlm-dropdown-menu-group>
    </hlm-dropdown-menu>
  `,
})
export class UiChangesContextMenu {
  readonly workspaceId = input.required<string>();
  readonly path = input.required<string>();

  readonly view = output<void>();
  readonly toggleStaged = output<void>();
  readonly copyPath = output<void>();
  readonly discardChanges = output<void>();

  private readonly repos = inject(RepositoriesFacade);
  protected readonly staged = signal(false);

  constructor() {
    // The context-menu trigger instantiates the template on each
    // right-click, so this effect runs once per opening and refreshes
    // the ✓ against the current git index. We swallow errors — a
    // failed `is_staged` shouldn't break menu rendering; the worst
    // case is the ✓ stays off.
    effect(() => {
      const id = this.workspaceId();
      const p = this.path();
      void this.repos
        .isStaged(id, p)
        .then((s) => {
          if (this.workspaceId() === id && this.path() === p) {
            this.staged.set(s);
          }
        })
        .catch((err) => {
          console.warn('[changes-ctxmenu] is_staged failed:', err);
        });
    });
  }
}
