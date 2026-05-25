import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterFacade } from './router.facade';

const STORAGE_KEY = 'mozart-last-url-v1';

@Component({ standalone: true, template: '' })
class BlankRouted {}

function setup(): { facade: RouterFacade; router: Router } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([
        { path: '', component: BlankRouted },
        {
          path: 'project/:projectId/workspace/:workspaceId/tab/:tabId',
          component: BlankRouted,
        },
        {
          path: 'project/:projectId/workspace/:workspaceId',
          component: BlankRouted,
        },
        { path: '**', component: BlankRouted },
      ]),
    ],
  });
  const router = TestBed.inject(Router);
  const facade = TestBed.inject(RouterFacade);
  return { facade, router };
}

describe('RouterFacade', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useRealTimers();
  });

  it('derives projectId / workspaceId / tabId / tabKind from the router URL after NavigationEnd', async () => {
    const { facade, router } = setup();
    await router.navigateByUrl('/project/p-1/workspace/ws-a/tab/chat:c-1');
    expect(facade.activeProjectId()).toBe('p-1');
    expect(facade.activeWorkspaceId()).toBe('ws-a');
    expect(facade.activeTabId()).toBe('chat:c-1');
    expect(facade.activeTabKind()).toBe('chat');
  });

  it('classifies file: tabs', async () => {
    const { facade, router } = setup();
    await router.navigateByUrl(
      '/project/p-1/workspace/ws-a/tab/file:c3JjL2EudHM',
    );
    expect(facade.activeTabKind()).toBe('file');
  });

  it('returns null parts for non-workspace URLs', async () => {
    const { facade, router } = setup();
    await router.navigateByUrl('/welcome');
    expect(facade.activeWorkspaceId()).toBeNull();
    expect(facade.activeTabId()).toBeNull();
  });

  it('debounces URL writes to localStorage and persists the final URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { router } = setup();
    await router.navigateByUrl('/project/p/workspace/ws-a/tab/chat:c-1');
    await router.navigateByUrl('/project/p/workspace/ws-a/tab/chat:c-2');
    await router.navigateByUrl('/project/p/workspace/ws-a/tab/chat:c-3');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(260);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      '/project/p/workspace/ws-a/tab/chat:c-3',
    );
  });

  it('clears the persisted URL when navigating away from a workspace', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { router } = setup();
    await router.navigateByUrl('/project/p/workspace/ws-a/tab/chat:c-1');
    vi.advanceTimersByTime(260);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      '/project/p/workspace/ws-a/tab/chat:c-1',
    );
    await router.navigateByUrl('/welcome');
    vi.advanceTimersByTime(260);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('bootRestoreUrl returns the previously-stored URL exactly once', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      '/project/p/workspace/ws-a/tab/chat:c-1',
    );
    const { facade } = setup();
    expect(facade.bootRestoreUrl()).toBe(
      '/project/p/workspace/ws-a/tab/chat:c-1',
    );
    expect(facade.bootRestoreUrl()).toBeNull();
  });

  it('bootRestoreUrl is null when nothing was persisted', () => {
    const { facade } = setup();
    expect(facade.bootRestoreUrl()).toBeNull();
  });
});
