import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BindingsService,
  TAURI_COMMANDS,
  type TauriCommands,
} from './bindings.service';
import { MozartError } from './mozart-error';

/**
 * Per-test fake of the `commands` object from `_bindings.ts`. Each
 * method is a `vi.fn()` so specs control resolution / rejection.
 */
function createFakeCommands(): TauriCommands {
  return {
    listRepos: vi.fn(),
    addRepo: vi.fn(),
    listBranches: vi.fn(),
    createWorkspace: vi.fn(),
    listWorkspaces: vi.fn(),
    listTasks: vi.fn(),
    archiveWorkspace: vi.fn(),
    startAgentRun: vi.fn(),
    stopAgentRun: vi.fn(),
    listRuns: vi.fn(),
    getWorkspaceDiff: vi.fn(),
    discardWorkspaceChanges: vi.fn(),
    checkClaudeInstall: vi.fn(),
  } as unknown as TauriCommands;
}

const validRepo = {
  repo_id: 'r1',
  path: '/tmp/r',
  display_name: 'r',
  added_at: 1730000000,
};

const validWorkspace = {
  workspace_id: 'w1',
  task_id: 't1',
  worktree_path: '/tmp/wt',
  branch_name: 'agent/wip-1',
  base_branch: 'main',
  status: 'ready' as const,
  created_at: 1,
  deletion_intent: 0,
};

