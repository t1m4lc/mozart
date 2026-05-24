import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_WORKSPACE_FILE_PATH_STATE,
  type PersistedFileTab,
} from '@mozart/desktop-ui-state-util';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { FileTabsStore } from './file-tabs.store';

// File-tab persistence slice. Covers reshape (per-path mode — R5
// regression), open-tabs list shape, last-active tabId restore, and
// pruneWorkspace fan-out.

describe('FileTabsStore', () => {
  const STORAGE_KEY = 'mozart-file-tabs-v1';
  const wsA = 'workspace-a';
  const wsB = 'workspace-b';

  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  describe('setOpenTabs', () => {
    it('starts empty', () => {
      const store = TestBed.inject(FileTabsStore);
      expect(store.fileTabsByWorkspace()[wsA]).toBeUndefined();
    });

    it('stores per-workspace open lists', () => {
      const store = TestBed.inject(FileTabsStore);
      const tabs: PersistedFileTab[] = [
        { path: 'src/a.ts' },
        { path: 'src/b.ts' },
      ];
      store.setOpenTabs(wsA, tabs);
      expect(store.fileTabsByWorkspace()[wsA]).toEqual(tabs);
    });

    it('drops the entry when set to empty (compact storage)', () => {
      const store = TestBed.inject(FileTabsStore);
      store.setOpenTabs(wsA, [{ path: 'src/a.ts' }]);
      store.setOpenTabs(wsA, []);
      expect(store.fileTabsByWorkspace()[wsA]).toBeUndefined();
    });

    it('persists across re-initialization (relaunch)', () => {
      const store = TestBed.inject(FileTabsStore);
      store.setOpenTabs(wsA, [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const next = TestBed.inject(FileTabsStore);
      expect(next.fileTabsByWorkspace()[wsA]).toEqual([
        { path: 'src/a.ts' },
        { path: 'src/b.ts' },
      ]);
    });
  });

  describe('setLastActiveTab', () => {
    it('stores the last-active tabId per workspace', () => {
      const store = TestBed.inject(FileTabsStore);
      store.setLastActiveTab(wsA, 'file:c3Jj');
      expect(store.lastActiveTabIdByWorkspace()[wsA]).toBe('file:c3Jj');
    });

    it('drops the entry on null (workspace returns to chat default)', () => {
      const store = TestBed.inject(FileTabsStore);
      store.setLastActiveTab(wsA, 'chat:abc');
      store.setLastActiveTab(wsA, null);
      expect(store.lastActiveTabIdByWorkspace()[wsA]).toBeUndefined();
    });

    it('persists across re-initialization', () => {
      const store = TestBed.inject(FileTabsStore);
      store.setLastActiveTab(wsA, 'chat:xyz');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const next = TestBed.inject(FileTabsStore);
      expect(next.lastActiveTabIdByWorkspace()[wsA]).toBe('chat:xyz');
    });
  });

  describe('upsertFileView — per-path mode (R5 regression)', () => {
    it('R5: keeps per-path mode independent across two paths in the same workspace', () => {
      const store = TestBed.inject(FileTabsStore);
      store.upsertFileView(wsA, 'src/a.ts', {
        mode: 'edit',
        source: 'all-files',
      });
      store.upsertFileView(wsA, 'src/b.ts', {
        mode: 'diff',
        source: 'changes',
      });

      expect(store.fileViewByWorkspace()[wsA]?.['src/a.ts']?.mode).toBe('edit');
      expect(store.fileViewByWorkspace()[wsA]?.['src/b.ts']?.mode).toBe('diff');
    });

    it('merge-patches partial updates on an existing per-path entry', () => {
      const store = TestBed.inject(FileTabsStore);
      store.upsertFileView(wsA, 'src/a.ts', {
        mode: 'edit',
        source: 'all-files',
      });
      store.upsertFileView(wsA, 'src/a.ts', { splitDiff: true });

      expect(store.fileViewByWorkspace()[wsA]?.['src/a.ts']).toEqual({
        ...DEFAULT_WORKSPACE_FILE_PATH_STATE,
        mode: 'edit',
        source: 'all-files',
        splitDiff: true,
      });
    });

    it('isolates state per workspace', () => {
      const store = TestBed.inject(FileTabsStore);
      store.upsertFileView(wsA, 'src/shared.ts', { mode: 'edit' });
      store.upsertFileView(wsB, 'src/shared.ts', { mode: 'diff' });

      expect(store.fileViewByWorkspace()[wsA]?.['src/shared.ts']?.mode).toBe(
        'edit',
      );
      expect(store.fileViewByWorkspace()[wsB]?.['src/shared.ts']?.mode).toBe(
        'diff',
      );
    });
  });

  describe('forgetFileView', () => {
    it('drops a single path entry (called on tab close)', () => {
      const store = TestBed.inject(FileTabsStore);
      store.upsertFileView(wsA, 'src/a.ts', { mode: 'edit' });
      store.upsertFileView(wsA, 'src/b.ts', { mode: 'diff' });

      store.forgetFileView(wsA, 'src/a.ts');

      expect(store.fileViewByWorkspace()[wsA]?.['src/a.ts']).toBeUndefined();
      expect(store.fileViewByWorkspace()[wsA]?.['src/b.ts']).toBeDefined();
    });

    it('drops the workspace entry entirely when the last path is forgotten', () => {
      const store = TestBed.inject(FileTabsStore);
      store.upsertFileView(wsA, 'src/a.ts', { mode: 'edit' });
      store.forgetFileView(wsA, 'src/a.ts');
      expect(store.fileViewByWorkspace()[wsA]).toBeUndefined();
    });

    it('is idempotent on miss', () => {
      const store = TestBed.inject(FileTabsStore);
      store.forgetFileView(wsA, 'src/never-opened.ts');
      expect(store.fileViewByWorkspace()).toEqual({});
    });
  });

  describe('pruneWorkspace', () => {
    it('drops file tabs, last-active, and per-path views for the workspace', () => {
      const store = TestBed.inject(FileTabsStore);
      store.setOpenTabs(wsA, [{ path: 'src/a.ts' }]);
      store.setLastActiveTab(wsA, 'file:c3Jj');
      store.upsertFileView(wsA, 'src/a.ts', { mode: 'edit' });
      store.setOpenTabs(wsB, [{ path: 'src/other.ts' }]);

      store.pruneWorkspace(wsA);

      expect(store.fileTabsByWorkspace()[wsA]).toBeUndefined();
      expect(store.lastActiveTabIdByWorkspace()[wsA]).toBeUndefined();
      expect(store.fileViewByWorkspace()[wsA]).toBeUndefined();
      // Untouched sibling survives.
      expect(store.fileTabsByWorkspace()[wsB]).toBeDefined();
    });
  });

  describe('split-key hydration', () => {
    it('hydrates only its own key — unrelated UiStateStore key is untouched', () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          fileTabsByWorkspace: { [wsA]: [{ path: 'src/restored.ts' }] },
          lastActiveTabIdByWorkspace: {},
          fileViewByWorkspace: {},
        }),
      );
      window.localStorage.setItem(
        'mozart-ui-state-v1',
        JSON.stringify({ asideStateByWorkspace: {} }),
      );

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const store = TestBed.inject(FileTabsStore);
      expect(store.fileTabsByWorkspace()[wsA]).toEqual([
        { path: 'src/restored.ts' },
      ]);

      window.localStorage.removeItem('mozart-ui-state-v1');
    });
  });
});
