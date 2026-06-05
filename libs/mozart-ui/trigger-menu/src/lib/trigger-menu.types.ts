import type { Signal } from '@angular/core';

/** Visual + serialized shape of an inserted inline token. */
export interface TokenSpec {
  /** Text shown inside the pill. */
  readonly label: string;
  /** Canonical text the token serializes to, e.g. `/claude`. */
  readonly value: string;
  /** Arbitrary payload carried on the token for downstream consumers. */
  readonly data?: unknown;
  /** Extra classes merged onto the pill element. */
  readonly className?: string;
}

/** Maps a selected menu item to the token that replaces the trigger text. */
export type TokenInsertFn<TItem> = (item: TItem) => TokenSpec;

/** Navigation intents the directive forwards from the still-focused field. */
export type TriggerMenuNavKey = 'up' | 'down' | 'enter';

/** Handler a menu registers to react to forwarded navigation keys. */
export type TriggerMenuNavHandler = (key: TriggerMenuNavKey) => void;

/**
 * Controller handed to the injected menu through the template context
 * (`$implicit`). The directive owns the trigger/caret/token mechanics; the
 * menu owns presentation, filtering and highlight.
 */
export interface TriggerMenuContext<TData = unknown> {
  /** Live text typed after the trigger character. */
  readonly query: Signal<string>;
  /** The `context` input, passed through untouched. */
  readonly data: TData;
  /** Commit a selection — replaces the trigger text with a token. */
  readonly select: (item: unknown) => void;
  /** Close the menu without inserting anything. */
  readonly close: () => void;
  /**
   * Register a handler for arrow/enter keys. Focus stays in the field, so the
   * directive intercepts these and forwards them here. Pass `null` to clear.
   */
  readonly onNavKey: (handler: TriggerMenuNavHandler | null) => void;
}

/** Structured segment produced when serializing an editable surface. */
export type EditableSegment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'token'; readonly value: string; readonly data: unknown };
