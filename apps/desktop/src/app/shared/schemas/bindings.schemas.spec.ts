import { describe, expect, it } from 'vitest';
import {
  AgentRunSchema,
  AppErrorSchema,
  ClaudeInstallSchema,
  RepoSchema,
  StreamEventSchema,
  TaskSchema,
  ThreadSchema,
  WorkspaceChangeSchema,
  WorkspaceSchema,
  WorkspaceStatusSchema,
  type AppErrorDto,
  type RepoDto,
  type TaskDto,
  type WorkspaceDto,
} from './bindings.schemas';

describe('bindings.schemas', () => {
  describe('AppErrorSchema', () => {
    it('parses every known kind', () => {
      for (const kind of [
        'Db',
        'Io',
        'NotFound',
        'Validation',
        'AgentSpawn',
        'GitCmd',
      ] as const) {
        const parsed = AppErrorSchema.parse({ kind, message: 'boom' });
        expect(parsed.kind).toBe(kind);
      }
    });

    it('rejects unknown kinds', () => {
      const r = AppErrorSchema.safeParse({ kind: 'Mystery', message: 'x' });
      expect(r.success).toBe(false);
    });

    it('rejects missing message', () => {
      const r = AppErrorSchema.safeParse({ kind: 'Db' });
      expect(r.success).toBe(false);
    });

    it('produces a usable inferred type', () => {
      const e: AppErrorDto = { kind: 'NotFound', message: 'no row' };
      expect(e.kind).toBe('NotFound');
    });
  });

  describe('RepoSchema', () => {
    it('parses a valid Repo payload', () => {
      const repo = RepoSchema.parse({
        repo_id: 'r1',
        path: '/tmp/r',
        display_name: 'r',
        added_at: 1730000000,
      });
      expect(repo.repo_id).toBe('r1');
    });

    it('rejects missing field', () => {
      expect(
        RepoSchema.safeParse({ repo_id: 'r1', path: '/tmp/r' }).success,
      ).toBe(false);
    });

    it('rejects type mismatch on timestamp', () => {
      expect(
        RepoSchema.safeParse({
          repo_id: 'r1',
          path: '/tmp/r',
          display_name: 'r',
          added_at: '1730000000',
        }).success,
      ).toBe(false);
    });

    it('rejects empty repo_id', () => {
      expect(
        RepoSchema.safeParse({
          repo_id: '',
          path: '/tmp/r',
          display_name: 'r',
          added_at: 0,
        }).success,
      ).toBe(false);
    });

    it('infers RepoDto compatible with field shape', () => {
      const r: RepoDto = {
        repo_id: 'r1',
        path: '/tmp/r',
        display_name: 'r',
        added_at: 1,
      };
      expect(r.added_at).toBe(1);
    });
  });

  describe('TaskSchema', () => {
    it('parses an active task', () => {
      const t = TaskSchema.parse({
        task_id: 't1',
        repo_id: 'r1',
        title: 'do thing',
        task_text: 'do thing in detail',
        status: 'active',
        created_at: 1,
      });
      expect(t.status).toBe('active');
    });

    it('parses an archived task', () => {
      const t = TaskSchema.parse({
        task_id: 't1',
        repo_id: 'r1',
        title: 'x',
        task_text: 'x',
        status: 'archived',
        created_at: 1,
      });
      expect(t.status).toBe('archived');
    });

    it('rejects unknown status values', () => {
      expect(
        TaskSchema.safeParse({
          task_id: 't1',
          repo_id: 'r1',
          title: 'x',
          task_text: 'x',
          status: 'something_else',
          created_at: 1,
        }).success,
      ).toBe(false);
    });

    it('produces inferred TaskDto', () => {
      const t: TaskDto = {
        task_id: 't',
        repo_id: 'r',
        title: 'a',
        task_text: 'b',
        status: 'active',
        created_at: 0,
      };
      expect(t.title).toBe('a');
    });
  });

  describe('WorkspaceStatusSchema', () => {
    it('accepts all eight statuses', () => {
      for (const s of [
        'initializing',
        'ready',
        'running',
        'done',
        'error',
        'conflict',
        'stopped',
        'crashed',
      ] as const) {
        expect(WorkspaceStatusSchema.parse(s)).toBe(s);
      }
    });

    it('rejects an unknown status', () => {
      expect(WorkspaceStatusSchema.safeParse('archived').success).toBe(false);
    });
  });

  describe('WorkspaceSchema', () => {
    it('parses a valid workspace', () => {
      const w = WorkspaceSchema.parse({
        workspace_id: 'w1',
        task_id: 't1',
        worktree_path: '/tmp/wt',
        branch_name: 'agent/wip-x',
        base_branch: 'main',
        status: 'ready',
        created_at: 1,
        deletion_intent: 0,
      });
      expect(w.status).toBe('ready');
    });

    it('rejects missing branch_name', () => {
      expect(
        WorkspaceSchema.safeParse({
          workspace_id: 'w1',
          task_id: 't1',
          worktree_path: '/tmp/wt',
          base_branch: 'main',
          status: 'ready',
          created_at: 1,
          deletion_intent: 0,
        }).success,
      ).toBe(false);
    });

    it('produces inferred WorkspaceDto', () => {
      const w: WorkspaceDto = {
        workspace_id: 'w',
        task_id: 't',
        worktree_path: '/p',
        branch_name: 'b',
        base_branch: 'main',
        status: 'ready',
        created_at: 0,
        deletion_intent: 0,
      };
      expect(w.workspace_id).toBe('w');
    });
  });

  describe('AgentRunSchema', () => {
    it('parses with nullable optional fields', () => {
      const run = AgentRunSchema.parse({
        run_id: 'r',
        thread_id: 't',
        prompt: 'p',
        status: 'running',
        started_at: 1,
        ended_at: null,
        exit_code: null,
        error_message: null,
        checkpoint_sha: null,
      });
      expect(run.ended_at).toBeNull();
    });

    it('parses with optional fields populated', () => {
      const run = AgentRunSchema.parse({
        run_id: 'r',
        thread_id: 't',
        prompt: 'p',
        status: 'done',
        started_at: 1,
        ended_at: 2,
        exit_code: 0,
        error_message: null,
        checkpoint_sha: 'deadbeef',
      });
      expect(run.exit_code).toBe(0);
    });

    it('rejects when started_at missing', () => {
      expect(
        AgentRunSchema.safeParse({
          run_id: 'r',
          thread_id: 't',
          prompt: 'p',
          status: 'done',
          ended_at: null,
          exit_code: null,
          error_message: null,
          checkpoint_sha: null,
        }).success,
      ).toBe(false);
    });
  });

  describe('ThreadSchema', () => {
    it('parses', () => {
      const t = ThreadSchema.parse({
        thread_id: 'th',
        workspace_id: 'w',
        created_at: 1,
      });
      expect(t.thread_id).toBe('th');
    });
  });

  describe('WorkspaceChangeSchema', () => {
    it('parses with null run_id', () => {
      const ch = WorkspaceChangeSchema.parse({
        change_id: 12,
        workspace_id: 'w',
        run_id: null,
        diff_text: 'diff --git',
        files_added: 1,
        files_modified: 0,
        files_deleted: 0,
        captured_at: 1,
      });
      expect(ch.run_id).toBeNull();
    });

    it('rejects negative captured_at', () => {
      expect(
        WorkspaceChangeSchema.safeParse({
          change_id: 1,
          workspace_id: 'w',
          run_id: null,
          diff_text: 'x',
          files_added: 0,
          files_modified: 0,
          files_deleted: 0,
          captured_at: -1,
        }).success,
      ).toBe(false);
    });
  });

  describe('ClaudeInstallSchema', () => {
    it('parses installed variant', () => {
      const v = ClaudeInstallSchema.parse({
        kind: 'installed',
        version: '1.2.3',
      });
      expect(v.kind).toBe('installed');
    });

    it('parses missing variant', () => {
      const v = ClaudeInstallSchema.parse({ kind: 'missing' });
      expect(v.kind).toBe('missing');
    });

    it('rejects unknown variant', () => {
      expect(
        ClaudeInstallSchema.safeParse({ kind: 'maybe' }).success,
      ).toBe(false);
    });
  });

  describe('StreamEventSchema', () => {
    it('parses stream_token', () => {
      const e = StreamEventSchema.parse({ kind: 'stream_token', text: 'hi' });
      expect(e.kind).toBe('stream_token');
    });
    it('parses tool_call', () => {
      const e = StreamEventSchema.parse({
        kind: 'tool_call',
        name: 'fs',
        args_json: '{}',
      });
      expect(e.kind).toBe('tool_call');
    });
    it('parses cli_output', () => {
      const e = StreamEventSchema.parse({ kind: 'cli_output', line: 'out' });
      expect(e.kind).toBe('cli_output');
    });
    it('parses status_update', () => {
      const e = StreamEventSchema.parse({
        kind: 'status_update',
        status: 'running',
      });
      expect(e.kind).toBe('status_update');
    });
    it('parses error', () => {
      const e = StreamEventSchema.parse({ kind: 'error', message: 'boom' });
      expect(e.kind).toBe('error');
    });
  });
});
