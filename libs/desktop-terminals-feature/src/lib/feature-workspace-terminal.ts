import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MzLoader } from '@mozart-ui/loader';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import {
  TerminalRegistry,
  type TerminalEntry,
} from '@mozart/desktop-terminals-data-access';

// Window the host stays hidden behind a loader on first mount of a
// workspace's terminal. Just enough for the shell to consume the
// PS1/PROMPT init line so the user never sees the `clear; export …`
// echo flash through. Repeat mounts of the same workspace skip the
// wait entirely.
const FIRST_OPEN_SETTLE_MS = 300;

@Component({
  selector: 'app-feature-workspace-terminal',
  imports: [MzLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full w-full select-text bg-background',
    // Plan P0.2: visual cue that the terminal is read-only. The host
    // class drives a grey filter + hides xterm's cursor layer (see
    // styles below). disableStdin already blocks input; the host
    // class is purely cosmetic so the user reads "you can't type
    // here" before they try.
    '[class.is-frozen]': 'frozen()',
  },
  template: `
    <div class="relative h-full w-full">
      <div #host class="h-full w-full p-2" [class.invisible]="loading()"></div>
      @if (loading()) {
        <div
          class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2"
          aria-hidden="true"
        >
          <mz-loader size="sm" class="text-brand" />
          <span class="text-xs text-muted-foreground">Connecting…</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host(.is-frozen) {
      opacity: 0.6;
      filter: grayscale(0.5);
    }
    :host(.is-frozen) ::ng-deep .xterm-cursor-layer {
      display: none;
    }
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
  private mountedEntry: TerminalEntry | null = null;
  private resizeObserver: ResizeObserver | null = null;
  // First-mount tracking — second+ visits skip the settle delay since
  // the PTY's already initialized.
  private readonly initialized = new Set<string>();
  // Starts `true` so the "Connecting…" placeholder paints in the same
  // frame as the lazy template materializes — closes the microtask gap
  // between component construction and `mount()` calling `loading.set`.
  // `mount()` flips this to `false` once xterm has settled (or skips
  // the wait entirely on warm mounts), and `detach()` resets it for
  // teardown.
  protected readonly loading = signal(true);

  // Plan P0.2 freeze gate — `done`/`canceled` workspaces are read-only.
  // We toggle xterm's `disableStdin` so keystrokes never reach the PTY,
  // and a host class (`is-frozen`) drives the grey/no-cursor styling.
  // The PTY itself stays alive so scrollback + log inspection keep
  // working. `protected` (not private) so the host metadata binding
  // can reach it.
  protected readonly frozen = computed(() => {
    const id = this.workspaceId();
    return id ? this.workspaces.isFrozen(id)() : false;
  });

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

    // Reflect the freeze state onto the currently-mounted xterm. Runs
    // whenever the active workspace flips status, and on first mount
    // (the value is re-applied right after `mount(id)` sets the entry).
    effect(() => {
      const isFrozen = this.frozen();
      const entry = this.mountedEntry;
      if (!entry) return;
      entry.term.options.disableStdin = isFrozen;
    });

    this.destroyRef.onDestroy(() => this.detach());
  }

  private async mount(workspaceId: string): Promise<void> {
    // Detach the previous (if any) before mounting the new one — we
    // own the host element exclusively.
    this.detach();
    const isFirstOpen = !this.initialized.has(workspaceId);
    this.loading.set(isFirstOpen);

    let entry;
    try {
      entry = await this.registry.getOrCreate(workspaceId);
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
    this.mountedEntry = entry;
    // Re-apply the current freeze state synchronously — the effect that
    // watches frozen() only re-runs when its inputs change, not when a
    // new entry is mounted, so we set it once at attach time.
    entry.term.options.disableStdin = this.frozen();

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
    this.mountedEntry = null;
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
