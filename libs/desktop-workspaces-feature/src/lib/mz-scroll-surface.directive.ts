import {
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  ScrollPositionService,
  ScrollSurfaceRegistry,
  type ScrollSurface,
} from '@mozart/desktop-workspaces-data-access';

// Single scroll primitive — owns persistence + opt-in at-bottom
// detection + an imperative API for sibling consumers (composer,
// registry). One directive for chat, file diff, file edit, and any
// future surface.
//
// Lifecycle:
//   - On `key` change (input OR setKey()): snapshot prior key's
//     scrollTop into ScrollPositionService, then restore the new key's
//     stored value after the next render (or default-position when no
//     prior value exists).
//   - On `autoFollow=true`: create one IntersectionObserver on a
//     [data-scroll-sentinel] child; `isAtBottom` reflects the
//     sentinel's intersection state.
//   - On `registerAs=<id>`: register this surface in
//     ScrollSurfaceRegistry so siblings can call scrollToBottom /
//     scrollIntoView without DOM coupling.
//   - On destroy: snapshot final scrollTop, disconnect IO, unregister.
//
// Caller is responsible for `forgetFile` / `forgetWorkspace` when the
// tab/workspace closes so the in-memory persistence map doesn't grow
// forever.

export type ScrollDefaultPosition = 'top' | 'bottom';

// rootMargin extends the intersection boundary 100px below the
// scroll container — gives a "within striking distance of the
// bottom" feel rather than a hard pixel-perfect line.
const AT_BOTTOM_ROOT_MARGIN = '0px 0px 100px 0px';

@Directive({
  selector: '[mzScrollSurface]',
  exportAs: 'mzScrollSurface',
  standalone: true,
})
export class MzScrollSurface implements ScrollSurface {
  /** Persistence key. Null disables persistence (e.g. while waiting
   *  for a real id). Reactive — changes trigger snapshot + restore. */
  readonly key = input<string | null>(null, { alias: 'mzScrollSurface' });

  /** Where to land when no scrollTop is stored for the key. */
  readonly defaultPosition = input<ScrollDefaultPosition>(
    'top',
    // eslint-disable-next-line @angular-eslint/no-input-rename
    { alias: 'mzScrollSurfaceDefault' },
  );

  /** Enable IntersectionObserver-driven at-bottom detection. Requires
   *  a `[data-scroll-sentinel]` child rendered as the last in-flow
   *  element of the scroll container. */
  readonly autoFollow = input<boolean>(
    false,
    // eslint-disable-next-line @angular-eslint/no-input-rename
    { alias: 'mzScrollSurfaceAutoFollow' },
  );

  /** Register the surface in ScrollSurfaceRegistry under this id.
   *  Siblings (composer, etc.) call `registry.get(id)` for imperative
   *  scroll. Null = no registration. */
  readonly registerAs = input<string | null>(
    null,
    // eslint-disable-next-line @angular-eslint/no-input-rename
    { alias: 'mzScrollSurfaceRegisterAs' },
  );

  // --- ScrollSurface contract ---
  private readonly _isAtBottom = signal<boolean>(true);
  readonly isAtBottom = this._isAtBottom.asReadonly();

  private readonly _element = signal<HTMLElement | null>(null);
  readonly element = this._element.asReadonly();

  // Internal "active key" — both `[key]` input AND `setKey()` flow
  // through this signal. The input mirrors it via effect; setKey()
  // writes directly. Persistence effect reads from it.
  private readonly _activeKey = signal<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly service = inject(ScrollPositionService);
  private readonly registry = inject(ScrollSurfaceRegistry);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private _io: IntersectionObserver | null = null;
  private _registeredAs: string | null = null;

