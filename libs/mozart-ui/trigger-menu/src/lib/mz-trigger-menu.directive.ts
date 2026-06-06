import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  signal,
  TemplateRef,
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
  TokenInsertFn,
  TriggerMenuContext,
  TriggerMenuNavHandler,
} from './trigger-menu.types';
import {
  type ActiveTrigger,
  buildTokenElement,
  findActiveTrigger,
  replaceTriggerWithToken,
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
 * Generic Notion-style trigger menu. Attach to a `contenteditable` host; when
 * the configured `trigger` is typed it opens the injected `menu` near the
 * caret, exposes the live query, and inserts a configurable inline token on
 * selection. Knows nothing about the trigger character, the menu, or the host
 * feature.
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
  readonly trigger = input.required<string>();
  readonly menu =
    input.required<TemplateRef<{ $implicit: TriggerMenuContext<TData> }>>();
  readonly context = input<TData>();
  readonly insert = input.required<TokenInsertFn<TItem>>();
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
    const active = findActiveTrigger(this._doc.getSelection(), this.trigger());
    if (!active) {
      this._dismissed = false;
      if (this._open()) this._close();
      return;
    }
    if (this._dismissed) return;
    this._active = active;
    this._query.set(active.query);
    if (this._open()) {
      this._reposition();
    } else {
      this._openMenu();
    }
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

  private _select(item: unknown): void {
    const active = this._active;
    if (!active) {
      this._close();
      return;
    }
    const token = buildTokenElement(this.insert()(item as TItem), this._doc);
    this._host.focus();
    replaceTriggerWithToken(active, token, this._doc);
    this._emitInput();
    this._close();
  }

  private _openMenu(): void {
    this._overlayRef = this._overlay.create({
      positionStrategy: this._strategy(),
      scrollStrategy: this._overlay.scrollStrategies.reposition(),
      disposeOnNavigation: true,
    });
    const context: TriggerMenuContext<TData> = {
      query: this._query.asReadonly(),
      data: this.context() as TData,
      select: (item) => this._select(item),
      close: () => this._close(),
      onNavKey: (handler) => (this._navHandler = handler),
      menuId: this._menuId,
      setActiveDescendant: (id) => this._activeDescendant.set(id),
    };
    const portal = new TemplatePortal(this.menu(), this._vcr, {
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
    this._activeDescendant.set(null);
    this._open.set(false);
    this.closed.emit();
  }

  private _emitInput(): void {
    this._host.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}
