/**
 * Typed, zod-validated wrapper around the auto-generated `_bindings.ts`
 * Tauri this.commands. Each method:
 *
 *   1. invokes the underlying tauri-specta command,
 *   2. parses the envelope `{ status: 'ok', data } | { status: 'error', error }`
 *      with the matching `data` schema,
 *   3. falls back to a direct-payload parse for unwrapped commands
 *      (e.g. `checkClaudeInstall`),
 *   4. throws `MozartError` on JS-level rejections, AppError envelopes,
 *      and schema-validation failures.
 *
 * Channel-based commands (`start_agent_run` / `stop_agent_run`) are
 * surfaced via `startAgentRun(...)` which returns `{ events$, stop }`.
 * The Observable completes when the Rust `AgentRunTerminated`
 * tauri-specta event lands for this run_id (Q2 lock — no polling).
 */
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { commands, events } from '../_bindings';
import {
  AgentRunSchema,
  AppErrorSchema,
  ClaudeInstallSchema,
  RepoSchema,
  TaskSchema,
  WorkspaceChangeSchema,
  WorkspaceSchema,
  type AgentRunDto,
  type ClaudeInstallDto,
  type RepoDto,
  type StreamEventDto,
  type TaskDto,
  type WorkspaceChangeDto,
  type WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
import { channelToObservable } from './agent-channel.util';
import { MozartError } from './mozart-error';

/**
 * Envelope factory: `{ status: 'ok', data: T } | { status: 'error', error: AppError }`.
 * Matches tauri-specta v2's `Result<T, AppError>` emission.
 */
const Envelope = <T>(data: z.ZodType<T>) =>
  z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), data }),
    z.object({ status: z.literal('error'), error: AppErrorSchema }),
  ]);

/**
 * The exact shape exported from `_bindings.ts`. Re-typed locally so the
 * service can take it via DI and tests can substitute fakes without
 * needing module-level mocks (the Angular unit-test runner forbids
 * `vi.mock` for relative imports).
 */
export type TauriCommands = typeof commands;

/**
 * DI token for the auto-generated tauri-specta `commands` object.
 * Production uses the real import; specs provide an in-memory fake.
 */
export const TAURI_COMMANDS = new InjectionToken<TauriCommands>(
  'TAURI_COMMANDS',
  { providedIn: 'root', factory: () => commands },
);

/**
 * Shape of the auto-generated `events` object from `_bindings.ts`. Re-
 * typed locally so the service can take it via DI and specs can
 * substitute fakes — `events.agentRunTerminated.listen(...)` requires
 * the Tauri runtime in production but is trivially fakeable in tests.
 */
export type TauriEvents = typeof events;

/**
 * DI token for the auto-generated tauri-specta `events` object.
 * Production uses the real import; specs provide an in-memory fake
 * whose `.listen` returns a synchronous `unlisten` to drive natural-end
 * scenarios deterministically.
 */
export const EVENTS_API = new InjectionToken<TauriEvents>('EVENTS_API', {
  providedIn: 'root',
  factory: () => events,
});

@Injectable({ providedIn: 'root' })
export class BindingsService {
  private readonly commands = inject(TAURI_COMMANDS);
  private readonly eventsApi = inject(EVENTS_API);

  /**
   * Generic envelope-aware invoker. Tries the discriminated envelope
   * first (the common case for `Result<T, AppError>` commands), then
   * falls back to parsing the payload as bare `T` for unwrapped
   * commands like `checkClaudeInstall`.
   *
   * Throws `MozartError` with:
   * - `kind: 'Io'` when the underlying call rejects at the JS layer
   *   (channel dead, runtime panic, etc.);
   * - the original `AppError` kind when the envelope tags `'error'`;
   * - `kind: 'Validation'` when both envelope + direct-payload parses
   *   fail (drift between Rust types and zod schemas).
   */
  private async invoke<T>(
    call: () => Promise<unknown>,
    dataSchema: z.ZodType<T>,
  ): Promise<T> {
    let raw: unknown;
    try {
      raw = await call();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'IPC failure (non-Error rejection)';
      throw new MozartError('Io', message);
    }

    const envelopeAttempt = Envelope(dataSchema).safeParse(raw);
    if (envelopeAttempt.success) {
      const env = envelopeAttempt.data;
      if (env.status === 'ok') return env.data;
      throw MozartError.fromAppError(env.error);
    }

    const directAttempt = dataSchema.safeParse(raw);
    if (directAttempt.success) return directAttempt.data;

    throw new MozartError(
      'Validation',
      `IPC payload failed validation: ${envelopeAttempt.error.message}`,
    );
  }

  // ---------- read paths ----------

  listRepos = (): Promise<RepoDto[]> =>
    this.invoke(() => this.commands.listRepos(), z.array(RepoSchema));

  listTasks = (repoId: string): Promise<TaskDto[]> =>
    this.invoke(() => this.commands.listTasks(repoId), z.array(TaskSchema));

  listWorkspaces = (): Promise<WorkspaceDto[]> =>
    this.invoke(() => this.commands.listWorkspaces(), z.array(WorkspaceSchema));

  listRuns = (workspaceId: string): Promise<AgentRunDto[]> =>
    this.invoke(
      () => this.commands.listRuns(workspaceId),
      z.array(AgentRunSchema),
    );

