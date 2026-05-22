import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Breakpoint below which the right shell pane no longer fits next to
 *  the middle pane's minimum width — the right content gets routed
 *  into a sheet overlay instead. Matches Tailwind's `lg` breakpoint so
 *  responsive CSS utilities (`max-lg:hidden`, `lg:flex`) align with
 *  this signal. */
const COMPACT_VIEWPORT_QUERY = '(max-width: 1023px)';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly leftPanelOpen = signal(true);
  readonly rightPanelOpen = signal(true);

  /** True when the viewport is too narrow to host the right shell pane
   *  alongside the middle pane. Consumers (workspace-toolbar, shell-right)
   *  flip between the inline panel and a sheet overlay based on this. */
  readonly isCompact = signal(false);

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    this.isCompact.set(mq.matches);
    const onChange = (e: MediaQueryListEvent) => this.isCompact.set(e.matches);
    mq.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
  }

  toggleLeftPanel(): void {
    this.leftPanelOpen.update((v) => !v);
  }

  toggleRightPanel(): void {
    this.rightPanelOpen.update((v) => !v);
  }
}
