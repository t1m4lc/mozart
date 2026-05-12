import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StreamEventDto } from '../shared/schemas/bindings.schemas';
import {
  BindingsService,
  EVENTS_API,
  TAURI_COMMANDS,
  type TauriCommands,
  type TauriEvents,
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

/**
 * Fake `events` object — only `agentRunTerminated.listen` is exercised
 * by the streaming surface. The spec returns the fake's
 * `emitTerminated` so individual `it` blocks can fire payloads at will.
 */
interface FakeEvents {
  readonly events: TauriEvents;
  readonly emitTerminated: (payload: { run_id: string; status: string }) => void;
  readonly unlistenSpy: ReturnType<typeof vi.fn>;
}

function createFakeEvents(): FakeEvents {
  const listeners: Array<(ev: { payload: { run_id: string; status: string } }) => void> = [];
  const unlistenSpy = vi.fn();
  const events = {
    agentRunTerminated: {
      listen: vi.fn(
        async (
          cb: (ev: { payload: { run_id: string; status: string } }) => void,
        ) => {
          listeners.push(cb);
          return () => {
            unlistenSpy();
            const idx = listeners.indexOf(cb);
            if (idx >= 0) listeners.splice(idx, 1);
          };
        },
      ),
      once: vi.fn(),
      emit: vi.fn(),
    },
  } as unknown as TauriEvents;
  return {
    events,
    emitTerminated: (payload) => {
      for (const cb of [...listeners]) cb({ payload });
    },
    unlistenSpy,
  };
}

/**
 * The Tauri Channel constructor reaches into `window.__TAURI_INTERNALS__`
 * which jsdom doesn't provide. Stub the bare minimum so `new Channel()`
 * inside `channelToObservable` does not throw.
 */
declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      transformCallback: (cb: (msg: unknown) => void, once?: boolean) => number;
    };
  }
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
  let fakeEvents: FakeEvents;

  beforeEach(() => {
    fake = createFakeCommands();
    fakeEvents = createFakeEvents();
    window.__TAURI_INTERNALS__ = { transformCallback: () => 0 };
    TestBed.configureTestingModule({
      providers: [
        { provide: TAURI_COMMANDS, useValue: fake },
        { provide: EVENTS_API, useValue: fakeEvents.events },
      ],
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

  // ---------- startAgentRun (channel-based, Q2 lock) ----------

  describe('startAgentRun', () => {
    const validRun = {
      run_id: 'run-1',
      thread_id: 't1',
      prompt: 'do',
      status: 'running',
      started_at: 1,
      ended_at: null,
      exit_code: null,
      error_message: null,
      checkpoint_sha: null,
    };

    /** Tiny helper: yield a microtask so promise chains inside
     * startAgentRun get a chance to resolve. */
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

    it('returns a { events$, stop } pair synchronously', () => {
      vi.mocked(fake.startAgentRun).mockResolvedValue({
        status: 'ok',
        data: validRun,
      });
      const result = svc.startAgentRun('w1', 'do');
      expect(result.events$).toBeDefined();
      expect(typeof result.stop).toBe('function');
    });

    it('forwards channel messages from the Rust supervisor into events$', async () => {
      vi.mocked(fake.startAgentRun).mockImplementation(
        async (_workspaceId, _prompt, channel) => {
          // Defer the push to the next microtask so the test subscriber
          // has a chance to attach before Rust "sends" anything. In the
          // real Tauri runtime the channel is async by definition.
          queueMicrotask(() => {
            const c = channel as { onmessage(msg: StreamEventDto): void };
            c.onmessage({ kind: 'stream_token', text: 'hello ' });
            c.onmessage({ kind: 'stream_token', text: 'world' });
          });
          return { status: 'ok', data: validRun };
        },
      );
      const { events$ } = svc.startAgentRun('w1', 'do');
      const collected: StreamEventDto[] = [];
      events$.subscribe((ev) => collected.push(ev));
      await tick();
      await tick();
      expect(collected).toHaveLength(2);
      expect(collected[0]).toEqual({ kind: 'stream_token', text: 'hello ' });
      expect(collected[1]).toEqual({ kind: 'stream_token', text: 'world' });
    });

    it('completes events$ when the AgentRunTerminated event lands for the run_id', async () => {
      vi.mocked(fake.startAgentRun).mockResolvedValue({
        status: 'ok',
        data: validRun,
      });
      const { events$ } = svc.startAgentRun('w1', 'do');
      let completed = false;
      events$.subscribe({ complete: () => (completed = true) });
      await tick();
      // Fire the terminated event with the matching run_id.
      fakeEvents.emitTerminated({ run_id: 'run-1', status: 'done' });
      expect(completed).toBe(true);
      expect(fakeEvents.unlistenSpy).toHaveBeenCalled();
    });

    it('ignores AgentRunTerminated events for a different run_id', async () => {
      vi.mocked(fake.startAgentRun).mockResolvedValue({
        status: 'ok',
        data: validRun,
      });
      const { events$ } = svc.startAgentRun('w1', 'do');
      let completed = false;
      events$.subscribe({ complete: () => (completed = true) });
      await tick();
      // Wrong run_id — must not complete.
      fakeEvents.emitTerminated({ run_id: 'other-run', status: 'done' });
      expect(completed).toBe(false);
    });

    it('stop() calls commands.stopAgentRun with the live run_id', async () => {
      vi.mocked(fake.startAgentRun).mockResolvedValue({
        status: 'ok',
        data: validRun,
      });
      vi.mocked(fake.stopAgentRun).mockResolvedValue({
        status: 'ok',
        data: null,
      });
      const { stop } = svc.startAgentRun('w1', 'do');
      await tick();
      await stop();
      expect(fake.stopAgentRun).toHaveBeenCalledWith('run-1');
    });

    it('stop() called before the run resolves queues the cancel and fires once run_id is known', async () => {
      // Defer the startAgentRun resolution so stop() lands first.
      let resolveStart: (v: { status: 'ok'; data: typeof validRun }) => void =
        () => undefined;
      vi.mocked(fake.startAgentRun).mockReturnValue(
        new Promise((res) => {
          resolveStart = res;
        }),
      );
      vi.mocked(fake.stopAgentRun).mockResolvedValue({
        status: 'ok',
        data: null,
      });

      const { stop } = svc.startAgentRun('w1', 'do');
      // Press stop before the start promise resolves.
      const stopPromise = stop();
      // The run_id is not yet known so stopAgentRun has not been called.
      expect(fake.stopAgentRun).not.toHaveBeenCalled();
      // Now resolve the start; the queued stop should fire.
      resolveStart({ status: 'ok', data: validRun });
      await stopPromise;
      await tick();
      expect(fake.stopAgentRun).toHaveBeenCalledWith('run-1');
    });

    it('completes events$ if commands.startAgentRun returns an error envelope', async () => {
      vi.mocked(fake.startAgentRun).mockResolvedValue({
        status: 'error',
        error: { kind: 'AgentSpawn', message: 'no claude' },
      });
      const { events$ } = svc.startAgentRun('w1', 'do');
      let completed = false;
      events$.subscribe({ complete: () => (completed = true) });
      await tick();
      expect(completed).toBe(true);
    });

    it('emits a synthetic StreamEvent::Error before completing when startAgentRun returns an error envelope', async () => {
      vi.mocked(fake.startAgentRun).mockResolvedValue({
        status: 'error',
        error: { kind: 'Io', message: 'pipe broken' },
      });
      const { events$ } = svc.startAgentRun('w1', 'do');
      const collected: StreamEventDto[] = [];
      let completed = false;
      events$.subscribe({
        next: (ev) => collected.push(ev),
        complete: () => (completed = true),
      });
      await tick();
      // The synthetic error event must land before completion so the
      // ChatPanel banner can render the message.
      expect(collected).toHaveLength(1);
      expect(collected[0]?.kind).toBe('error');
      const ev = collected[0] as { kind: 'error'; message: string };
      expect(ev.message).toContain('pipe broken');
      expect(completed).toBe(true);
    });
  });
});
