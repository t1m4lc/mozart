/**
 * `[mzShortcut]` — declarative template binding for `ShortcutService`.
 *
 * Usage:
 *   <button [mzShortcut]="{ key: 'ctrl+k', command: openPalette }">
 *
 * The directive auto-scopes the shortcut to its host element (the
 * directive's `ElementRef.nativeElement`) and tears the subscription
 * down on host destroy via `takeUntilDestroyed()`.
 */
import {
  Directive,
  ElementRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { MonoTypeOperatorFunction } from 'rxjs';

import { ShortcutService } from '../../services/shortcut.service';
import type {
  ShortcutEventOutput,
  ShortcutInput,
} from './shortcut.types';

// The `mz` prefix is intentional — Mozart-specific cross-cutting
// directives use it (per the Step 1.8a plan + CLAUDE.md vocabulary)
// to distinguish them from the generic `app*` component/UI prefix.
/* eslint-disable @angular-eslint/directive-selector */
@Directive({
  selector: '[mzShortcut]',
  standalone: true,
})
/* eslint-enable @angular-eslint/directive-selector */
export class MzShortcutDirective {
  readonly mzShortcut = input.required<ShortcutInput | null>();

  private readonly shortcuts = inject(ShortcutService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  // Capture `takeUntilDestroyed()` here — it needs the directive's
  // injection context, which is not available inside `effect()`. The
  // resulting operator is reusable across input changes.
  private readonly untilDestroyed: MonoTypeOperatorFunction<ShortcutEventOutput> =
    takeUntilDestroyed();

  constructor() {
    effect((onCleanup) => {
      const input = this.mzShortcut();
      if (input === null) return;
      const scoped: ShortcutInput = {
        ...input,
        target: input.target ?? this.host.nativeElement,
      };
      const subscription = this.shortcuts
        .register$(scoped)
        .pipe(this.untilDestroyed)
        .subscribe((out) => scoped.command(out));
      // Cleanup on input changes — host destroy is handled by
      // `takeUntilDestroyed()` above.
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
