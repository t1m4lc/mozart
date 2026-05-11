import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllowIn } from '../shared/keyboard/shortcut.types';
import { ShortcutService } from './shortcut.service';

/** Fire a synthetic keydown event on the document. */
function dispatchKey(opts: KeyboardEventInit): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { ...opts, bubbles: true });
  document.dispatchEvent(ev);
  return ev;
}

describe('ShortcutService', () => {
  let svc: ShortcutService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ShortcutService] });
    svc = TestBed.inject(ShortcutService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('register$ emits when the combo fires', () => {
    const seen: KeyboardEvent[] = [];
    const sub = svc
      .register$({ key: 'ctrl+k', command: () => undefined })
      .subscribe((out) => seen.push(out.event));
    dispatchKey({ key: 'k', ctrlKey: true });
    sub.unsubscribe();
    expect(seen).toHaveLength(1);
  });

  it('register$ does NOT emit when the combo does not match', () => {
    const seen: KeyboardEvent[] = [];
    const sub = svc
      .register$({ key: 'ctrl+k', command: () => undefined })
      .subscribe((out) => seen.push(out.event));
    dispatchKey({ key: 'j', ctrlKey: true });
    dispatchKey({ key: 'k' }); // missing ctrl
    sub.unsubscribe();
    expect(seen).toHaveLength(0);
  });

  it('register returns a dispose callback that detaches the listener', () => {
    const cmd = vi.fn();
    const dispose = svc.register({ key: 'escape', command: cmd });
    dispatchKey({ key: 'Escape' });
    expect(cmd).toHaveBeenCalledTimes(1);
    dispose();
    dispatchKey({ key: 'Escape' });
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it('blocks fire when focus is inside an INPUT by default', () => {
    const cmd = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const dispose = svc.register({ key: 'ctrl+k', command: cmd });
    const ev = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    input.dispatchEvent(ev);
    expect(cmd).not.toHaveBeenCalled();
    dispose();
    input.remove();
  });

  it('fires inside an INPUT when allowIn includes "INPUT"', () => {
    const cmd = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const dispose = svc.register({
      key: 'ctrl+k',
      command: cmd,
      allowIn: [AllowIn.Input],
    });
    const ev = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    input.dispatchEvent(ev);
    expect(cmd).toHaveBeenCalledTimes(1);
    dispose();
    input.remove();
  });

  it('key: "all" matches every keydown', () => {
    const cmd = vi.fn();
    const dispose = svc.register({ key: 'all', command: cmd });
    dispatchKey({ key: 'a' });
    dispatchKey({ key: 'b', shiftKey: true });
    expect(cmd).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('throttleTime gates rapid bursts', () => {
    vi.useFakeTimers();
    const cmd = vi.fn();
    const dispose = svc.register({
      key: 'escape',
      throttleTime: 100,
      command: cmd,
    });
    dispatchKey({ key: 'Escape' });
    dispatchKey({ key: 'Escape' });
    dispatchKey({ key: 'Escape' });
    expect(cmd).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    dispatchKey({ key: 'Escape' });
    expect(cmd).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('preventDefault is called when the flag is set', () => {
    const cmd = vi.fn();
    const dispose = svc.register({
      key: 'ctrl+k',
      preventDefault: true,
      command: cmd,
    });
    const ev = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ev);
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    dispose();
  });

  it('scopes to a target element when provided', () => {
    const cmd = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = svc.register({
      key: 'escape',
      command: cmd,
      target: host,
    });
    // Document-level event must NOT trigger:
    dispatchKey({ key: 'Escape' });
    expect(cmd).not.toHaveBeenCalled();
    // Element-level event MUST trigger:
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cmd).toHaveBeenCalledTimes(1);
    dispose();
    host.remove();
  });

  it('accepts a multi-combo input ["ctrl+k", "cmd+k"]', () => {
    const cmd = vi.fn();
    const dispose = svc.register({
      key: ['ctrl+k', 'cmd+k'],
      command: cmd,
    });
    dispatchKey({ key: 'k', ctrlKey: true });
    // metaKey behaviour depends on platform; on jsdom (linux-like)
    // the cmd variant won't fire — but the ctrl one absolutely should.
    expect(cmd).toHaveBeenCalledTimes(1);
    dispose();
  });
});