  constructor() {
    // Mirror the reactive [key] input into _activeKey so persistence
    // re-runs on input change. setKey() writes _activeKey directly;
    // the next input emission overrides.
    effect(() => {
      this._activeKey.set(this.key());
    });

    // Persistence: on _activeKey change, snapshot prior + restore new
    // via afterNextRender (so DOM has laid out before scrollTop write).
    effect((onCleanup) => {
      const k = this._activeKey();
      if (!k) return;

      afterNextRender(
        () => {
          const el = this.host.nativeElement;
          const stored = this.service.recall(k);
          if (stored != null) {
            // Browser clamps scrollTop to scrollHeight natively when
            // the assignment exceeds the scrollable range — no manual
            // Math.min needed. Manual clamp also breaks in jsdom
            // (scrollHeight is 0 without layout) and overshoots for
            // CodeMirror's scrollDOM where scrollHeight is async.
            el.scrollTop = stored;
          } else if (this.defaultPosition() === 'bottom') {
            el.scrollTop = el.scrollHeight;
          } else {
            el.scrollTop = 0;
          }
        },
        { injector: this.injector },
      );

      onCleanup(() => {
        this.service.remember(k, this.host.nativeElement.scrollTop);
      });
    });

    // Resolve the host element and (optional) wire IO + registry on
    // first render. `afterNextRender` fires after the projected
    // [data-scroll-sentinel] child exists so querySelector resolves.
    afterNextRender(
      () => {
        const el = this.host.nativeElement;
        this._element.set(el);

        if (this.autoFollow()) {
          this._setupAtBottomObserver(el);
        }

        const id = this.registerAs();
        if (id) {
          this.registry.register(id, this);
          this._registeredAs = id;
        }
      },
      { injector: this.injector },
    );

    // Re-register when registerAs changes mid-life (a workspace
    // identifier rebinding, etc.). Unregister the prior id first so
    // the registry never double-holds.
    effect(() => {
      const next = this.registerAs();
      const prev = this._registeredAs;
      if (prev === next) return;
      if (prev) this.registry.unregister(prev);
      if (next) {
        this.registry.register(next, this);
        this._registeredAs = next;
      } else {
        this._registeredAs = null;
      }
    });

    this.destroyRef.onDestroy(() => {
      this.detach();
    });
  }

  // --- imperative API (ScrollSurface) ---

  /** Update the persistence key imperatively. Used by the programmatic
   *  attach form (CodeMirror's scrollDOM). Directive consumers should
   *  prefer the `[mzScrollSurface]` input binding; calling setKey()
   *  works but the next input change overrides. */
  setKey(key: string | null): void {
    this._activeKey.set(key);
  }

  /** Smooth-scroll the host to its bottom. Honors prefers-reduced-motion. */
  scrollToBottom(smooth?: boolean): void {
    const el = this.host.nativeElement;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: this._effectiveBehavior(smooth),
    });
  }

  /** Smooth-scroll a child element into the viewport (ChatGPT "rides
   *  up" trick uses block: 'start'). Honors prefers-reduced-motion. */
  scrollIntoView(target: HTMLElement, opts?: ScrollIntoViewOptions): void {
    const reduced = this._prefersReducedMotion();
    target.scrollIntoView({
      block: 'start',
      ...opts,
      behavior: reduced ? 'auto' : opts?.behavior ?? 'smooth',
    });
  }

  /** Scroll to an arbitrary top offset. */
  scrollTo(top: number, smooth?: boolean): void {
    this.host.nativeElement.scrollTo({
      top,
      behavior: this._effectiveBehavior(smooth),
    });
  }

  /** Force persist the current scrollTop under the active key (if any).
   *  No-op when the key is null. */
  snapshot(): void {
    const k = this._activeKey();
    if (k) this.service.remember(k, this.host.nativeElement.scrollTop);
  }

  /** Tear down IO + registry registration, taking a final snapshot.
   *  Called automatically on destroy; the programmatic attach form
   *  exposes this for manual lifecycle. */
  detach(): void {
    this.snapshot();
    if (this._io) {
      this._io.disconnect();
      this._io = null;
    }
    if (this._registeredAs) {
      this.registry.unregister(this._registeredAs);
      this._registeredAs = null;
    }
  }

  // --- internals ---

  private _setupAtBottomObserver(scrollEl: HTMLElement): void {
    const sentinel = scrollEl.querySelector<HTMLElement>(
      '[data-scroll-sentinel]',
    );
    if (!sentinel) {
      // No sentinel — autoFollow is essentially asked for but can't
      // be derived. Leave isAtBottom at the default true and warn
      // (dev signal that the consumer template missed the sentinel).
      console.warn(
        '[mz-scroll-surface] autoFollow=true but no [data-scroll-sentinel] child found — isAtBottom stays default true',
      );
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      // Test env without polyfill — same fallback.
      return;
    }
    this._io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) this._isAtBottom.set(last.isIntersecting);
      },
      {
        root: scrollEl,
        threshold: 0,
        rootMargin: AT_BOTTOM_ROOT_MARGIN,
      },
    );
    this._io.observe(sentinel);
  }

  private _prefersReducedMotion(): boolean {
    return (
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private _effectiveBehavior(smooth?: boolean): ScrollBehavior {
    return !this._prefersReducedMotion() && smooth ? 'smooth' : 'auto';
  }
}
