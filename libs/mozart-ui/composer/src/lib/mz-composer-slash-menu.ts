import { ActiveDescendantKeyManager, type Highlightable } from '@angular/cdk/a11y';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  QueryList,
  ViewChildren,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmBadgeImports } from '@spartan-ui/badge';
import type { TriggerMenuContext } from '@mozart-ui/trigger-menu';
import { filterGroupsByQuery } from './slash-menu.logic';

// View-model types owned by the UI. `mozart-ui` is a pure UI lib and must
// not depend on `desktop-*` domain libs, so the host (feature) maps its
// discovered skills → these shapes.
export interface SlashMenuItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** coming_soon skills render disabled and aren't selectable. */
  readonly disabled: boolean;
}

export interface SlashMenuGroup {
  /** Stable key (the source/publisher). */
  readonly key: string;
  /** Section header, e.g. "Mozart", "Claude", "Gstack". */
  readonly label: string;
  readonly items: readonly SlashMenuItem[];
}

/**
 * One `role="option"`. Implements CDK's `Highlightable` so an
 * `ActiveDescendantKeyManager` can drive arrow-key navigation while focus
 * stays in the editor (the active option is surfaced via `aria-activedescendant`,
 * not DOM focus). `disabled` is a getter (not the input signal) so the key
 * manager's `ListKeyManagerOption.disabled` check reads a real boolean.
 */
@Directive({
  selector: 'button[mzSlashOption]',
  host: {
    role: 'option',
    '[id]': 'optionId()',
    '[attr.aria-selected]': 'active()',
    '[attr.data-active]': 'active()',
    '[disabled]': 'disabled',
  },
})
export class MzSlashMenuOption implements Highlightable {
  readonly optionId = input.required<string>();
  readonly item = input.required<SlashMenuItem>();
  readonly disabledInput = input(false, { alias: 'disabled' });
  readonly active = signal(false);

  get disabled(): boolean {
    return this.disabledInput();
  }

  setActiveStyles(): void {
    this.active.set(true);
  }
  setInactiveStyles(): void {
    this.active.set(false);
  }
  getLabel(): string {
    return this.item().label;
  }
}

/**
 * Skill list rendered inside the generic `@mozart-ui/trigger-menu` overlay.
 * The directive owns the trigger, caret, overlay, pill insertion and atomic
 * delete; this component is the listbox: it filters by the live query and
 * drives an `ActiveDescendantKeyManager` for accessible keyboard navigation,
 * reporting the active option's id back through `ctx.setActiveDescendant` so
 * the editor's `aria-activedescendant` tracks it. Selection commits via
 * `ctx.select`.
 */
@Component({
  selector: 'mz-composer-slash-menu',
  imports: [HlmBadgeImports, MzSlashMenuOption],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-72', role: 'listbox', '[id]': 'ctx().menuId' },
  template: `
    <div
      class="bg-popover text-popover-foreground max-h-72 overflow-y-auto rounded-xl border p-1 shadow-md"
    >
      @for (group of _filtered(); track group.key) {
        <div
          class="text-muted-foreground px-2 pb-1 pt-2 text-xs font-medium tracking-wide"
        >
          {{ group.label }}
        </div>
        @for (item of group.items; track item.id) {
          <button
            mzSlashOption
            [optionId]="_optionId(item)"
            [item]="item"
            [disabled]="item.disabled"
            type="button"
            class="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none disabled:pointer-events-none disabled:opacity-50"
            (mouseenter)="_hover(item)"
            (mousedown)="$event.preventDefault()"
            (click)="ctx().select(item)"
          >
            <span class="min-w-0 flex-1 truncate">
              <span class="font-medium">/{{ item.id }}</span>
              <span class="text-muted-foreground ml-2 text-xs">
                {{ item.description }}
              </span>
            </span>
            @if (item.disabled) {
              <hlm-badge variant="secondary" class="shrink-0 text-[10px]">
                Soon
              </hlm-badge>
            }
          </button>
        }
      } @empty {
        <div class="text-muted-foreground px-2 py-3 text-sm">No skills</div>
      }
    </div>
  `,
})
export class MzComposerSlashMenu implements AfterViewInit {
  /** Context handed down by the trigger-menu directive. */
  readonly ctx = input.required<TriggerMenuContext>();
  /** Full provider-filtered, source-grouped skills; narrowed by the query. */
  readonly groups = input.required<readonly SlashMenuGroup[]>();

  protected readonly _filtered = computed(() =>
    filterGroupsByQuery(this.groups(), this.ctx().query()),
  );

  @ViewChildren(MzSlashMenuOption)
  private _options!: QueryList<MzSlashMenuOption>;
  private _keyManager?: ActiveDescendantKeyManager<MzSlashMenuOption>;
  private readonly _destroyRef = inject(DestroyRef);

  protected _optionId(item: SlashMenuItem): string {
    return `${this.ctx().menuId}-opt-${item.id}`;
  }

  ngAfterViewInit(): void {
    const keyManager = new ActiveDescendantKeyManager(this._options).withWrap();
    this._keyManager = keyManager;

    keyManager.change.pipe(takeUntilDestroyed(this._destroyRef)).subscribe(() => {
      this.ctx().setActiveDescendant(keyManager.activeItem?.optionId() ?? null);
    });
    // Re-anchor the highlight to the first enabled option whenever filtering
    // changes the rendered options.
    this._options.changes
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe(() => keyManager.setFirstItemActive());
    keyManager.setFirstItemActive();

    // Focus stays in the editor; the directive forwards arrow/enter here.
    this.ctx().onNavKey((key) => {
      if (key === 'up') keyManager.setPreviousItemActive();
      else if (key === 'down') keyManager.setNextItemActive();
      else this._selectActive();
    });
  }

  protected _hover(item: SlashMenuItem): void {
    const index = this._options.toArray().findIndex((o) => o.item() === item);
    if (index >= 0) this._keyManager?.setActiveItem(index);
  }

  private _selectActive(): void {
    const item = this._keyManager?.activeItem?.item();
    if (item && !item.disabled) this.ctx().select(item);
  }
}
