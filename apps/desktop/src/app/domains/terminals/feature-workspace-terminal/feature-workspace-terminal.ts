import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { HlmLoaderImports } from '@mozart/ui/loader';
import { WorkspacesFacade } from '../../workspaces';
import { TerminalRegistry } from '../data/terminal-registry.service';

// Window the host stays hidden behind a loader on first mount of a
// workspace's terminal. Just enough for the shell to consume the
// PS1/PROMPT init line so the user never sees the `clear; export …`
// echo flash through. Repeat mounts of the same workspace skip the
// wait entirely.
const FIRST_OPEN_SETTLE_MS = 300;

@Component({
  selector: 'app-feature-workspace-terminal',
  imports: [...HlmLoaderImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <div class="relative h-full w-full">
      <div #host class="h-full w-full p-2" [class.invisible]="loading()"></div>
      @if (loading()) {
        <div
          class="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <hlm-loader size="sm" class="text-brand" />
        </div>
      }
    </div>
  `,
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
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly destroyRef = inject(DestroyRef);

  // Which workspace's xterm element is currently mounted in the host.
  // Tracked so the effect can no-op when nothing changes.
  private mounted: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  // First-mount tracking — second+ visits skip the settle delay since
  // the PTY's already initialized.
  private readonly initialized = new Set<string>();
  protected readonly loading = signal(false);

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
    const ws = this.workspaces.workspaceById(workspaceId)();
    const label = ws?.name ?? workspaceId.slice(0, 8);
    const isFirstOpen = !this.initialized.has(workspaceId);
    this.loading.set(isFirstOpen);

    let entry;
    try {
      entry = await this.registry.getOrCreate(workspaceId, label);
    } catch (err) {
      console.warn('[terminal] open failed:', err);
      this.loading.set(false);
      return;
    }
    // The active workspace may have changed while we were awaiting.
    if (this.workspaceId() !== workspaceId || !this.active()) {
      this.loading.set(false);
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

    if (isFirstOpen) {
      // Give the shell a beat to swallow the PS1/PROMPT init line
      // before exposing xterm to the user. xterm is already buffering
      // the bytes off-screen behind the loader; once the prompt is
      // settled we drop the veil.
      await new Promise((r) => setTimeout(r, FIRST_OPEN_SETTLE_MS));
      this.initialized.add(workspaceId);
      // Re-check the active workspace — the user may have switched tabs.
      if (this.workspaceId() !== workspaceId || !this.active()) {
        this.loading.set(false);
        return;
      }
    }
    this.loading.set(false);
    queueMicrotask(() => entry.term.focus());
  }

  private detach(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.loading.set(false);
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
