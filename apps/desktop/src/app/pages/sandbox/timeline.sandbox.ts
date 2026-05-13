import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import {
  HlmTimeline,
  type TimelineFileChipClick,
  type TimelineItem,
  type TimelineItemExpandedChange,
  type TimelineTurn,
} from '@mozart/ui/timeline';

const BASE_ITEMS: readonly TimelineItem[] = [
  {
    id: '01-think',
    kind: 'thinking',
    state: 'done',
    title: 'Analyzed the request',
    body: 'The user wants to add a workspace switcher to the sidebar header. I need to inspect the current sidebar implementation and surface area first.',
  },
  {
    id: '02-read',
    kind: 'file-read',
    state: 'done',
    title: 'Read sidebar implementation',
    fileChip: { label: 'shell/shell-sidebar.ts' },
  },
  {
    id: '03-search',
    kind: 'search',
    state: 'done',
    title: 'Searched for related styling',
    body: '7 matches across 4 files in libs/ui/sidebar.',
  },
  {
    id: '04-edit',
    kind: 'file-edit',
    state: 'done',
    title: 'Edited shell sidebar',
    fileChip: {
      label: 'shell/shell-sidebar.ts',
      added: 12,
      removed: 3,
    },
  },
  {
    id: '05-create',
    kind: 'file-create',
    state: 'done',
    title: 'Created workspace switcher',
    fileChip: {
      label: 'shell/workspace-switcher.ts',
      added: 48,
    },
  },
  {
    id: '06-shell',
    kind: 'shell',
    state: 'active',
    title: 'Running tests…',
    body: '> nx run desktop:test\nRunning Karma...',
  },
  {
    id: '07-pending',
    kind: 'generic',
    state: 'pending',
    title: 'Commit when tests pass',
  },
];

const ERROR_ITEMS: readonly TimelineItem[] = [
  ...BASE_ITEMS.slice(0, 5),
  {
    id: '06-shell-error',
    kind: 'shell',
    state: 'error',
    title: 'Test run failed',
    body: 'Error: 2 tests failed.\n  - workspace.spec.ts: timeout\n  - chat.spec.ts: assertion',
    defaultExpanded: true,
  },
];

@Component({
  selector: 'app-timeline-sandbox',
  imports: [RouterLink, HlmButtonImports, HlmTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="mx-auto flex h-full max-w-3xl flex-col gap-6 p-6">
      <header class="flex items-center justify-between">
        <h1 class="text-lg font-semibold">HlmTimeline sandbox</h1>
        <a hlmBtn variant="ghost" size="sm" routerLink="/sandbox">← Back</a>
      </header>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="toggleStreaming()"
        >
          isStreaming : {{ isStreaming() ? 'on' : 'off' }}
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="toggleDone()"
        >
          showDoneMarker : {{ showDoneMarker() ? 'on' : 'off' }}
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="toggleErrorScenario()"
        >
          scenario : {{ errorScenario() ? 'error' : 'normal' }}
        </button>
        <span class="text-muted-foreground">
          collapsed : <strong>{{ collapsed() }}</strong>
        </span>
      </div>

      <div class="rounded-lg border border-border bg-card p-5">
        <hlm-timeline
          [turn]="turn()"
          [(collapsed)]="collapsed"
          (fileChipClick)="onFileChipClick($event)"
          (itemExpandedChange)="onItemExpandedChange($event)"
        />
      </div>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-muted-foreground">Emitted events</h2>
        @if (log().length === 0) {
          <p class="text-sm italic text-muted-foreground">
            No event yet. Click a file chip or expand an item.
          </p>
        } @else {
          <ul class="flex flex-col gap-1 font-mono text-xs">
            @for (entry of log(); track entry.t) {
              <li>
                <span class="text-muted-foreground">{{ entry.t }}</span> →
                <strong class="text-primary">{{ entry.kind }}</strong>
                <span>{{ entry.payload }}</span>
              </li>
            }
          </ul>
        }
      </section>
    </section>
  `,
})
export class TimelineSandbox {
  protected readonly isStreaming = signal(true);
  protected readonly showDoneMarker = signal(false);
  protected readonly errorScenario = signal(false);
  protected readonly collapsed = signal(false);

  protected readonly turn = computed<TimelineTurn>(() => ({
    summary: this.errorScenario()
      ? 'Adding workspace switcher — interrupted'
      : 'Adding workspace switcher to the sidebar',
    isStreaming: this.isStreaming(),
    items: this.errorScenario() ? ERROR_ITEMS : BASE_ITEMS,
    showDoneMarker: this.showDoneMarker(),
  }));

  protected readonly log = signal<
    readonly { t: number; kind: string; payload: string }[]
  >([]);

  protected toggleStreaming(): void {
    this.isStreaming.update((v) => !v);
  }

  protected toggleDone(): void {
    this.showDoneMarker.update((v) => !v);
  }

  protected toggleErrorScenario(): void {
    this.errorScenario.update((v) => !v);
  }

  protected onFileChipClick(event: TimelineFileChipClick): void {
    this.appendLog('fileChipClick', `${event.itemId} → ${event.label}`);
  }

  protected onItemExpandedChange(event: TimelineItemExpandedChange): void {
    this.appendLog(
      'itemExpandedChange',
      `${event.itemId} → ${event.expanded ? 'expanded' : 'collapsed'}`,
    );
  }

  private appendLog(kind: string, payload: string): void {
    this.log.update((entries) =>
      [{ t: Date.now(), kind, payload }, ...entries].slice(0, 20),
    );
  }
}
