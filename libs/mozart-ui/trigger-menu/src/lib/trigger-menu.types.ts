import type { Signal, TemplateRef } from '@angular/core';

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

/** Single-select commits one token and closes; multi toggles rows and commits
 *  the whole set on Enter. Defaults to `single`. */
export type TriggerSelectionMode = 'single' | 'multi';

/**
 * One trigger the directive watches for. A single `MzTriggerMenu` owns an array
 * of these, so one host (e.g. the composer editor) can drive `/`, `@`, … from
 * one directive instance — one overlay, one keydown owner, no duplicated
 * trigger handling.
 */
export interface TriggerSpec<TItem = unknown, TData = unknown> {
  /** The character that opens this menu (e.g. `/`, `@`). */
  readonly trigger: string;
  /** Listbox template injected into the caret-anchored overlay. */
  readonly menu: TemplateRef<{ $implicit: TriggerMenuContext<TData> }>;
  /** Maps a chosen item to the inline token that replaces the trigger text. */
  readonly insert: TokenInsertFn<TItem>;
  /** `multi` enables toggle-without-close + a single N-token commit on Enter. */
  readonly selectionMode?: TriggerSelectionMode;
  /** Opaque payload passed to the menu via `ctx.data`. */
  readonly context?: TData;
}

/** Navigation intents the directive forwards from the still-focused field.
 *  `space` is only forwarded for `multi` triggers (toggle the active row); for
 *  `single` triggers Space types normally and dismisses the menu. */
export type TriggerMenuNavKey = 'up' | 'down' | 'enter' | 'space';

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
  /** The active trigger's `context`, passed through untouched. */
  readonly data: TData;
  /** Selection mode of the active trigger (`single` | `multi`). The directive
   *  forwards keys identically; the menu uses this to render checkboxes and to
   *  decide whether Enter calls `select` (single) or `commit` (multi). */
  readonly mode: TriggerSelectionMode;
  /** Single-select commit: replaces the trigger text with one token and closes. */
  readonly select: (item: unknown) => void;
  /** Multi-select commit: replaces the trigger text with N space-separated
   *  tokens (one per item, in the given order), then closes once. */
  readonly commit: (items: readonly unknown[]) => void;
  /** Close the menu without inserting anything. */
  readonly close: () => void;
  /**
   * Register a handler for arrow/enter keys. Focus stays in the field, so the
   * directive intercepts these and forwards them here. Pass `null` to clear.
   */
  readonly onNavKey: (handler: TriggerMenuNavHandler | null) => void;
  /**
   * Stable id the menu must put on its listbox element. The field's
   * `aria-controls` points at it (ARIA 1.2 combobox pattern).
   */
  readonly menuId: string;
  /**
   * Report the active option's element id so the field's
   * `aria-activedescendant` can reference it. `null` clears it.
   */
  readonly setActiveDescendant: (id: string | null) => void;
}

/** Structured segment produced when serializing an editable surface. */
export type EditableSegment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'token'; readonly value: string; readonly data: unknown };
