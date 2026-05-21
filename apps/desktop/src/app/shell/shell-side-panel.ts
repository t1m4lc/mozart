import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Collapsible side-panel chrome shared by `app-shell-left` and
// `app-shell-right`. Owns the outer transition + clip layout so the
// two siblings stop re-rolling identical scaffolding. Content goes
// inside via `<ng-content>` — typically an `<hlm-sidebar>` from
// Spartan with the panel's actual header/content/footer.
//
// Why this exists (and not a fancier multi-slot primitive):
//   - shell-left and shell-right share ~20 lines of host + inner-div
//     chrome that only differs by side, width, and the compact-hide
//     toggle. Lifting that into one primitive removes the most
//     duplicated bit without coupling the primitive to the specific
//     hlm-sidebar layout each side picks.
//   - Single ng-content keeps the API tiny. If a future caller wants
//     header/footer slots, add named selectors then — not now.
//
// Behavior contracts:
//   - The host shrinks to `0px` width and clips its contents when
//     `open === false`. The width transition is on the host, the
//     inner panel keeps a constant `width` — so the inner stays
//     anchored to the side as the host collapses.
//   - The side border (border-r for left, border-l for right) lives
//     on the INNER panel — that way `overflow-hidden` on the host
//     clips both content AND border together. Removes the orphan
//     border line that would otherwise linger when collapsed.
//   - `hideOnCompact` adds `max-lg:hidden` so the right-pane host
//     disappears below Tailwind's `lg` breakpoint (1024px), matching
//     the workspace-toolbar's compact-mode sheet trigger.
@Component({
  selector: 'app-shell-side-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative block shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
    '[class.max-lg:hidden]': 'hideOnCompact()',
    '[style.width]': '_outerWidth()',
  },
  template: `
    <div
      class="absolute inset-y-0"
      [class.left-0]="side() === 'left'"
      [class.right-0]="side() === 'right'"
      [class.border-r]="side() === 'left'"
      [class.border-l]="side() === 'right'"
      [class.border-sidebar-border]="true"
      [style.width]="width()"
    >
      <ng-content />
    </div>
  `,
})
export class ShellSidePanel {
  /** Which edge of the viewport the panel anchors to. Controls the
   *  border side and the inner panel's inset. */
  readonly side = input.required<'left' | 'right'>();

  /** True when the panel is visible. False collapses the host to 0px
   *  width via the `[style.width]` binding below. */
  readonly open = input.required<boolean>();

  /** The panel's expanded width as a CSS string (typically the
   *  SHELL_LEFT_PANEL_WIDTH / SHELL_RIGHT_PANEL_WIDTH constants).
   *  Used as both the inner panel's fixed width and the host's
   *  width-when-open. */
  readonly width = input.required<string>();

  /** When true, the host is CSS-hidden below Tailwind's `lg`
   *  breakpoint (1024px). Defaults to false. */
  readonly hideOnCompact = input<boolean>(false);

  // Host width is `width()` when open, `0px` when closed. The
  // transition between them is driven by `transition-[width]` on the
  // host class.
  protected readonly _outerWidth = computed(() =>
    this.open() ? this.width() : '0px',
  );
}
