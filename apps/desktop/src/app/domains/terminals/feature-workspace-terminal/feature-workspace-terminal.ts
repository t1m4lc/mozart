import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TerminalRegistry } from '../data/terminal-registry.service';

@Component({
  selector: 'app-feature-workspace-terminal',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `<div #host class="h-full w-full p-2"></div>`,
})
export class FeatureWorkspaceTerminal {
  readonly workspaceId = input<string | null>(null);
  /** True when the Terminal tab is the currently visible tab. We
   *  defer the first attach until the tab is actually shown so xterm
   *  can size against a non-zero host. */
  readonly active = input<boolean>(false);

  private readonly host =
    viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly registry = inject(TerminalRegistry);
  private readonly destroyRef = inject(DestroyRef);

  // Which workspace's xterm element is currently mounted in the host.
  // Tracked so the effect can no-op when nothing changes.
  private mounted: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      const isActive = this.active();
      if (!isActive || !id) {
        this.detach();
        return;
      }
      if (this.mounted === id) return;
      void this.mount(id);
    });

    this.destroyRef.onDestroy(() => this.detach());
  }

  private async mount(workspaceId: string): Promise<void> {
    // Detach the previous (if any) before mounting the new one — we
    // own the host element exclusively.
    this.detach();
    let entry;
    try {
      entry = await this.registry.getOrCreate(workspaceId);
    } catch (err) {
      console.warn('[terminal] open failed:', err);
      return;
    }
    // The active workspace may have changed while we were awaiting.
    if (this.workspaceId() !== workspaceId || !this.active()) {
      return;
    }
    const el = this.host().nativeElement;
    if (entry.term.element) {
      // Already opened against a previous host element — move the
      // existing element across.
      el.appendChild(entry.term.element);
    } else {
      // First time — let xterm own the container.
      entry.term.open(el);
    }
    // Initial fit + watch for container resize.
    queueMicrotask(() => {
      try {
        entry.fit.fit();
      } catch (err) {
        console.warn('[terminal] initial fit failed:', err);
      }
    });
    this.installResizeObserver(entry.fit);
    this.mounted = workspaceId;
    queueMicrotask(() => entry.term.focus());
  }

  private detach(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.mounted == null) return;
    const el = this.host?.()?.nativeElement;
    if (el) {
      while (el.firstChild) {
        el.removeChild(el.firstChild);
      }
    }
    this.mounted = null;
  }

  private installResizeObserver(fit: { fit(): void }): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch (err) {
        console.warn('[terminal] fit on resize failed:', err);
      }
    });
    this.resizeObserver.observe(this.host().nativeElement);
  }
}