  getWorkspaceDiff = (
    workspaceId: string,
  ): Promise<WorkspaceChangeDto | null> =>
    this.invoke(
      () => this.commands.getWorkspaceDiff(workspaceId),
      WorkspaceChangeSchema.nullable(),
    );

  listBranches = (repoPath: string): Promise<string[]> =>
    this.invoke(() => this.commands.listBranches(repoPath), z.array(z.string()));

  // ---------- write paths ----------

  addRepo = (path: string): Promise<RepoDto> =>
    this.invoke(() => this.commands.addRepo(path), RepoSchema);

  createWorkspace = (
    repoId: string,
    baseBranch: string,
    taskText: string,
  ): Promise<WorkspaceDto> =>
    this.invoke(
      () => this.commands.createWorkspace(repoId, baseBranch, taskText),
      WorkspaceSchema,
    );

  archiveWorkspace = (workspaceId: string): Promise<null> =>
    this.invoke(() => this.commands.archiveWorkspace(workspaceId), z.null());

  discardWorkspaceChanges = (workspaceId: string): Promise<null> =>
    this.invoke(
      () => this.commands.discardWorkspaceChanges(workspaceId),
      z.null(),
    );

  // ---------- direct (unwrapped) commands ----------

  /**
   * `check_claude_install` returns `ClaudeInstall` directly (no
   * `Result<_, AppError>` wrap on the Rust side), so the envelope path
   * doesn't apply — the schema parses the raw payload directly.
   */
  checkClaudeInstall = (): Promise<ClaudeInstallDto> =>
    this.invoke(() => this.commands.checkClaudeInstall(), ClaudeInstallSchema);

  // ---------- Channel-based commands ----------

  /**
   * Kick off an agent run for `workspaceId` with `prompt`. Returns:
   *
   *   - `events$`: an `Observable<StreamEventDto>` that emits each token
   *     / cli_output / error frame from the Rust supervisor. Completes
   *     when the matching `AgentRunTerminated` tauri-specta event lands
   *     (Q2 lock — no polling).
   *   - `stop()`: imperative cancel. If called before the `startAgentRun`
   *     promise resolves, the cancel is queued and fires the moment the
   *     run_id becomes known. Idempotent — subsequent calls are no-ops.
   *
   * Error handling:
   *   - `commands.startAgentRun` returning `{ status: 'error', error }`
   *     completes `events$` and rejects an internal promise that the
   *     caller never sees directly — but a synchronous subscription on
   *     `events$` would receive a `complete` notification immediately.
   *     In that case the user sees no tokens and the chat panel reports
   *     "no run started" via its own error state.
   *   - JS-level rejections (channel dead, runtime panic) are wrapped as
   *     `MozartError('Io', …)` per the project convention.
   */
  startAgentRun(
    workspaceId: string,
    prompt: string,
  ): {
    readonly events$: Observable<StreamEventDto>;
    readonly stop: () => Promise<void>;
  } {
    const { channel, events$, complete, emitError } =
      channelToObservable<StreamEventDto>();
    let stopRequested = false;
    let runId: string | null = null;
    let unlistenTerminated: (() => void) | null = null;

    // Fire the run; capture the run_id and arm the terminated listener.
    // The promise is consumed below — the caller only sees `events$` /
    // `stop`. Any error path synthesises a `StreamEvent::Error` frame
    // into `events$` so the ChatPanel banner shows the message, then
    // completes the stream to avoid leaking subscribers.
    void this.commands
      .startAgentRun(workspaceId, prompt, channel)
      .then(async (result) => {
        if (result.status === 'error') {
          throw MozartError.fromAppError(result.error);
        }
        const run = AgentRunSchema.parse(result.data);
        runId = run.run_id;
        // Q2: natural-end via tauri-specta event. The listener is armed
        // AFTER the run is created so we can filter on run.run_id.
        // A race window exists where the event lands before we attach —
        // tauri-specta buffers events at the bridge so listen-after-emit
        // is safe in practice; on the off chance it isn't, the user can
        // still cancel via `stop` and `complete()` fires then.
        unlistenTerminated = await this.eventsApi.agentRunTerminated.listen(
          (ev) => {
            if (ev.payload.run_id === run.run_id) {
              complete();
              if (unlistenTerminated) {
                unlistenTerminated();
                unlistenTerminated = null;
              }
            }
          },
        );
        // If the caller pressed stop before the run resolved, fire the
        // cancel now that we have a run_id.
        if (stopRequested) {
          await this.commands.stopAgentRun(run.run_id);
        }
        return run;
      })
      .catch((err: unknown) => {
        const message =
          err instanceof MozartError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unknown error starting agent run';
        // Surface as a synthetic StreamEvent::Error so the ChatPanel
        // banner shows it. The consumer already gets the error via
        // events$ — do NOT rethrow.
        emitError({ kind: 'error', message } as StreamEventDto);
        complete();
        if (unlistenTerminated) {
          unlistenTerminated();
          unlistenTerminated = null;
        }
      });

    const stop = async (): Promise<void> => {
      stopRequested = true;
      // If runId is known, cancel immediately; otherwise the `.then`
      // above will see stopRequested=true and cancel after the run
      // resolves. `complete()` is called by the AgentRunTerminated
      // listener once the supervisor reaches the 'stopped' status.
      if (runId !== null) {
        const res = await this.commands.stopAgentRun(runId);
        if (res.status === 'error') {
          throw MozartError.fromAppError(res.error);
        }
      }
    };

    return { events$, stop };
  }
}
