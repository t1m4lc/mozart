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

const MENU_POSITIONS: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
    offsetY: 4,
  },
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -4,
  },
];

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
    '(input)': '_reevaluate()',
    '(keyup)': '_reevaluate()',
    '(mouseup)': '_reevaluate()',
    '(keydown)': '_onKeydown($event)',
    '(blur)': '_onBlur()',
  },
})
export class MzTriggerMenu<TItem = unknown, TData = unknown> {
  readonly trigger = input.required<string>();
  readonly menu =
    input.required<TemplateRef<{ $implicit: TriggerMenuContext<TData> }>>();
  readonly context = input<TData>();
  readonly insert = input.required<TokenInsertFn<TItem>>();

  readonly opened = output<void>();
  readonly closed = output<void>();

  private readonly _host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly _doc = inject(DOCUMENT);
  private readonly _overlay = inject(Overlay);
  private readonly _vcr = inject(ViewContainerRef);

  private readonly _query = signal('');
  private readonly _open = signal(false);

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

  protected _onKeydown(event: KeyboardEvent): void {
    if (this._open()) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this._navHandler?.('down');
          return;
        case 'ArrowUp':
          event.preventDefault();
          this._navHandler?.('up');
          return;
        case 'Enter':
        case 'Tab':
          event.preventDefault();
          this._navHandler?.('enter');
          return;
        case 'Escape':
          event.preventDefault();
          this._dismissed = true;
          this._close();
          return;
      }
    }

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
    this._open.set(true);
    this.opened.emit();
  }

  private _reposition(): void {
    this._overlayRef?.updatePositionStrategy(this._strategy());
  }

  private _strategy() {
    const rect = this._caretRect();
    return this._overlay
      .position()
      .flexibleConnectedTo({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
      .withPositions(MENU_POSITIONS)
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
    if (!this._overlayRef) return;
    this._outsideSub?.unsubscribe();
    this._outsideSub = null;
    this._overlayRef.dispose();
    this._overlayRef = null;
    this._navHandler = null;
    this._active = null;
    this._open.set(false);
    this.closed.emit();
  }

  private _emitInput(): void {
    this._host.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}
