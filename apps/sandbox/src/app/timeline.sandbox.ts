import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import { TurnContainer } from '@mozart-ui/timeline';
import type {
  TimelineDensity,
  TurnFileChipEvent,
} from '@mozart-ui/timeline';
import { FakeLlmAdapter } from '@mozart/desktop-llm-model-data-access';
import type { LlmRunHandle } from '@mozart/desktop-llm-model-data-access';
import {
  EMPTY_TURN_STATE,
  applyAgentEvent,
  type ChatMode,
  type TurnState,
} from '@mozart/desktop-llm-model-util';
import { TimelinePrefsService } from '@mozart/desktop-ui-state-data-access';

// Dogfood surface for the timeline UI — drives <mz-turn-container>
// with the FakeLlmAdapter so the renderers can be exercised without
// the real Claude CLI / Tauri stack. FakeLlmAdapter is providedIn
// 'root' but never bound to LLM_ADAPTER anywhere — the desktop app
// keeps using the real Claude adapter, the sandbox just instantiates
// the fake directly.
//
// Density toggle calls `TimelinePrefsService` (same service the
// Settings page writes to), so this surface also dogfoods the
// localStorage-backed global preference.

const DENSITIES: readonly TimelineDensity[] = ['compact', 'normal', 'detailed'];
const MODES: readonly { label: string; value: ChatMode }[] = [
  { label: 'Agent script', value: 'agent' },
  { label: 'Plan script', value: 'plan' },
];

@Component({
  selector: 'app-timeline-sandbox',
  imports: [RouterLink, HlmButtonImports, TurnContainer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full overflow-y-auto' },
  template: `
    <section class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">MzTurnContainer sandbox</h1>
          <p class="text-xs text-muted-foreground">
            Drives the timeline with FakeLlmAdapter. Toggle density and
            replay the script to inspect the filter + per-item expand.
          </p>
        </div>
        <a hlmBtn variant="ghost" size="sm" routerLink="/">← Back</a>
      </header>

      <div
        class="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-3"
      >
        <span class="text-xs uppercase tracking-wide text-muted-foreground">
          Density
        </span>
        @for (level of _densities; track level) {
          <button
            hlmBtn
            type="button"
            size="sm"
            [variant]="_density() === level ? 'default' : 'outline'"
            (click)="_setDensity(level)"
          >
            {{ level }}
          </button>
        }
        <span class="ml-4 text-xs uppercase tracking-wide text-muted-foreground">
          Run
        </span>
        @for (m of _modes; track m.value) {
          <button
            hlmBtn
            type="button"
            size="sm"
            variant="outline"
            [disabled]="_running()"
            (click)="_run(m.value)"
          >
            {{ m.label }}
          </button>
        }
        <button
          hlmBtn
          type="button"
          size="sm"
          variant="ghost"
          [disabled]="!_running()"
          (click)="_stop()"
        >
          Stop
        </button>
        <button
          hlmBtn
          type="button"
          size="sm"
          variant="ghost"
          [disabled]="_running()"
          (click)="_reset()"
        >
          Reset
        </button>
      </div>

      <div class="rounded-md border border-border/60 bg-background p-4">
        <mz-turn-container
          [state]="_state()"
          [density]="_density()"
          (fileChipClick)="_onFileChipClick($event)"
        />
      </div>

      <div class="text-xs text-muted-foreground">
        @if (_lastChip(); as path) {
          file chip clicked: <span class="font-mono">{{ path }}</span>
        } @else {
          <em>Click a file chip in the timeline to capture its path here.</em>
        }
      </div>
    </section>
  `,
})
export class TimelineSandbox {
  private readonly llm = inject(FakeLlmAdapter);
  private readonly prefs = inject(TimelinePrefsService);

  protected readonly _densities = DENSITIES;
  protected readonly _modes = MODES;

  protected readonly _density = this.prefs.density;
  protected readonly _state = signal<TurnState>(EMPTY_TURN_STATE(Date.now()));
  protected readonly _running = signal(false);
  protected readonly _lastChip = signal<string | null>(null);

  protected readonly _hasItems = computed(() => this._state().items.length > 0);

  private _activeHandle: LlmRunHandle | null = null;

  protected _setDensity(level: TimelineDensity): void {
    this.prefs.setDensity(level);
  }

  protected async _run(mode: ChatMode): Promise<void> {
    if (this._running()) return;
    this._running.set(true);
    this._state.set(EMPTY_TURN_STATE(Date.now()));
    const handle = this.llm.stream({
      workspaceId: 'sandbox',
      chatId: 'sandbox-chat',
      currentUserMessageId: 'sandbox-msg',
      mode,
    });
    this._activeHandle = handle;
    try {
      for await (const event of handle.events$) {
        this._state.update((s) => applyAgentEvent(s, event));
      }
    } finally {
      if (this._activeHandle === handle) this._activeHandle = null;
      this._running.set(false);
    }
  }

  protected _stop(): void {
    this._activeHandle?.cancel();
  }

  protected _reset(): void {
    this._state.set(EMPTY_TURN_STATE(Date.now()));
    this._lastChip.set(null);
  }

  protected _onFileChipClick(event: TurnFileChipEvent): void {
    this._lastChip.set(event.path);
  }
}
