/**
 * `EmptyRightComponent` — scaffold for the right panel.
 *
 * Three stacked, empty sections separated by theme-bound borders:
 *   1. Files
 *   2. Run
 *   3. Terminal
 *
 * v0.0.1 deliberately ships empty content areas — the diff viewer,
 * run output, and terminal embedding land in later plans (09–10).
 * Visibility is controlled by `ShellStore.showRightPanel` via the
 * top-bar toggle in `app-shell`.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-empty-right',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col w-full h-full' },
  template: `
    <section
      class="flex flex-col flex-1 min-h-0 px-4 py-3 border-b border-border"
      aria-label="Files"
    >
      <header
        class="mb-2 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground"
      >
        Files
      </header>
      <div class="flex-auto min-h-0"></div>
    </section>

    <section
      class="flex flex-col flex-1 min-h-0 px-4 py-3 border-b border-border"
      aria-label="Run"
    >
      <header
        class="mb-2 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground"
      >
        Run
      </header>
      <div class="flex-auto min-h-0"></div>
    </section>

    <section
      class="flex flex-col flex-1 min-h-0 px-4 py-3"
      aria-label="Terminal"
    >
      <header
        class="mb-2 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground"
      >
        Terminal
      </header>
      <div class="flex-auto min-h-0"></div>
    </section>
  `,
})
export class EmptyRightComponent {}
