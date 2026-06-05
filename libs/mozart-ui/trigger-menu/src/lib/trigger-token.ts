import type { EditableSegment, TokenSpec } from './trigger-menu.types';

const TOKEN_ATTR = 'data-token';
const VALUE_ATTR = 'data-token-value';
const LINE_TAGS = new Set(['DIV', 'P']);

/** A token is an inline element flagged with `data-token`. */
export function isTokenElement(node: Node | null): node is HTMLElement {
  return (
    !!node &&
    node.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).hasAttribute(TOKEN_ATTR)
  );
}

export interface ActiveTrigger {
  /** The text node holding the trigger character. */
  readonly node: Text;
  /** Offset of the trigger character within `node`. */
  readonly triggerOffset: number;
  /** Caret offset within `node`. */
  readonly caretOffset: number;
  /** Text typed between the trigger and the caret (no leading trigger). */
  readonly query: string;
}

/**
 * Inspects the collapsed caret and reports an active trigger when the text
 * immediately before the caret is `<trigger><query>` with no whitespace and
 * the trigger sits at a word boundary. Returns `null` otherwise.
 */
export function findActiveTrigger(
  selection: Selection | null,
  trigger: string,
): ActiveTrigger | null {
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const node = selection.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent ?? '';
  const caretOffset = selection.anchorOffset;

  for (let i = caretOffset - 1; i >= 0; i--) {
    const char = text[i];
    if (char === trigger) {
      const prev = text[i - 1];
      const atBoundary = i === 0 || prev === undefined || /\s/.test(prev);
      if (!atBoundary) return null;
      return {
        node: node as Text,
        triggerOffset: i,
        caretOffset,
        query: text.slice(i + 1, caretOffset),
      };
    }
    if (/\s/.test(char)) return null;
  }
  return null;
}

export function buildTokenElement(spec: TokenSpec, doc: Document): HTMLElement {
  const el = doc.createElement('span');
  el.setAttribute(TOKEN_ATTR, '');
  el.setAttribute(VALUE_ATTR, spec.value);
  el.setAttribute('contenteditable', 'false');
  el.className = `mz-trigger-token${spec.className ? ' ' + spec.className : ''}`;
  el.textContent = spec.label;
  if (spec.data !== undefined) {
    (el as HTMLElement & { _tokenData?: unknown })._tokenData = spec.data;
  }
  return el;
}

/**
 * Replaces the `<trigger><query>` range with the token element and leaves the
 * caret just after it (a trailing nbsp keeps the caret stable at the boundary).
 */
export function replaceTriggerWithToken(
  active: ActiveTrigger,
  token: HTMLElement,
  doc: Document,
): void {
  const range = doc.createRange();
  range.setStart(active.node, active.triggerOffset);
  range.setEnd(active.node, active.caretOffset);
  range.deleteContents();
  range.insertNode(token);

  const spacer = doc.createTextNode(' ');
  token.after(spacer);

  const selection = doc.getSelection();
  const caret = doc.createRange();
  caret.setStart(spacer, 1);
  caret.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(caret);
}

/** The token element directly before the collapsed caret, if any. */
export function tokenBeforeCaret(
  selection: Selection | null,
): HTMLElement | null {
  if (!selection || !selection.isCollapsed) return null;
  const node = selection.anchorNode;
  if (!node) return null;
  const offset = selection.anchorOffset;

  if (node.nodeType === Node.TEXT_NODE) {
    return offset === 0 ? asToken(node.previousSibling) : null;
  }
  return asToken(node.childNodes[offset - 1] ?? null);
}

/** The token element directly after the collapsed caret, if any. */
export function tokenAfterCaret(
  selection: Selection | null,
): HTMLElement | null {
  if (!selection || !selection.isCollapsed) return null;
  const node = selection.anchorNode;
  if (!node) return null;
  const offset = selection.anchorOffset;

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    return offset >= text.length ? asToken(node.nextSibling) : null;
  }
  return asToken(node.childNodes[offset] ?? null);
}

function asToken(node: Node | null): HTMLElement | null {
  return isTokenElement(node) ? node : null;
}

/** Plain-text serialization: tokens render as their canonical value. */
export function serializeEditable(root: HTMLElement): string {
  return segmentsToText(segmentsOf(root));
}

/** Structured serialization for consumers that need token payloads. */
export function segmentsOf(root: HTMLElement): EditableSegment[] {
  const segments: EditableSegment[] = [];
  walk(root, segments, { first: true });
  return mergeText(segments);
}

function segmentsToText(segments: EditableSegment[]): string {
  return segments.map((s) => (s.type === 'text' ? s.text : s.value)).join('');
}

function walk(
  node: Node,
  out: EditableSegment[],
  state: { first: boolean },
): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push({ type: 'text', text: child.textContent ?? '' });
      state.first = false;
    } else if (isTokenElement(child)) {
      out.push({
        type: 'token',
        value: child.getAttribute(VALUE_ATTR) ?? child.textContent ?? '',
        data: (child as HTMLElement & { _tokenData?: unknown })._tokenData,
      });
      state.first = false;
    } else if (child.nodeName === 'BR') {
      out.push({ type: 'text', text: '\n' });
    } else {
      if (LINE_TAGS.has(child.nodeName) && !state.first) {
        out.push({ type: 'text', text: '\n' });
      }
      walk(child, out, state);
    }
  }
}

function mergeText(segments: EditableSegment[]): EditableSegment[] {
  const merged: EditableSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (seg.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', text: last.text + seg.text };
    } else {
      merged.push(seg);
    }
  }
  return merged;
}
