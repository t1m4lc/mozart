import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import {
  MzHunkExpandBar,
  type HunkExpandEvent,
} from '@mozart-ui/hunk-expand-bar';

interface LogEntry {
  readonly at: number;
  readonly label: string;
  readonly event: HunkExpandEvent;
}

// Dev-only dogfooding surface for `mz-hunk-expand-bar`. Exercises the
// three direction variants plus shift-click doubling so the visual +
// keyboard story can be eyeballed in isolation.
@Component({
  selector: 'app-hunk-expand-bar-sandbox',
  imports: [RouterLink, HlmButtonImports, MzHunkExpandBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block p-8' },
  template: `
    <section class="flex max-w-2xl flex-col gap-8">
      <header class="flex items-start justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="text-xl font-semibold">MzHunkExpandBar</h1>
          <p class="text-muted-foreground text-sm">
            P2.3 expand bar shown between diff hunks. Click an arrow to
            emit; shift-click doubles the step.
          </p>
        </div>
        <a hlmBtn variant="ghost" size="sm" routerLink="/"> ← Back </a>
      </header>

      <div class="flex flex-col gap-4">
        <div>
          <p class="text-muted-foreground mb-1 text-[11px]">
            direction = "up" (above first hunk)
          </p>
          <mz-hunk-expand-bar
            direction="up"
            [linesAvailable]="43"
            (expand)="log('above-first', $event)"
          />
        </div>

        <div>
          <p class="text-muted-foreground mb-1 text-[11px]">
            direction = "both" (between hunks)
          </p>
          <mz-hunk-expand-bar
            direction="both"
            [linesAvailable]="73"
            (expand)="log('between', $event)"
          />
        </div>

        <div>
          <p class="text-muted-foreground mb-1 text-[11px]">
            direction = "down" (below last hunk)
          </p>
          <mz-hunk-expand-bar
            direction="down"
            [linesAvailable]="120"
            (expand)="log('below-last', $event)"
          />
        </div>

        <div>
          <p class="text-muted-foreground mb-1 text-[11px]">
            direction = "both", only 4 lines available (cap kicks in)
          </p>
          <mz-hunk-expand-bar
            direction="both"
            [linesAvailable]="4"
            (expand)="log('small-gap', $event)"
          />
        </div>

        <div>
          <p class="text-muted-foreground mb-1 text-[11px]">
            direction = "both", 0 lines available (buttons disabled)
          </p>
          <mz-hunk-expand-bar
            direction="both"
            [linesAvailable]="0"
            (expand)="log('empty', $event)"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <p class="text-xs font-medium">Emitted events</p>
        <ul
          class="text-muted-foreground flex flex-col gap-1 font-mono text-[11px]"
        >
          @for (entry of events(); track entry.at) {
            <li>
              [{{ entry.label }}] direction={{ entry.event.direction }} count={{
                entry.event.count
              }}
            </li>
          } @empty {
            <li class="italic">no events yet — try clicking an arrow</li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class HunkExpandBarSandbox {
  protected readonly events = signal<readonly LogEntry[]>([]);

  protected log(label: string, event: HunkExpandEvent): void {
    const next: LogEntry = { at: Date.now(), label, event };
    this.events.update((prev) => [next, ...prev].slice(0, 10));
  }
}
