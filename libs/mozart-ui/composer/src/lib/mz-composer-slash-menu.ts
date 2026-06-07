import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnCommand } from '@spartan-ng/brain/command';
import {
  BrnTooltip,
  type BrnTooltipPosition,
  provideBrnTooltipDefaultOptions,
} from '@spartan-ng/brain/tooltip';
import { HlmCommandImports } from '@spartan-ui/command';
import { HlmBadgeImports } from '@spartan-ui/badge';
import {
  DEFAULT_TOOLTIP_CONTENT_CLASSES,
  DEFAULT_TOOLTIP_SHOW_DELAY,
  DEFAULT_TOOLTIP_SVG_CLASS,
  tooltipPositionVariants,
} from '@spartan-ui/tooltip';
import { hlm } from '@spartan-ui/utils';
import type { TriggerMenuContext } from '@mozart-ui/trigger-menu';
import { fuzzyMatch, highlightFromIndices } from './fuzzy';

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
 * Skill listbox rendered inside the generic `@mozart-ui/trigger-menu` overlay.
 * The directive owns the trigger, caret, overlay, pill insertion and atomic
 * delete, and keeps focus in the editor. This component is the list: it owns
 * fuzzy filtering (`_filteredGroups`) and delegates keyboard navigation,
 * active-item scroll-into-view and empty/section handling to Spartan's headless
 * `cmdk` (`BrnCommand`).
 *
 * cmdk's own substring filter is disabled (`[filter]="_alwaysVisible"`) because
 * it would hide fuzzy-only matches; we feed it the already-filtered rows.
 * `[search]` stays bound only so cmdk resets the active row to the top as the
 * query changes. The directive's forwarded arrow/enter keys (`ctx.onNavKey`)
 * drive cmdk's `keyManager` directly; the key manager scrolls the new active
 * item into view — the reason we adopt cmdk rather than hand-roll the list.
 */
@Component({
  selector: 'mz-composer-slash-menu',
  imports: [HlmCommandImports, HlmBadgeImports, BrnTooltip],
  // Scope the tooltip to this menu: cap it at the menu width and wrap long
  // descriptions instead of cmdk's default `w-fit` (which never wraps).
  providers: [
    provideBrnTooltipDefaultOptions({
      showDelay: DEFAULT_TOOLTIP_SHOW_DELAY,
      svgClasses: DEFAULT_TOOLTIP_SVG_CLASS,
      tooltipContentClasses: DEFAULT_TOOLTIP_CONTENT_CLASSES.replace(
        'w-fit',
        'max-w-96 whitespace-normal',
      ),
      arrowClasses: (position: BrnTooltipPosition) =>
        hlm(tooltipPositionVariants({ position })),
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-command
      [search]="ctx().query()"
      [filter]="_alwaysVisible"
      [id]="ctx().menuId"
      role="listbox"
      class="bg-popover text-popover-foreground w-96 rounded-xl border shadow-md"
      (mousedown)="$event.preventDefault()"
    >
      <div hlmCommandList>
        @for (group of _filteredGroups(); track group.key) {
          <hlm-command-group>
            <span hlmCommandGroupLabel class="tracking-wide">{{
              group.label
            }}</span>
            @for (row of group.items; track row.item.id) {
              <button
                hlmCommandItem
                [value]="row.item.id + ' ' + row.item.label"
                [disabled]="row.item.disabled"
                [brnTooltip]="row.item.description"
                position="right"
                (selected)="ctx().select(row.item)"
              >
                <span class="min-w-0 flex-1 truncate text-left">
                  <span class="font-medium">
                    <span>/</span>
                    @for (
                      part of _highlight(row.item.id, row.indices);
                      track $index
                    ) {
                      @if (part.match) {
                        <strong class="text-primary">{{ part.text }}</strong>
                      } @else {
                        <span>{{ part.text }}</span>
                      }
                    }
                  </span>
                  <span class="text-muted-foreground ml-2 text-xs">
                    {{ row.item.description }}
                  </span>
                </span>
                @if (row.item.disabled) {
                  <hlm-badge variant="secondary" class="shrink-0 text-[10px]">
                    Soon
                  </hlm-badge>
                }
              </button>
            }
          </hlm-command-group>
        }
        <div hlmCommandEmpty *hlmCommandEmptyState>No skills</div>
      </div>
    </hlm-command>
  `,
})
export class MzComposerSlashMenu {
  /** Context handed down by the trigger-menu directive. */
  readonly ctx = input.required<TriggerMenuContext>();
  /** Full provider-filtered, source-grouped skills; `_filteredGroups` narrows
   *  by the query (fuzzy on the skill id). */
  readonly groups = input.required<readonly SlashMenuGroup[]>();

  private readonly _command = viewChild.required(BrnCommand);
  private readonly _destroyRef = inject(DestroyRef);
  protected readonly _q = computed(() => this.ctx().query());

  // Same fuzzy contract as the `@`-file menu, so `/co` finds `code-review` and
  // the highlight tracks the matched characters. We filter ourselves, so cmdk's
  // substring filter must pass everything through (it would hide fuzzy matches).
  protected readonly _alwaysVisible = () => true;
  protected _highlight = highlightFromIndices;

  // Fuzzy-filter each group by the skill id (what the user types after `/`),
  // rank matches by score, and drop groups left empty. No render cap: the skill
  // set is small, unlike the project-wide file list.
  protected readonly _filteredGroups = computed<
    readonly {
      key: string;
      label: string;
      items: readonly { item: SlashMenuItem; indices: readonly number[] }[];
    }[]
  >(() => {
    const q = this._q();
    const groups = this.groups();
    if (!q) {
      return groups.map((g) => ({
        key: g.key,
        label: g.label,
        items: g.items.map((item) => ({
          item,
          indices: [] as readonly number[],
        })),
      }));
    }
    return groups
      .map((g) => {
        const items = g.items
          .map((item) => {
            const m = fuzzyMatch(item.id, q);
            return m ? { item, indices: m.indices, score: m.score } : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => b.score - a.score);
        return { key: g.key, label: g.label, items };
      })
      .filter((g) => g.items.length > 0);
  });

  constructor() {
    afterNextRender(() => {
      const km = this._command().keyManager;

      // Focus stays in the editor; the directive forwards arrow/enter here.
      this.ctx().onNavKey((key) => {
        if (key === 'up') km.setPreviousItemActive();
        else if (key === 'down') km.setNextItemActive();
        else km.activeItem?.selected.emit();
      });

      // Mirror cmdk's active option into the editor's aria-activedescendant.
      const report = () =>
        this.ctx().setActiveDescendant(km.activeItem?.id() ?? null);
      km.change.pipe(takeUntilDestroyed(this._destroyRef)).subscribe(report);
      report();
    });
  }
}