describe('BindingsService', () => {
  let svc: BindingsService;
  let fake: TauriCommands;

  beforeEach(() => {
    fake = createFakeCommands();
    TestBed.configureTestingModule({
      providers: [{ provide: TAURI_COMMANDS, useValue: fake }],
    });
    svc = TestBed.inject(BindingsService);
  });

  // ---------- listRepos: happy + error + validation-failure ----------

  describe('listRepos', () => {
    it('returns the parsed array on ok envelope', async () => {
      vi.mocked(fake.listRepos).mockResolvedValue({
        status: 'ok',
        data: [validRepo],
      });
      const out = await svc.listRepos();
      expect(out).toEqual([validRepo]);
    });

    it('throws a MozartError carrying the AppError kind on error envelope', async () => {
      vi.mocked(fake.listRepos).mockResolvedValue({
        status: 'error',
        error: { kind: 'Db', message: 'sqlite busy' },
      });
      await expect(svc.listRepos()).rejects.toMatchObject({
        name: 'MozartError',
        kind: 'Db',
        message: 'sqlite busy',
      });
    });

    it('throws a Validation MozartError when payload fails the schema', async () => {
      // Deliberately ill-shaped to exercise the zod validation path.
      vi.mocked(fake.listRepos).mockResolvedValue({
        status: 'ok',
        data: [{ repo_id: 'r1' }],
      } as unknown as Awaited<ReturnType<typeof fake.listRepos>>);
      await expect(svc.listRepos()).rejects.toMatchObject({
        name: 'MozartError',
        kind: 'Validation',
      });
    });

    it('wraps a JS-level rejection as an Io MozartError', async () => {
      vi.mocked(fake.listRepos).mockRejectedValue(new Error('IPC dead'));
      await expect(svc.listRepos()).rejects.toMatchObject({
        name: 'MozartError',
        kind: 'Io',
        message: 'IPC dead',
      });
    });
  });

  // ---------- listTasks ----------

  describe('listTasks', () => {
    it('forwards the repoId arg and returns the parsed list', async () => {
      vi.mocked(fake.listTasks).mockResolvedValue({ status: 'ok', data: [] });
      const out = await svc.listTasks('repo-1');
      expect(fake.listTasks).toHaveBeenCalledWith('repo-1');
      expect(out).toEqual([]);
    });

    it('throws NotFound on error envelope', async () => {
      vi.mocked(fake.listTasks).mockResolvedValue({
        status: 'error',
        error: { kind: 'NotFound', message: 'no repo' },
      });
      const err = await svc.listTasks('does-not-exist').catch((e) => e);
      expect(err).toBeInstanceOf(MozartError);
      expect(err.kind).toBe('NotFound');
    });
  });

  // ---------- listWorkspaces ----------

  describe('listWorkspaces', () => {
    it('returns parsed workspaces on ok envelope', async () => {
      vi.mocked(fake.listWorkspaces).mockResolvedValue({
        status: 'ok',
        data: [validWorkspace],
      });
      const out = await svc.listWorkspaces();
      expect(out).toHaveLength(1);
      expect(out[0]?.workspace_id).toBe('w1');
    });
  });

  // ---------- addRepo ----------

  describe('addRepo', () => {
    it('returns a single parsed repo on success', async () => {
      vi.mocked(fake.addRepo).mockResolvedValue({
        status: 'ok',
        data: validRepo,
      });
      const out = await svc.addRepo('/tmp/r');
      expect(out.repo_id).toBe('r1');
      expect(fake.addRepo).toHaveBeenCalledWith('/tmp/r');
    });
  });

  // ---------- archiveWorkspace (Result<null, …>) ----------

  describe('archiveWorkspace', () => {
    it('resolves with null on ok envelope', async () => {
      vi.mocked(fake.archiveWorkspace).mockResolvedValue({
        status: 'ok',
        data: null,
      });
      await expect(svc.archiveWorkspace('w1')).resolves.toBeNull();
      expect(fake.archiveWorkspace).toHaveBeenCalledWith('w1');
    });

    it('throws on error envelope', async () => {
      vi.mocked(fake.archiveWorkspace).mockResolvedValue({
        status: 'error',
        error: { kind: 'NotFound', message: 'gone' },
      });
      await expect(svc.archiveWorkspace('w1')).rejects.toBeInstanceOf(
        MozartError,
      );
    });
  });

  // ---------- createWorkspace ----------

  describe('createWorkspace', () => {
    it('passes repoId / baseBranch / taskText through', async () => {
      vi.mocked(fake.createWorkspace).mockResolvedValue({
        status: 'ok',
        data: validWorkspace,
      });
      const out = await svc.createWorkspace('r1', 'main', 'do thing');
      expect(fake.createWorkspace).toHaveBeenCalledWith(
        'r1',
        'main',
        'do thing',
      );
      expect(out.task_id).toBe('t1');
    });

    it('throws AgentSpawn MozartError with recovery hint on missing claude', async () => {
      vi.mocked(fake.createWorkspace).mockResolvedValue({
        status: 'error',
        error: { kind: 'AgentSpawn', message: 'no claude' },
      });
      const err = await svc
        .createWorkspace('r1', 'main', 'x')
        .catch((e) => e);
      expect(err).toBeInstanceOf(MozartError);
      expect(err.kind).toBe('AgentSpawn');
      expect(err.recovery).toBe('Open Settings → Claude CLI');
    });
  });

  // ---------- listRuns ----------

  describe('listRuns', () => {
    it('parses agent runs with nullable fields', async () => {
      vi.mocked(fake.listRuns).mockResolvedValue({
        status: 'ok',
        data: [
          {
            run_id: 'r',
            thread_id: 't',
            prompt: 'p',
            status: 'done',
            started_at: 1,
            ended_at: 2,
            exit_code: 0,
            error_message: null,
            checkpoint_sha: 'sha',
          },
        ],
      });
      const runs = await svc.listRuns('w1');
      expect(runs[0]?.checkpoint_sha).toBe('sha');
    });
  });

  // ---------- getWorkspaceDiff (returns WorkspaceChange | null) ----------

  describe('getWorkspaceDiff', () => {
    it('returns null when no diff exists', async () => {
      vi.mocked(fake.getWorkspaceDiff).mockResolvedValue({
        status: 'ok',
        data: null,
      });
      await expect(svc.getWorkspaceDiff('w1')).resolves.toBeNull();
    });

    it('returns a parsed WorkspaceChange when present', async () => {
      vi.mocked(fake.getWorkspaceDiff).mockResolvedValue({
        status: 'ok',
        data: {
          change_id: 1,
          workspace_id: 'w1',
          run_id: null,
          diff_text: '',
          files_added: 0,
          files_modified: 0,
          files_deleted: 0,
          captured_at: 1,
        },
      });
      const ch = await svc.getWorkspaceDiff('w1');
      expect(ch?.change_id).toBe(1);
    });
  });

  // ---------- discardWorkspaceChanges ----------

  describe('discardWorkspaceChanges', () => {
    it('resolves with null on ok envelope', async () => {
      vi.mocked(fake.discardWorkspaceChanges).mockResolvedValue({
        status: 'ok',
        data: null,
      });
      await expect(svc.discardWorkspaceChanges('w1')).resolves.toBeNull();
    });
  });

  // ---------- listBranches ----------

  describe('listBranches', () => {
    it('returns the string array', async () => {
      vi.mocked(fake.listBranches).mockResolvedValue({
        status: 'ok',
        data: ['main', 'feat/x'],
      });
      const branches = await svc.listBranches('/tmp/repo');
      expect(branches).toEqual(['main', 'feat/x']);
    });

    it('rejects when data is not an array of strings', async () => {
      vi.mocked(fake.listBranches).mockResolvedValue({
        status: 'ok',
        data: [1, 2, 3],
      } as unknown as Awaited<ReturnType<typeof fake.listBranches>>);
      await expect(svc.listBranches('/tmp/repo')).rejects.toMatchObject({
        kind: 'Validation',
      });
    });
  });

  // ---------- checkClaudeInstall (no envelope wrap) ----------

  describe('checkClaudeInstall', () => {
    it('forwards the direct ClaudeInstall payload', async () => {
      vi.mocked(fake.checkClaudeInstall).mockResolvedValue({
        kind: 'installed',
        version: '1.2.3',
      });
      const out = await svc.checkClaudeInstall();
      expect(out.kind).toBe('installed');
    });
  });
});
