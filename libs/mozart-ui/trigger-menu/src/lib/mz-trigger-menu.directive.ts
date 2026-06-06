import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  signal,
  ViewContainerRef,
} from '@angular/core';
import {
  type ConnectedPosition,
  Overlay,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Subscription } from 'rxjs';
import type {
  TriggerMenuContext,
  TriggerMenuNavHandler,
  TriggerSpec,
} from './trigger-menu.types';
import {
  type ActiveTrigger,
  buildTokenElement,
  findActiveTrigger,
  replaceTriggerWithToken,
  replaceTriggerWithTokens,
  tokenAfterCaret,
  tokenBeforeCaret,
} from './trigger-token';

const POSITION_BELOW: ConnectedPosition = {
  originX: 'start',
  originY: 'bottom',
  overlayX: 'start',
  overlayY: 'top',
  offsetY: 4,
};
const POSITION_ABOVE: ConnectedPosition = {
  originX: 'start',
  originY: 'top',
  overlayX: 'start',
  overlayY: 'bottom',
  offsetY: -4,
};

let nextTriggerMenuId = 0;

/**
 * Generic Notion-style trigger menu. Attach to a `contenteditable` host and
 * give it one or more `triggers` ({@link TriggerSpec}); when a configured
 * trigger char is typed it opens that trigger's `menu` near the caret, exposes
 * the live query, and inserts a configurable inline token on selection. One
 * directive instance owns ALL triggers — one overlay, one keydown owner — so a
 * single editor can drive `/`, `@`, … without duplicated trigger handling or
 * two menus fighting over Enter/Escape. Knows nothing about the trigger
 * characters, the menus, or the host feature.
 */
@Directive({
  selector: '[mzTriggerMenu]',
  host: {
    // ARIA 1.2 combobox: the field owns combobox semantics; the injected menu
    // is the listbox; the active option is reported back via the context.
    role: 'combobox',
    'aria-haspopup': 'listbox',
    '[attr.aria-expanded]': '_open()',
    '[attr.aria-controls]': '_open() ? _menuId : null',
    '[attr.aria-activedescendant]': '_activeDescendant()',
    '(input)': '_reevaluate()',
    '(keyup)': '_reevaluate()',
    '(mouseup)': '_reevaluate()',
    '(keydown)': '_onHostKeydown($event)',
    '(blur)': '_onBlur()',
  },
})
export class MzTriggerMenu<TItem = unknown, TData = unknown> {
  /** The triggers this menu watches for. The first to match at the caret wins
   *  (the one nearest the caret if several somehow overlap). */
  readonly triggers = input.required<readonly TriggerSpec<TItem, TData>[]>();
  /** Preferred side relative to the caret. CDK still flips to the other side
   *  when there isn't room. Defaults to `bottom`. */
  readonly placement = input<'top' | 'bottom'>('bottom');

  readonly opened = output<void>();
  readonly closed = output<void>();

  private readonly _host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly _doc = inject(DOCUMENT);
  private readonly _overlay = inject(Overlay);
  private readonly _vcr = inject(ViewContainerRef);

  private readonly _query = signal('');
  // Referenced from host bindings → must be at least `protected` for AOT.
  protected readonly _open = signal(false);
  // Stable id for the injected listbox (aria-controls) + the active option
  // the field points at (aria-activedescendant). Both reported via context.
  protected readonly _menuId = `mz-trigger-menu-${nextTriggerMenuId++}`;
  protected readonly _activeDescendant = signal<string | null>(null);

