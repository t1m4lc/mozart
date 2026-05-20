import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  UiHunkExpandBar,
  type HunkExpandEvent,
} from '../../domains/repositories';

interface LogEntry {
  readonly at: number;
  readonly label: string;
  readonly event: HunkExpandEvent;
}

// Dev-only dogfooding surface for `app-hunk-expand-bar`. Exercises the
// three direction variants plus shift-click doubling so the visual +
// keyboard story can be eyeballed in isolation.
@Component({
  selector: 'app-hunk-expand-bar-sandbox',
  imports: [UiHunkExpandBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block p-8' },
  template: `
    <section class="flex max-w-2xl flex-col gap-8">
      <header class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold">UiHunkExpandBar</h1>
        <p class="text-sm text-muted-foreground">
          P2.3 expand bar shown between diff hunks. Click an arrow to
          emit; shift-click doubles the step.
        </p>
      </header>

      <div class="flex flex-col gap-4">
        <div>
          <p class="mb-1 text-[11px] text-muted-foreground">
            direction = "up" (above first hunk)
          </p>
          <app-hunk-expand-bar
            direction="up"
            [linesAvailable]="43"
            (expand)="log('above-first', $event)"
          />
        </div>

        <div>
          <p class="mb-1 text-[11px] text-muted-foreground">
            direction = "both" (between hunks)
          </p>
          <app-hunk-expand-bar
            direction="both"
            [linesAvailable]="73"
            (expand)="log('between', $event)"
          />
        </div>

        <div>
          <p class="mb-1 text-[11px] text-muted-foreground">
            direction = "down" (below last hunk)
          </p>
          <app-hunk-expand-bar
            direction="down"
            [linesAvailable]="120"
            (expand)="log('below-last', $event)"
          />
        </div>

        <div>
          <p class="mb-1 text-[11px] text-muted-foreground">
            direction = "both", only 4 lines available (cap kicks in)
          </p>
          <app-hunk-expand-bar
            direction="both"
            [linesAvailable]="4"
            (expand)="log('small-gap', $event)"
          />
        </div>

        <div>
          <p class="mb-1 text-[11px] text-muted-foreground">
            direction = "both", 0 lines available (buttons disabled)
          </p>
          <app-hunk-expand-bar
            direction="both"
            [linesAvailable]="0"
            (expand)="log('empty', $event)"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <p class="text-xs font-medium">Emitted events</p>
        <ul class="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
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
