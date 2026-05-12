/**
 * Spec for `ShellStore` — TDD red→green.
 *
 * Covers:
 *   - Initial state (`rightPanelOpen = false`, `activeWorkspaceId = null`).
 *   - `centerView` switches between `'empty'` and `'chat'` based on the
 *     selected workspace exposed by `WorkspaceStore`.
 *   - `showRightPanel` is the AND of `rightPanelOpen` and a truthy
 *     `activeWorkspaceId`.
 *   - `toggleRightPanel`, `openRightPanel`, `closeRightPanel` behave as
 *     deterministic setters.
 *   - `activeWorkspaceId` stays reactive when the fake `WorkspaceStore`
 *     mutates its `selectedWorkspaceId` signal.
 *
 * The fake `WorkspaceStore` exposes only the slice ShellStore reads:
 * a writable `selectedWorkspaceId` signal. We swap it in via TestBed
 * providers so the real store (with its DB bindings) never wakes up.
 */
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ShellStore } from './shell.store';
import { WorkspaceStore } from './workspace.store';

interface FakeWorkspaceStore {
  readonly selectedWorkspaceId: WritableSignal<string | null>;
}

function configure(initialSelected: string | null = null): FakeWorkspaceStore {
  const fake: FakeWorkspaceStore = {
    selectedWorkspaceId: signal<string | null>(initialSelected),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceStore, useValue: fake }],
  });
  return fake;
}

describe('ShellStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initialises with rightPanelOpen=false and activeWorkspaceId=null', () => {
    configure(null);
    const shell = TestBed.inject(ShellStore);
    expect(shell.rightPanelOpen()).toBe(false);
    expect(shell.activeWorkspaceId()).toBeNull();
  });

  it('centerView is "empty" when no workspace is selected', () => {
    configure(null);
    const shell = TestBed.inject(ShellStore);
    expect(shell.centerView()).toBe('empty');
  });

  it('centerView is "chat" when a workspace is selected', () => {
    configure('ws-1');
    const shell = TestBed.inject(ShellStore);
    expect(shell.activeWorkspaceId()).toBe('ws-1');
    expect(shell.centerView()).toBe('chat');
  });

  it('showRightPanel is false when rightPanelOpen=false even with a workspace selected', () => {
    configure('ws-1');
    const shell = TestBed.inject(ShellStore);
    expect(shell.rightPanelOpen()).toBe(false);
    expect(shell.showRightPanel()).toBe(false);
  });

  it('showRightPanel is false when no workspace is selected even after openRightPanel', () => {
    configure(null);
    const shell = TestBed.inject(ShellStore);
    shell.openRightPanel();
    expect(shell.rightPanelOpen()).toBe(true);
    expect(shell.showRightPanel()).toBe(false);
  });

  it('showRightPanel is true only when a workspace is selected AND rightPanelOpen=true', () => {
    configure('ws-1');
    const shell = TestBed.inject(ShellStore);
    expect(shell.showRightPanel()).toBe(false);
    shell.openRightPanel();
    expect(shell.showRightPanel()).toBe(true);
  });

  it('toggleRightPanel flips rightPanelOpen on each call', () => {
    configure('ws-1');
    const shell = TestBed.inject(ShellStore);
    expect(shell.rightPanelOpen()).toBe(false);
    shell.toggleRightPanel();
    expect(shell.rightPanelOpen()).toBe(true);
    shell.toggleRightPanel();
    expect(shell.rightPanelOpen()).toBe(false);
  });

  it('openRightPanel and closeRightPanel are deterministic setters', () => {
    configure('ws-1');
    const shell = TestBed.inject(ShellStore);
    shell.openRightPanel();
    expect(shell.rightPanelOpen()).toBe(true);
    shell.openRightPanel();
    expect(shell.rightPanelOpen()).toBe(true);
    shell.closeRightPanel();
    expect(shell.rightPanelOpen()).toBe(false);
    shell.closeRightPanel();
    expect(shell.rightPanelOpen()).toBe(false);
  });

  it('activeWorkspaceId is reactive to the fake WorkspaceStore selectedWorkspaceId signal', () => {
    const fake = configure(null);
    const shell = TestBed.inject(ShellStore);
    expect(shell.activeWorkspaceId()).toBeNull();
    expect(shell.centerView()).toBe('empty');

    fake.selectedWorkspaceId.set('ws-2');
    TestBed.tick();
    expect(shell.activeWorkspaceId()).toBe('ws-2');
    expect(shell.centerView()).toBe('chat');

    fake.selectedWorkspaceId.set(null);
    TestBed.tick();
    expect(shell.activeWorkspaceId()).toBeNull();
    expect(shell.centerView()).toBe('empty');
  });
});