  private _active: ActiveTrigger | null = null;
  private _activeSpec: TriggerSpec<TItem, TData> | null = null;
  private _navHandler: TriggerMenuNavHandler | null = null;
  private _overlayRef: OverlayRef | null = null;
  private _outsideSub: Subscription | null = null;
  // Set when the user dismisses (Escape / outside click) so the menu stays
  // closed until the caret leaves the trigger context.
  private _dismissed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this._close());
  }

  protected _reevaluate(): void {
    const found = this._findActive();
    if (!found) {
      this._dismissed = false;
      if (this._open()) this._close();
      return;
    }
    if (this._dismissed) return;
    // Caret moved into a DIFFERENT trigger's context while open → swap menus by
    // closing then reopening with the new spec.
    if (this._open() && this._activeSpec !== found.spec) {
      this._close();
    }
    this._active = found.active;
    this._activeSpec = found.spec;
    this._query.set(found.active.query);
    if (this._open()) {
      this._reposition();
    } else {
      this._openMenu();
    }
  }

  // The matching trigger nearest the caret (largest triggerOffset). The
  // word-boundary rule means at most one trigger normally matches; the tiebreak
  // keeps behavior deterministic if two ever do.
  private _findActive(): {
    spec: TriggerSpec<TItem, TData>;
    active: ActiveTrigger;
  } | null {
    const selection = this._doc.getSelection();
    let best: {
      spec: TriggerSpec<TItem, TData>;
      active: ActiveTrigger;
    } | null = null;
    for (const spec of this.triggers()) {
      const active = findActiveTrigger(selection, spec.trigger);
      if (
        active &&
        (!best || active.triggerOffset > best.active.triggerOffset)
      ) {
        best = { spec, active };
      }
    }
    return best;
  }

  // Host (bubble): atomic token delete. Works whether or not the menu is
  // open; the host's consumer ignores Backspace/Delete, so order is moot.
  protected _onHostKeydown(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      const token = tokenBeforeCaret(this._doc.getSelection());
      if (token) {
        event.preventDefault();
        token.remove();
        this._emitInput();
      }
      return;
    }
    if (event.key === 'Delete') {
      const token = tokenAfterCaret(this._doc.getSelection());
      if (token) {
        event.preventDefault();
        token.remove();
        this._emitInput();
      }
    }
  }

  // Document, capture phase, only while the menu is open (added in `_openMenu`,
  // removed in `_close`). Because it runs on an ancestor during the capturing
  // phase, it intercepts nav / enter / escape BEFORE they reach the host's own
  // listeners; `stopImmediatePropagation` then keeps them from firing at all.
  // That's why a consumer (e.g. the composer) needs zero open/close state to
  // avoid submitting on Enter — the open menu fully owns these keys here.
  private readonly _onDocumentKeydown = (event: KeyboardEvent): void => {
    if (!this._open()) return;
    switch (event.key) {
      case 'ArrowDown':
        this._consume(event);
        this._navHandler?.('down');
        return;
      case 'ArrowUp':
        this._consume(event);
        this._navHandler?.('up');
        return;
      case 'Enter':
      case 'Tab':
        this._consume(event);
        this._navHandler?.('enter');
        return;
      case ' ':
        // Multi-select only: Space toggles the active row. For single-select
        // triggers Space falls through to type normally (and the trailing
        // whitespace dismisses the trigger) — the `/` menu's behavior, intact.
        if (this._activeSpec?.selectionMode === 'multi') {
          this._consume(event);
          this._navHandler?.('space');
        }
        return;
      case 'Escape':
        this._consume(event);
        this._dismissed = true;
        this._close();
        return;
    }
  };

  private _consume(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  protected _onBlur(): void {
    // Outside-pointer handling on the overlay closes the menu; blur into the
    // menu must not. A microtask defers until focus settles.
    queueMicrotask(() => {
      if (!this._overlayRef?.overlayElement.contains(this._doc.activeElement)) {
        this._close();
      }
    });
  }

  // Single-select: one token, then close.
  private _select(item: unknown): void {
    const active = this._active;
    const spec = this._activeSpec;
    if (!active || !spec) {
      this._close();
      return;
    }
    const token = buildTokenElement(spec.insert(item as TItem), this._doc);
    this._host.focus();
    replaceTriggerWithToken(active, token, this._doc);
    this._emitInput();
    this._close();
  }

  // Multi-select: replace the trigger text with one pill per item (in order),
  // space-separated, then close once. Empty commit just closes.
  private _commit(items: readonly unknown[]): void {
    const active = this._active;
    const spec = this._activeSpec;
    if (!active || !spec || items.length === 0) {
      this._close();
      return;
    }
    const tokens = items.map((item) =>
      buildTokenElement(spec.insert(item as TItem), this._doc),
    );
    this._host.focus();
    replaceTriggerWithTokens(active, tokens, this._doc);
    this._emitInput();
    this._close();
  }

  private _openMenu(): void {
    const spec = this._activeSpec;
    if (!spec) return;
    this._overlayRef = this._overlay.create({
      positionStrategy: this._strategy(),
      scrollStrategy: this._overlay.scrollStrategies.reposition(),
      disposeOnNavigation: true,
    });
    const context: TriggerMenuContext<TData> = {
      query: this._query.asReadonly(),
      data: spec.context as TData,
      mode: spec.selectionMode ?? 'single',
      select: (item) => this._select(item),
      commit: (items) => this._commit(items),
      close: () => this._close(),
      onNavKey: (handler) => (this._navHandler = handler),
      menuId: this._menuId,
      setActiveDescendant: (id) => this._activeDescendant.set(id),
    };
    const portal = new TemplatePortal(spec.menu, this._vcr, {
      $implicit: context,
    });
    this._overlayRef.attach(portal);
    this._outsideSub = this._overlayRef
      .outsidePointerEvents()
      .subscribe((event) => {
        if (!this._host.contains(event.target as Node)) {
          this._dismissed = true;
          this._close();
        }
      });
    this._doc.addEventListener('keydown', this._onDocumentKeydown, true);
    this._open.set(true);
    this.opened.emit();
  }

  private _reposition(): void {
    this._overlayRef?.updatePositionStrategy(this._strategy());
  }

  private _strategy() {
    const rect = this._caretRect();
    const positions =
      this.placement() === 'top'
        ? [POSITION_ABOVE, POSITION_BELOW]
        : [POSITION_BELOW, POSITION_ABOVE];
    return this._overlay
      .position()
      .flexibleConnectedTo({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
      .withPositions(positions)
      .withPush(true);
  }

  private _caretRect(): DOMRect {
    const active = this._active;
    if (active) {
      const range = this._doc.createRange();
      const len = active.node.textContent?.length ?? 0;
      range.setStart(active.node, Math.min(active.triggerOffset, len));
      range.setEnd(active.node, Math.min(active.caretOffset, len));
      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) return rect;
    }
    return this._host.getBoundingClientRect();
  }

  private _close(): void {
    this._doc.removeEventListener('keydown', this._onDocumentKeydown, true);
    if (!this._overlayRef) return;
    this._outsideSub?.unsubscribe();
    this._outsideSub = null;
    this._overlayRef.dispose();
    this._overlayRef = null;
    this._navHandler = null;
    this._active = null;
    this._activeSpec = null;
    this._activeDescendant.set(null);
    this._open.set(false);
    this.closed.emit();
  }

  private _emitInput(): void {
    this._host.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}
