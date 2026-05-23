import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import {
  MzReviewProgressImports,
  type FileStateCounts,
} from '@mozart-ui/review-progress';

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly viewedCount: number;
  readonly changedCount: number;
  readonly remainingCount: number;
  readonly changedSinceViewedCount: number;
  readonly fileStateCounts: FileStateCounts;
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'empty',
    label: 'No changes (0/0)',
    viewedCount: 0,
    changedCount: 0,
    remainingCount: 0,
    changedSinceViewedCount: 0,
    fileStateCounts: {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      copied: 0,
      untracked: 0,
    },
  },
  {
    id: 'partial',
    label: 'Partial review (3/7)',
    viewedCount: 3,
    changedCount: 7,
    remainingCount: 4,
    changedSinceViewedCount: 0,
    fileStateCounts: {
      added: 2,
      modified: 4,
      deleted: 1,
      renamed: 0,
      copied: 0,
      untracked: 0,
    },
  },
  {
    id: 'complete',
    label: 'All viewed (5/5)',
    viewedCount: 5,
    changedCount: 5,
    remainingCount: 0,
    changedSinceViewedCount: 0,
    fileStateCounts: {
      added: 1,
      modified: 3,
      deleted: 0,
      renamed: 1,
      copied: 0,
      untracked: 0,
    },
  },
  {
    id: 'stale',
    label: 'Mix with changed-since-viewed (4/9)',
    viewedCount: 4,
    changedCount: 9,
    remainingCount: 5,
    changedSinceViewedCount: 2,
    fileStateCounts: {
      added: 3,
      modified: 4,
      deleted: 1,
      renamed: 0,
      copied: 0,
      untracked: 1,
    },
  },
];

@Component({
  selector: 'app-review-progress-sandbox',
  imports: [RouterLink, HlmButtonImports, MzReviewProgressImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="flex flex-col gap-4 p-6 max-w-3xl">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">MzReviewProgress sandbox</h1>
          <p class="text-xs text-muted-foreground">
            P2.2 — collapsed summary + expandable file-state details.
            Pick a scenario; Collapsible state is owned by the component
            internally here.
          </p>
        </div>
        <a hlmBtn variant="ghost" size="sm" routerLink="/">← Back</a>
      </header>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        @for (s of _scenarios; track s.id) {
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            [class.bg-accent]="s.id === _scenarioId()"
            (click)="_select(s.id)"
          >
            {{ s.label }}
          </button>
        }
      </div>

      <mz-review-progress
        [viewedCount]="_scenario().viewedCount"
        [changedCount]="_scenario().changedCount"
        [remainingCount]="_scenario().remainingCount"
        [changedSinceViewedCount]="_scenario().changedSinceViewedCount"
        [fileStateCounts]="_scenario().fileStateCounts"
        (markAllViewed)="_log('markAllViewed')"
        (reviewRemaining)="_log('reviewRemaining')"
      />

      <pre
        class="rounded-md border border-border bg-muted/30 p-3 text-[11px] font-mono"
      >{{ _eventLog() }}</pre>
    </section>
  `,
})
export class ReviewProgressSandbox {
  protected readonly _scenarios = SCENARIOS;
  protected readonly _scenarioId = signal<string>(SCENARIOS[1]!.id);
  protected readonly _scenario = signal<Scenario>(SCENARIOS[1]!);
  protected readonly _eventLog = signal<string>('— no events yet —');

  protected _select(id: string): void {
    const next = SCENARIOS.find((s) => s.id === id);
    if (!next) return;
    this._scenarioId.set(id);
    this._scenario.set(next);
  }

  protected _log(event: string): void {
    const stamp = new Date().toISOString().slice(11, 19);
    this._eventLog.update((prev) => `${stamp}  ${event}\n${prev}`);
  }
}
