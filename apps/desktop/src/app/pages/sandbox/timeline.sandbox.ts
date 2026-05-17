import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TurnContainer, type TurnState } from '@mozart-ui/timeline';
import errorMidStream from '../../domains/llm-model/data/stream/__fixtures__/error-mid-stream.json';
import multiTool from '../../domains/llm-model/data/stream/__fixtures__/multi-tool-with-thinking.json';
import textOnly from '../../domains/llm-model/data/stream/__fixtures__/text-only.json';
import {
  EMPTY_TURN_STATE,
  applyAgentEvent,
  type AgentEvent,
} from '../../domains/llm-model';

interface FixtureModule {
  readonly name: string;
  readonly description: string;
  readonly startedAt: number;
  readonly events: readonly AgentEvent[];
}

function reduceFixture(fixture: FixtureModule): TurnState {
  return fixture.events.reduce<TurnState>(
    (state, event) => applyAgentEvent(state, event),
    EMPTY_TURN_STATE(fixture.startedAt),
  );
}

// Reduces every fixture event except the terminal one — leaves the
// turn in a streaming state so the shimmer + active item are visible
// in the sandbox.
function reduceFixtureMidStream(fixture: FixtureModule): TurnState {
  const events = fixture.events.slice(0, -1);
  return events.reduce<TurnState>(
    (state, event) => applyAgentEvent(state, event),
    EMPTY_TURN_STATE(fixture.startedAt),
  );
}

// Synthetic turn that exercises the file renderers (none of the
// shipped fixtures cover the create variant).
const FILE_SHOWCASE_EVENTS: readonly AgentEvent[] = [
  { kind: 'status', text: 'Refactoring the parser module' },
  {
    kind: 'tool_call',
    id: 'r-1',
    toolName: 'view',
    title: 'Read parser source',
    fileChip: { label: 'src/parser/event.types.ts' },
  },
  { kind: 'tool_result', id: 'r-1', ok: true },
  {
    kind: 'tool_call',
    id: 'e-1',
    toolName: 'str_replace',
    title: 'Update event union',
    fileChip: { label: 'src/parser/event.types.ts', added: 14, removed: 3 },
  },
  { kind: 'tool_result', id: 'e-1', ok: true },
  {
    kind: 'tool_call',
    id: 'c-1',
    toolName: 'create_file',
    title: 'Add fixture',
    fileChip: { label: 'src/parser/__fixtures__/recovered.json' },
  },
  { kind: 'tool_result', id: 'c-1', ok: true },
  { kind: 'text', delta: 'Refactor complete.' },
  { kind: 'done' },
];

const FILE_SHOWCASE_FIXTURE: FixtureModule = {
  name: 'file-showcase',
  description: 'File-read + file-edit + file-create + done.',
  startedAt: 1700000000000,
  events: FILE_SHOWCASE_EVENTS,
};

@Component({
  selector: 'app-timeline-sandbox',
  imports: [TurnContainer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full overflow-auto' },
  template: `
    <section class="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <header class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold">Timeline sandbox</h1>
        <p class="text-sm text-muted-foreground">
          Dogfood every TurnContainer renderer + outcome state from
          fixtures, no real LLM. Toggle <code>prefers-reduced-motion</code>
          in DevTools → Rendering to verify the no-motion path.
        </p>
      </header>

      @for (demo of demos(); track demo.name) {
        <article class="flex flex-col gap-2 rounded-lg border border-border p-4">
          <div class="flex flex-col gap-0.5">
            <h2 class="text-sm font-medium">{{ demo.name }}</h2>
            <p class="text-xs text-muted-foreground">{{ demo.description }}</p>
          </div>
          <hlm-turn-container
            [state]="demo.state"
            (fileChipClick)="_logChip($event.path)"
          />
        </article>
      }
    </section>
  `,
})
export class TimelineSandbox {
  protected readonly demos = signal([
    {
      name: 'Streaming (text-only, mid-stream)',
      description:
        'Header shimmers; cursor pulses at the end of the streamed prose.',
      state: reduceFixtureMidStream(textOnly as FixtureModule),
    },
    {
      name: 'Done (multi-tool with thinking)',
      description:
        'Closed turn with thinking item + two file tool calls + Done marker.',
      state: reduceFixture(multiTool as FixtureModule),
    },
    {
      name: 'Streaming (multi-tool mid-stream)',
      description:
        'Same fixture, paused before the terminal event — last item is ACTIVE with shimmer on title.',
      state: reduceFixtureMidStream(multiTool as FixtureModule),
    },
    {
      name: 'Error mid-stream',
      description: 'Tool failure flips the active item to ERROR and the turn to outcome=error.',
      state: reduceFixture(errorMidStream as FixtureModule),
    },
    {
      name: 'File renderers showcase',
      description:
        'File-read (no stats), file-edit (+14/−3), file-create (green tint), all in one turn. Click any chip to copy its path.',
      state: reduceFixture(FILE_SHOWCASE_FIXTURE),
    },
  ]);

  protected _logChip(path: string): void {
    console.info('[timeline-sandbox] chip clicked:', path);
  }
}
