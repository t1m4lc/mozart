import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideSparkles } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from './_shimmer.styles';

// Phase 3b — turn header. Renders the agent's status summary with a
// shimmer effect while streaming, and a chevron toggle that collapses
// the body. The summary text is keyed by its content so a status
// rotation (spec §D.2) re-runs the fade-up CSS animation on the inner
// span. The shimmer span itself is the *outer* element and never
// re-mounts (spec §A.7.3) — restarting the shimmer mid-cycle looks
// janky.

const FALLBACK_SUMMARY = 'Working…';

@Component({
  selector: 'hlm-turn-header',
  imports: [HlmIconImports],
  providers: [provideIcons({ lucideChevronDown, lucideSparkles })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button
      type="button"
      (click)="collapsed.set(!collapsed())"
      [attr.aria-expanded]="!collapsed()"
      class="group/turn-header flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-left text-muted-foreground transition-colors hover:text-foreground"
    >
      <ng-icon
        hlm
        name="lucideSparkles"
        size="sm"
        class="shrink-0 text-brand"
      />
      <span class="min-w-0 flex-1 truncate text-sm">
        <span [class.shimmer-text]="streaming()">
          @for (line of [_displayed()]; track line) {
            <span class="summary-line">{{ line }}</span>
          }
        </span>
      </span>
      <ng-icon
        hlm
        name="lucideChevronDown"
        size="xs"
        class="ml-1 shrink-0 text-muted-foreground/70 opacity-0 transition-transform duration-150 group-hover/turn-header:opacity-100"
        [class.rotate-180]="!collapsed()"
      />
    </button>
  `,
  styles: [
    SHIMMER_TEXT_STYLES,
    `
      @keyframes hlm-turn-header-fade-up {
        from { opacity: 0; transform: translateY(5px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .summary-line {
        display: inline-block;
        animation: hlm-turn-header-fade-up 350ms ease both;
      }
      @media (prefers-reduced-motion: reduce) {
        .summary-line { animation: none; }
      }
    `,
  ],
})
export class TurnHeader {
  readonly summary = input<string>('');
  readonly streaming = input<boolean>(false);
  readonly collapsed = model<boolean>(false);

  protected readonly _displayed = computed(
    () => this.summary().trim() || FALLBACK_SUMMARY,
  );
}
