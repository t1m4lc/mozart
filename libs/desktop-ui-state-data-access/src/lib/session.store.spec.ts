import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  DEFAULT_WORKSPACE_FILE_PATH_STATE,
} from '@mozart/desktop-ui-state-util';
import { describe, expect, it, beforeEach } from 'vitest';
import { SessionStore } from './session.store';

function makeStore(): SessionStore {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  return TestBed.inject(SessionStore);
}

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('returns empty defaults when no entry exists for a workspace', () => {
    expect(store.fileTabsFor('ws-a')).toEqual([]);
    expect(store.previewFor('ws-a')).toBeNull();
    const ws = signal<string | null>('ws-a');
    const path = signal<string | null>('src/a.ts');
    expect(store.fileViewStateFor(ws, path)()).toEqual(
      DEFAULT_WORKSPACE_FILE_PATH_STATE,
    );
    expect(store.asideStateFor(ws)()).toEqual(DEFAULT_WORKSPACE_ASIDE_STATE);
    expect(store.treeExpandedFor(ws)()).toEqual([]);
    expect(store.readChatDraft('ws-a', 'c-1')).toBe('');
  });

  it('setOpenTabs records tabs for a workspace, empty list drops the entry', () => {
    store.setOpenTabs('ws-a', [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]);
    expect(store.fileTabsFor('ws-a')).toHaveLength(2);
    store.setOpenTabs('ws-a', []);
    expect(store.openFileTabs().has('ws-a')).toBe(false);
  });

  it('isolates mutations between workspaces', () => {
    store.setOpenTabs('ws-a', [{ path: 'src/a.ts' }]);
    store.setOpenTabs('ws-b', [{ path: 'src/b.ts' }]);
    expect(store.fileTabsFor('ws-a').map((t) => t.path)).toEqual(['src/a.ts']);
    expect(store.fileTabsFor('ws-b').map((t) => t.path)).toEqual(['src/b.ts']);
  });

  it('preview slot — set then clear', () => {
    store.setPreview('ws-a', 'src/a.ts');
    expect(store.previewFor('ws-a')).toBe('src/a.ts');
    store.clearPreview('ws-a');
    expect(store.previewFor('ws-a')).toBeNull();
  });

  it('upsertFileView merges patches; forgetFileView drops the path', () => {
    store.upsertFileView('ws-a', 'src/a.ts', { mode: 'diff' });
    const ws = signal<string | null>('ws-a');
    const p = signal<string | null>('src/a.ts');
    expect(store.fileViewStateFor(ws, p)().mode).toBe('diff');
    store.upsertFileView('ws-a', 'src/a.ts', { splitDiff: true });
    expect(store.fileViewStateFor(ws, p)()).toMatchObject({
      mode: 'diff',
      splitDiff: true,
    });
    store.forgetFileView('ws-a', 'src/a.ts');
    expect(store.fileViewStateFor(ws, p)()).toEqual(
      DEFAULT_WORKSPACE_FILE_PATH_STATE,
    );
  });

  it('updateAsideState merges into the workspace entry', () => {
    store.updateAsideState('ws-a', { bottomOpen: false });
    const ws = signal<string | null>('ws-a');
    expect(store.asideStateFor(ws)()).toMatchObject({
      ...DEFAULT_WORKSPACE_ASIDE_STATE,
      bottomOpen: false,
    });
  });

  it('tree expansion — set, empty array drops the entry', () => {
    const ws = signal<string | null>('ws-a');
    store.setTreeExpanded('ws-a', ['src', 'src/lib']);
    expect(store.treeExpandedFor(ws)()).toEqual(['src', 'src/lib']);
    store.setTreeExpanded('ws-a', []);
    expect(store.treeExpandedFor(ws)()).toEqual([]);
  });

  it('lastTab — set, read, isolated per workspace, idempotent on same value', () => {
    expect(store.lastTabFor('ws-a')).toBeNull();
    store.setLastTab('ws-a', 'chat:c-1');
    store.setLastTab('ws-b', 'file:abc');
    expect(store.lastTabFor('ws-a')).toBe('chat:c-1');
    expect(store.lastTabFor('ws-b')).toBe('file:abc');
    store.setLastTab('ws-a', 'chat:c-2');
    expect(store.lastTabFor('ws-a')).toBe('chat:c-2');
  });

  it('chat draft — write, read, clear, multi-chat isolation', () => {
    store.writeChatDraft('ws-a', 'c-1', 'hello');
    store.writeChatDraft('ws-a', 'c-2', 'world');
    expect(store.readChatDraft('ws-a', 'c-1')).toBe('hello');
    expect(store.readChatDraft('ws-a', 'c-2')).toBe('world');
    store.clearChatDraft('ws-a', 'c-1');
    expect(store.readChatDraft('ws-a', 'c-1')).toBe('');
    expect(store.readChatDraft('ws-a', 'c-2')).toBe('world');
  });

  it('writeChatDraft with empty string drops the entry', () => {
    store.writeChatDraft('ws-a', 'c-1', 'draft');
    store.writeChatDraft('ws-a', 'c-1', '');
    expect(store.readChatDraft('ws-a', 'c-1')).toBe('');
  });

  it('pruneWorkspace clears every per-workspace concern', () => {
    const ws = signal<string | null>('ws-a');
    store.setOpenTabs('ws-a', [{ path: 'src/a.ts' }]);
    store.setPreview('ws-a', 'src/a.ts');
    store.upsertFileView('ws-a', 'src/a.ts', { mode: 'diff' });
    store.updateAsideState('ws-a', { bottomOpen: false });
    store.setTreeExpanded('ws-a', ['src']);
    store.writeChatDraft('ws-a', 'c-1', 'hi');
    store.setLastTab('ws-a', 'chat:c-1');

    store.pruneWorkspace('ws-a');

    expect(store.fileTabsFor('ws-a')).toEqual([]);
    expect(store.previewFor('ws-a')).toBeNull();
    expect(store.fileViewMapFor(ws)()).toEqual({});
    expect(store.asideStateFor(ws)()).toEqual(DEFAULT_WORKSPACE_ASIDE_STATE);
    expect(store.treeExpandedFor(ws)()).toEqual([]);
    expect(store.readChatDraft('ws-a', 'c-1')).toBe('');
    expect(store.lastTabFor('ws-a')).toBeNull();
  });
});
