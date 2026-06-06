import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  resource,
} from '@angular/core';
import { DEBUG_ENVELOPE_PORT } from '@mozart/desktop-chat-data-access';

// Dev-only LLM debug inspector. Read-after-the-fact view of a run's
// persisted envelope: the 7-layer context that was assembled, the exact
// rendered payload piped to the provider, and char/token stats. Gated by
// `isDevDebugViewEnabled()` upstream and rendered inside a `@defer` block
// so its code is split out of the production bundle entirely.
@Component({
  selector: 'app-debug-envelope-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div
      class="fixed inset-0 z-50 bg-black/40"
      (click)="closed.emit()"
      aria-hidden="true"
    ></div>
    <aside
      class="fixed inset-y-0 right-0 z-50 flex w-[640px] max-w-[90vw] flex-col border-l border-border bg-background shadow-xl"
      role="dialog"
      aria-label="Run debug inspector"
    >
      <header
        class="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"
      >
        <div class="flex flex-col">
          <span class="text-sm font-medium">Run debug</span>
          <span class="font-mono text-xs text-muted-foreground">
            {{ runId() }}
          </span>
        </div>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          (click)="closed.emit()"
        >
          Close
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
        @if (envelope.isLoading()) {
          <p class="text-muted-foreground">Loading envelope…</p>
        } @else if (envelope.error()) {
          <p class="text-destructive">Failed to load envelope.</p>
        } @else if (envelope.value(); as env) {
          <dl
            class="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs"
          >
            <dt class="text-muted-foreground">provider</dt>
            <dd>{{ env.provider }}</dd>
            <dt class="text-muted-foreground">chars</dt>
            <dd>{{ env.charCount }}</dd>
            <dt class="text-muted-foreground">est. tokens</dt>
            <dd>{{ env.estTokens }}</dd>
            <dt class="text-muted-foreground">nonce</dt>
            <dd class="truncate">{{ env.nonce }}</dd>
          </dl>

          @if (env.layers; as L) {
            <section class="mb-4">
              <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                System rules
              </h3>
              <div class="rounded-md bg-muted/40 p-2 font-mono text-xs">
                <div>mode: {{ L.systemRules.mode }}</div>
                <div>sandbox: {{ L.systemRules.sandboxLevel }}</div>
                <div class="whitespace-pre-wrap">
                  {{ L.systemRules.authorityClamp }}
                </div>
              </div>
            </section>

            <section class="mb-4">
              <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Workspace state
              </h3>
              <div class="rounded-md bg-muted/40 p-2 font-mono text-xs">
                <div>path: {{ L.workspaceState.workspacePath }}</div>
                <div>branch: {{ L.workspaceState.branchName }}</div>
                <div>base: {{ L.workspaceState.baseBranch }}</div>
                <div>siblings: {{ L.workspaceState.siblingPaths.length }}</div>
              </div>
            </section>

            <section class="mb-4">
              <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Project memory ({{ L.projectMemory.length }})
              </h3>
              @if (L.projectMemory.length === 0) {
                <p class="text-xs text-muted-foreground">empty</p>
              } @else {
                <ul class="list-disc pl-4 text-xs">
                  @for (item of L.projectMemory; track $index) {
                    <li>{{ item }}</li>
                  }
                </ul>
              }
            </section>

            <section class="mb-4">
              <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Recent conversation ({{ L.recentConversation.length }})
              </h3>
              @for (turn of L.recentConversation; track turn.messageId) {
                <div class="mb-2 rounded-md bg-muted/40 p-2">
                  <div class="mb-1 font-mono text-[10px] text-muted-foreground">
                    {{ turn.role }}{{ turn.mode ? ' · ' + turn.mode : '' }}
                  </div>
                  <div class="whitespace-pre-wrap text-xs">{{ turn.content }}</div>
                </div>
              } @empty {
                <p class="text-xs text-muted-foreground">empty</p>
              }
            </section>

            <section class="mb-4">
              <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Operational summaries ({{ L.operationalSummaries.length }})
              </h3>
              @for (sum of L.operationalSummaries; track sum.runId) {
                <div class="mb-2 rounded-md bg-muted/40 p-2 text-xs">
                  <div class="whitespace-pre-wrap">{{ sum.textSummary }}</div>
                </div>
              } @empty {
                <p class="text-xs text-muted-foreground">empty</p>
              }
            </section>

            <section class="mb-4">
              <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Attached context ({{ L.attachedContext.length }})
              </h3>
              @for (item of L.attachedContext; track $index) {
                <div class="mb-2 rounded-md bg-muted/40 p-2 text-xs">
                  <div class="font-mono text-[10px] text-muted-foreground">
                    {{ item.kind }} · {{ item.label }}
                  </div>
                  <div class="whitespace-pre-wrap">{{ item.content }}</div>
                </div>
              } @empty {
                <p class="text-xs text-muted-foreground">none (v1)</p>
              }
            </section>

            <section class="mb-4">
              <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Current user message
              </h3>
              <div class="rounded-md bg-muted/40 p-2 text-xs">
                <div class="whitespace-pre-wrap">
                  {{ L.currentUserMessage.content }}
                </div>
              </div>
            </section>
          } @else {
            <p class="mb-4 text-xs text-destructive">
              envelope_json failed to parse.
            </p>
          }

          <section>
            <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Rendered payload
            </h3>
            <pre
              class="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[11px]"
              >{{ env.renderedText }}</pre
            >
          </section>
        } @else {
          <p class="text-muted-foreground">
            No envelope for this run (legacy run, evicted, or it errored
            before the envelope was written).
          </p>
        }
      </div>
    </aside>
  `,
})
export class DebugEnvelopePanel {
  readonly runId = input.required<string>();
  readonly closed = output<void>();

  private readonly port = inject(DEBUG_ENVELOPE_PORT);

  protected readonly envelope = resource({
    params: () => this.runId(),
    loader: ({ params }) => this.port.getRunEnvelope(params),
  });
}
