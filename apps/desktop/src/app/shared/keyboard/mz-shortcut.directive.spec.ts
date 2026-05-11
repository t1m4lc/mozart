import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShortcutInput } from './shortcut.types';
import { MzShortcutDirective } from './mz-shortcut.directive';

@Component({
  selector: 'app-host',
  imports: [MzShortcutDirective],
  template: '<div [mzShortcut]="shortcut()" tabindex="0" #host></div>',
})
class HostComponent {
  readonly shortcut = signal<ShortcutInput | null>(null);
}

describe('MzShortcutDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('fires the command when the combo matches a key event on the host element', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const cmd = vi.fn();
    fixture.componentInstance.shortcut.set({ key: 'escape', command: cmd });
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('div') as HTMLElement;
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it('disposes the subscription when the host component is destroyed', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const cmd = vi.fn();
    fixture.componentInstance.shortcut.set({ key: 'escape', command: cmd });
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('div') as HTMLElement;
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cmd).toHaveBeenCalledTimes(1);

    fixture.destroy();

    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it('passes preventDefault through to the underlying ShortcutService', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const cmd = vi.fn();
    fixture.componentInstance.shortcut.set({
      key: 'escape',
      command: cmd,
      preventDefault: true,
    });
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('div') as HTMLElement;
    const ev = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
