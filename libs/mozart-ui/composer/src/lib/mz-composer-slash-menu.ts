import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
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
 * delete, and keeps focus in the editor. This component is the list: it
 * delegates filtering, keyboard navigation, active-item scroll-into-view and
 * empty/section handling to Spartan's headless `cmdk` (`BrnCommand`) instead of
 * re-implementing them.
 *
 * Because focus stays in the editor, cmdk runs in "controlled" mode: the live
 * query drives `[search]`, and the directive's forwarded arrow/enter keys
 * (`ctx.onNavKey`) drive cmdk's `keyManager` directly. The key manager calls
 * `setActiveStyles()` on the new item, which scrolls it into view — the reason
 * we adopt cmdk rather than hand-roll the list.
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
      [id]="ctx().menuId"
      role="listbox"
      class="bg-popover text-popover-foreground w-96 rounded-xl border shadow-md"
      (mousedown)="$event.preventDefault()"
    >
      <div hlmCommandList>
        @for (group of groups(); track group.key) {
          <hlm-command-group>
            <span hlmCommandGroupLabel class="tracking-wide">{{ group.label }}</span>
            @for (item of group.items; track item.id) {
              <button
                hlmCommandItem
                [value]="item.id + ' ' + item.label"
                [disabled]="item.disabled"
                [brnTooltip]="item.description"
                position="right"
                (selected)="ctx().select(item)"
              >
                <span class="min-w-0 flex-1 truncate text-left">
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
  /** Full provider-filtered, source-grouped skills; cmdk narrows by the query. */
  readonly groups = input.required<readonly SlashMenuGroup[]>();

  private readonly _command = viewChild.required(BrnCommand);
  private readonly _destroyRef = inject(DestroyRef);

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
