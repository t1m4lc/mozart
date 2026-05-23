import {
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';
import { ScrollPositionService } from '@mozart/desktop-workspaces-data-access';

// Attach to any scrolling element (host must have overflow-y auto/scroll)
// to persist its scrollTop across `key` changes and component destroy.
// Used by file-diff / file-edit panes where each tab owns its own
// scroll container. Chat scrolling uses imperative orchestration in
// FeatureWorkspaceMiddle instead — because the chat scroll surface is
// `<main>` in app-shell, not the message list.
//
// Lifecycle:
//   - On key change: snapshot scrollTop of the prior key, then restore
//     the new key's value after the next render (or default-position
//     when no prior value exists).
//   - On destroy: snapshot final scrollTop.
//   - No per-scroll-event writes. The service only learns the position
//     at moments when we'd otherwise lose it.
//
// Caller is responsible for `forgetFile`-ing the key when the tab
// closes (e.g. from FileTabsService.closeFor) so the in-memory map
// doesn't grow forever.

export type ScrollDefaultPosition = 'top' | 'bottom';

@Directive({
  selector: '[mzScrollPersist]',
  standalone: true,
})
export class MzScrollPersist {
  /** Tab key. Null disables persistence (e.g. while waiting for a real id). */
  readonly key = input.required<string | null>({ alias: 'mzScrollPersist' });

  /** Where to land when no scrollTop is stored for the key. Defaults to
   *  the top — matches the typical file-viewer expectation. */
  readonly defaultPosition = input<ScrollDefaultPosition>('top', {
    alias: 'mzScrollPersistDefault',
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly service = inject(ScrollPositionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  constructor() {
    effect((onCleanup) => {
      const k = this.key();
      if (!k) return;

      // Restore is scheduled for the next render so the host element's
      // scrollHeight reflects the freshly-mounted (or newly-keyed)
      // content before we set scrollTop.
      afterNextRender(
        () => {
          const el = this.host.nativeElement;
          const stored = this.service.recall(k);
          if (stored != null) {
            el.scrollTop = stored;
          } else if (this.defaultPosition() === 'bottom') {
            el.scrollTop = el.scrollHeight;
          } else {
            el.scrollTop = 0;
          }
        },
        { injector: this.injector },
      );

      // Effect re-runs when `key` changes (the only signal read in the
      // effect body — `defaultPosition()` is read inside the
      // afterNextRender callback, outside the reactive context, so it
      // does NOT re-trigger; it's effectively a static input). The
      // cleanup snapshots the PRIOR key's scrollTop before the next
      // afterNextRender restores the new key — order matters.
      onCleanup(() => {
        this.service.remember(k, this.host.nativeElement.scrollTop);
      });
    });

    // Final snapshot on destroy. `effect`'s onCleanup only fires when
    // the effect re-runs; component teardown needs its own path.
    this.destroyRef.onDestroy(() => {
      const k = this.key();
      if (k) {
        this.service.remember(k, this.host.nativeElement.scrollTop);
      }
    });
  }
}
