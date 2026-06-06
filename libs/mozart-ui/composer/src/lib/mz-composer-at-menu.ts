import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { BrnCommand } from '@spartan-ng/brain/command';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmCommandImports } from '@spartan-ui/command';
import { HlmIconImports } from '@spartan-ui/icon';
import type { TriggerMenuContext } from '@mozart-ui/trigger-menu';

// View-model owned by the UI. `mozart-ui` is a pure UI lib and must not depend
// on `desktop-*` domain libs, so the host (feature) maps its merged file
// entries → this shape. `badge` is display-only (`open`, a git status letter,
// or absent); the tier that produced it stays in the domain layer.
export interface AtMenuFileItem {
  readonly path: string;
  /** `open` for tab files, status letter (`M`/`A`/…) for changed, else absent. */
  readonly badge?: string;
}

/**
 * Multi-select file listbox rendered inside the generic
 * `@mozart-ui/trigger-menu` overlay (the `@` trigger). Same headless-cmdk
 * (`BrnCommand`) wiring as the `/` skill menu — controlled `[search]`, forwarded
 * arrow keys drive the keyManager, focus stays in the editor — plus three
 * multi-select additions:
 *
 *   - a persistent `selected` Set keyed by path. The typed filter (`ctx.query`)
 *     and the selection are orthogonal: filtering only changes `[search]`, never
 *     `selected`, so "backspace to bare `@`, selection persists" works.
 *   - Space (forwarded by the directive only in multi mode) and click both
 *     TOGGLE the active row via cmdk's `(selected)` channel — neither closes.
 *   - Enter commits the WHOLE set (in list order, not visible-row order) via
 *     `ctx.commit`, which the directive turns into N pills at the trigger.
 *
 * The row renders a checkbox-style indicator (not an interactive `hlm-checkbox`:
 * `hlmCommandItem` is a `<button>`, and a control-in-button is invalid) — the
 * row button owns the toggle, matching Spartan's combobox-multiple pattern.
 */
@Component({
  selector: 'mz-composer-at-menu',
  imports: [HlmCommandImports, HlmBadgeImports, HlmIconImports, NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-popover text-popover-foreground w-96 overflow-hidden rounded-xl border shadow-md"
    >
      <hlm-command
        [search]="ctx().query()"
        [id]="ctx().menuId"
        role="listbox"
        aria-multiselectable="true"
        class="block"
        (mousedown)="$event.preventDefault()"
      >
        <div hlmCommandList>
          @for (item of items(); track item.path) {
            <button
              hlmCommandItem
              [value]="item.path"
              [attr.aria-selected]="_isSelected(item)"
              (selected)="_toggle(item)"
            >
              <span
                class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border"
                [class]="
                  _isSelected(item)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input'
                "
                aria-hidden="true"
              >
                @if (_isSelected(item)) {
                  <ng-icon hlm name="lucideCheck" size="12px" />
                }
              </span>
              <span class="min-w-0 flex-1 truncate text-left">
                {{ item.path }}
              </span>
              @if (item.badge) {
                <hlm-badge variant="secondary" class="shrink-0 text-[10px]">
                  {{ item.badge }}
                </hlm-badge>
              }
            </button>
          }
          <div hlmCommandEmpty *hlmCommandEmptyState>No files</div>
        </div>
      </hlm-command>
      <div
        class="text-muted-foreground flex items-center justify-between border-t px-3 py-1.5 text-xs"
      >
        <span>{{ _selectedCount() }} selected</span>
        <span>Enter to attach · Esc to cancel</span>
      </div>
    </div>
  `,
})
export class MzComposerAtMenu {
  /** Context handed down by the trigger-menu directive (multi mode). */
  readonly ctx = input.required<TriggerMenuContext>();
  /** Full flat, ranked file list; cmdk narrows by the query. */
  readonly items = input.required<readonly AtMenuFileItem[]>();

  // Selection keyed by path. Orthogonal to the query — survives filtering and
  // backspacing back to bare `@`. A new Set per toggle so OnPush + the signal
  // both see the change.
  private readonly _selected = signal<ReadonlySet<string>>(new Set());
  protected readonly _selectedCount = computed(() => this._selected().size);

  private readonly _command = viewChild.required(BrnCommand);
  private readonly _destroyRef = inject(DestroyRef);

  protected _isSelected(item: AtMenuFileItem): boolean {
    return this._selected().has(item.path);
  }

  protected _toggle(item: AtMenuFileItem): void {
    const next = new Set(this._selected());
    if (!next.delete(item.path)) next.add(item.path);
    this._selected.set(next);
  }

  constructor() {
    afterNextRender(() => {
      const km = this._command().keyManager;

      // Focus stays in the editor; the directive forwards keys here. Space and
      // click toggle the active row (cmdk's `selected` channel); Enter commits
      // the whole set in list order — NOT the visible-row order — so a selected
      // file that's been filtered out is still attached.
      this.ctx().onNavKey((key) => {
        if (key === 'up') km.setPreviousItemActive();
        else if (key === 'down') km.setNextItemActive();
        else if (key === 'space') km.activeItem?.selected.emit();
        else this._commit();
      });

      const report = () =>
        this.ctx().setActiveDescendant(km.activeItem?.id() ?? null);
      km.change.pipe(takeUntilDestroyed(this._destroyRef)).subscribe(report);
      report();
    });
  }

  private _commit(): void {
    const selected = this._selected();
    this.ctx().commit(this.items().filter((i) => selected.has(i.path)));
  }
}
