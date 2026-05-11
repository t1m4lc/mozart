/**
 * Zod schemas mirroring `apps/desktop/src-tauri/src/db/models.rs` +
 * `apps/desktop/src/app/_bindings.ts` (tauri-specta output).
 *
 * The Rust side is source of truth; these schemas validate every IPC
 * payload at the Angular boundary so `BindingsService` can throw a
 * typed `MozartError` on any drift (kind: `'Validation'`).
 *
 * All DTO types derive via `z.infer<typeof X>` — never hand-typed.
 */
import { z } from 'zod';

// ---------- AppError ----------

export const AppErrorKindSchema = z.enum([
  'Db',
  'Io',
  'NotFound',
  'Validation',
  'AgentSpawn',
  'GitCmd',
]);
export type AppErrorKind = z.infer<typeof AppErrorKindSchema>;

export const AppErrorSchema = z.object({
  kind: AppErrorKindSchema,
  message: z.string(),
});
export type AppErrorDto = z.infer<typeof AppErrorSchema>;

// ---------- Repo ----------

export const RepoSchema = z.object({
  repo_id: z.string().min(1),
  path: z.string().min(1),
  display_name: z.string(),
  added_at: z.number().int().nonnegative(),
});
export type RepoDto = z.infer<typeof RepoSchema>;

// ---------- Task ----------

export const TaskStatusSchema = z.enum(['active', 'archived']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  task_id: z.string().min(1),
  repo_id: z.string().min(1),
  title: z.string(),
  task_text: z.string(),
  status: TaskStatusSchema,
  created_at: z.number().int().nonnegative(),
});
export type TaskDto = z.infer<typeof TaskSchema>;

// ---------- Workspace ----------

export const WorkspaceStatusSchema = z.enum([
  'initializing',
  'ready',
  'running',
  'done',
  'error',
  'conflict',
  'stopped',
  'crashed',
]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const WorkspaceSchema = z.object({
  workspace_id: z.string().min(1),
  task_id: z.string().min(1),
  worktree_path: z.string(),
  branch_name: z.string(),
  base_branch: z.string(),
  status: WorkspaceStatusSchema,
  created_at: z.number().int().nonnegative(),
  deletion_intent: z.number().int(),
});
export type WorkspaceDto = z.infer<typeof WorkspaceSchema>;

// ---------- Thread ----------

export const ThreadSchema = z.object({
  thread_id: z.string().min(1),
  workspace_id: z.string().min(1),
  created_at: z.number().int().nonnegative(),
});
export type ThreadDto = z.infer<typeof ThreadSchema>;

// ---------- AgentRun ----------

export const AgentRunSchema = z.object({
  run_id: z.string().min(1),
  thread_id: z.string().min(1),
  prompt: z.string(),
  status: z.string(),
  started_at: z.number().int().nonnegative(),
  ended_at: z.number().int().nullable(),
  exit_code: z.number().int().nullable(),
  error_message: z.string().nullable(),
  checkpoint_sha: z.string().nullable(),
});
export type AgentRunDto = z.infer<typeof AgentRunSchema>;

// ---------- WorkspaceChange ----------

export const WorkspaceChangeSchema = z.object({
  change_id: z.number().int().nonnegative(),
  workspace_id: z.string().min(1),
  run_id: z.string().nullable(),
  diff_text: z.string(),
  files_added: z.number().int().nonnegative(),
  files_modified: z.number().int().nonnegative(),
  files_deleted: z.number().int().nonnegative(),
  captured_at: z.number().int().nonnegative(),
});
export type WorkspaceChangeDto = z.infer<typeof WorkspaceChangeSchema>;

// ---------- ClaudeInstall ----------

export const ClaudeInstallSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('installed'), version: z.string() }),
  z.object({ kind: z.literal('missing') }),
]);
export type ClaudeInstallDto = z.infer<typeof ClaudeInstallSchema>;

// ---------- StreamEvent ----------

export const StreamEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stream_token'), text: z.string() }),
  z.object({
    kind: z.literal('tool_call'),
    name: z.string(),
    args_json: z.string(),
  }),
  z.object({ kind: z.literal('cli_output'), line: z.string() }),
  z.object({ kind: z.literal('status_update'), status: z.string() }),
  z.object({ kind: z.literal('error'), message: z.string() }),
]);
export type StreamEventDto = z.infer<typeof StreamEventSchema>;
