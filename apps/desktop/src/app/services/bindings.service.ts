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
 * Channel-based commands (`start_agent_run` / `stop_agent_run`) are NOT
 * exposed here — Plan 09 wires them through a dedicated stream API.
 */
import { Injectable, InjectionToken, inject } from '@angular/core';
import { z } from 'zod';

import { commands } from '../_bindings';
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
  type TaskDto,
  type WorkspaceChangeDto,
  type WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
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

@Injectable({ providedIn: 'root' })
export class BindingsService {
  private readonly commands = inject(TAURI_COMMANDS);

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

  // ---------- Channel-based commands (NOT exposed in this atom) ----------
  // TODO(plan-09): wire `startAgentRun(workspaceId, prompt, channel)`
  // and `stopAgentRun(runId)` through a streaming API. They use
  // `TAURI_CHANNEL<StreamEvent>` which is not envelope-shaped at the
  // consumer level and needs a dedicated subscription helper.
}
