/**
 * Spec for `ChatPanelComponent` (S1.8b.4).
 *
 * The component subscribes to `BindingsService.startAgentRun(...)` and
 * accumulates `stream_token` text into a single `tokens()` signal. On a
 * `StreamEvent::Error` it renders an inline banner with a `[Retry]`
 * button that re-fires the last prompt.
 *
 * Tests use a fake `BindingsService` that exposes a manually-controlled
 * `Subject<StreamEventDto>` so each `it()` can drive the streaming
 * lifecycle (next/complete/error) deterministically.
 */
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';

import type { StreamEventDto } from '../shared/schemas/bindings.schemas';
import { BindingsService } from '../services/bindings.service';
import { ShellStore } from '../state/shell.store';
import { WorkspaceStore } from '../state/workspace.store';
import { ChatPanelComponent } from './chat-panel.component';

interface StartReturn {
  readonly events$: Subject<StreamEventDto>;
  readonly stopSpy: ReturnType<typeof vi.fn>;
}

function setup() {
  let currentReturn: StartReturn = {
    events$: new Subject<StreamEventDto>(),
    stopSpy: vi.fn(async () => undefined),
  };
  const startSpy = vi.fn(() => {
    return {
      events$: currentReturn.events$,
      stop: currentReturn.stopSpy,
    };
  });

  const bindingsFake = {
    startAgentRun: startSpy,
  } as unknown as BindingsService;

  // Minimal WorkspaceStore fake — ShellStore depends on its
  // selectedWorkspaceId signal.
  const workspaceFake = {
    selectedWorkspaceId: signal<string | null>('ws-1'),
  };

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: BindingsService, useValue: bindingsFake },
      { provide: WorkspaceStore, useValue: workspaceFake },
    ],
  });
  // ShellStore is providedIn:'root' but depends on WorkspaceStore;
  // the override above wires the dependency.
  TestBed.inject(ShellStore);

  return {
    bindingsFake,
    workspaceFake,
    startSpy,
    /** Replace the per-run StartReturn before the next send(). Useful
     * for the Retry test to swap in a fresh Subject. */
    setNextReturn(next: StartReturn): void {
      currentReturn = next;
    },
    /** Read the currently-active stream subject. Useful when the test
     * only does one send() and wants to next/complete the events$. */
    currentEvents$: () => currentReturn.events$,
    currentStopSpy: () => currentReturn.stopSpy,
  };
}

describe('ChatPanelComponent', () => {
  beforeEach(() => {
    window.__TAURI_INTERNALS__ = { transformCallback: () => 0 };
  });

  it('renders with an empty token area and a disabled send button', () => {
    setup();
    const fixture = TestBed.createComponent(ChatPanelComponent);
    fixture.detectChanges();
    const sendBtn = fixture.nativeElement.querySelector(
      '.send-btn',
    ) as HTMLButtonElement | null;
    // Composer is in idle state; send button disabled until text is typed.
    expect(sendBtn).not.toBeNull();
    expect(sendBtn?.disabled).toBe(true);
  });

  it('accumulates stream_token events into the tokens signal', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ChatPanelComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    cmp.inputText.set('hi');
    await cmp.send(true);
    expect(ctx.startSpy).toHaveBeenCalledWith('ws-1', 'hi');

    ctx.currentEvents$().next({ kind: 'stream_token', text: 'A' });
    ctx.currentEvents$().next({ kind: 'stream_token', text: 'B' });
    fixture.detectChanges();
    // tokens() has the user-echo prefix plus the streamed chars.
    expect(cmp['tokens']()).toContain('AB');
  });

  it('toggles to a Stop button while running and back to Send on complete', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ChatPanelComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    cmp.inputText.set('hello');
    await cmp.send(true);
    fixture.detectChanges();
    expect(cmp['isRunning']()).toBe(true);
    const stopBtn = fixture.nativeElement.querySelector(
      '.stop-btn',
    ) as HTMLButtonElement | null;
    expect(stopBtn).not.toBeNull();

    ctx.currentEvents$().complete();
    fixture.detectChanges();
    expect(cmp['isRunning']()).toBe(false);
  });

  it('Stop button invokes the stop function returned by BindingsService', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ChatPanelComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    cmp.inputText.set('do thing');
    await cmp.send(true);
    fixture.detectChanges();
    await cmp.stop();
    expect(ctx.currentStopSpy()).toHaveBeenCalled();
  });

  it('renders an error banner with a Retry button on StreamEvent::Error', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ChatPanelComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    cmp.inputText.set('boom');
    await cmp.send(true);
    ctx.currentEvents$().next({ kind: 'error', message: 'boom failed' });
    fixture.detectChanges();
    expect(cmp['errorMsg']()).toBe('boom failed');
    const banner = fixture.nativeElement.querySelector(
      '.error-banner',
    ) as HTMLElement | null;
    expect(banner).not.toBeNull();
    const retryBtn = banner?.querySelector(
      '.retry-btn',
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();
  });

  it('Retry button re-fires startAgentRun with the last prompt', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ChatPanelComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    cmp.inputText.set('first');
    await cmp.send(true);
    ctx.currentEvents$().next({ kind: 'error', message: 'oops' });
    ctx.currentEvents$().complete();
    fixture.detectChanges();
    expect(cmp['isRunning']()).toBe(false);

    // Swap in a fresh stream for the retry.
    ctx.setNextReturn({
      events$: new Subject<StreamEventDto>(),
      stopSpy: vi.fn(async () => undefined),
    });
    cmp.retry();
    // retry() calls send(true) which is async; wait one tick.
    await Promise.resolve();
    expect(ctx.startSpy).toHaveBeenCalledTimes(2);
    expect(ctx.startSpy).toHaveBeenLastCalledWith('ws-1', 'first');
  });

  it('does nothing when send() is called without a selected workspace', async () => {
    const ctx = setup();
    ctx.workspaceFake.selectedWorkspaceId.set(null);
    const fixture = TestBed.createComponent(ChatPanelComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    cmp.inputText.set('hi');
    await cmp.send(true);
    expect(ctx.startSpy).not.toHaveBeenCalled();
  });

  it('shows the progress bar while isRunning() is true and hides it when false', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ChatPanelComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    // Idle: no progress bar.
    expect(
      fixture.nativeElement.querySelector('.progress-bar'),
    ).toBeNull();

    cmp.inputText.set('hi');
    await cmp.send(true);
    fixture.detectChanges();
    // Running: progress bar is in the DOM.
    expect(cmp['isRunning']()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('.progress-bar'),
    ).not.toBeNull();

    // Complete the stream — progress bar must disappear.
    ctx.currentEvents$().complete();
    fixture.detectChanges();
    expect(cmp['isRunning']()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('.progress-bar'),
    ).toBeNull();
  });
});
