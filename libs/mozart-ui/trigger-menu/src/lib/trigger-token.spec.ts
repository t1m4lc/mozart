import { beforeEach, describe, expect, it } from 'vitest';
import {
  type ActiveTrigger,
  buildTokenElement,
  findActiveTrigger,
  replaceTriggerWithToken,
  replaceTriggerWithTokens,
  serializeEditable,
} from './trigger-token';

function editorWith(text: string): { editor: HTMLElement; node: Text } {
  const editor = document.createElement('div');
  const node = document.createTextNode(text);
  editor.appendChild(node);
  return { editor, node };
}

function activeOver(node: Text, text: string): ActiveTrigger {
  return {
    node,
    triggerOffset: 0,
    caretOffset: text.length,
    query: text.slice(1),
  };
}

describe('replaceTriggerWithTokens', () => {
  it('replaces the trigger range with N pills, nbsp-separated', () => {
    const { editor, node } = editorWith('@foo');
    replaceTriggerWithTokens(
      activeOver(node, '@foo'),
      [
        buildTokenElement({ label: '@a.ts', value: '@a.ts' }, document),
        buildTokenElement({ label: '@b.ts', value: '@b.ts' }, document),
      ],
      document,
    );
    // tokens serialize to their value; spacer is a non-breaking space.
    expect(serializeEditable(editor)).toBe('@a.ts @b.ts ');
  });

  it('single token is identical to replaceTriggerWithToken', () => {
    const a = editorWith('/rev');
    replaceTriggerWithTokens(
      activeOver(a.node, '/rev'),
      [buildTokenElement({ label: '/review', value: '/review' }, document)],
      document,
    );
    const b = editorWith('/rev');
    replaceTriggerWithToken(
      activeOver(b.node, '/rev'),
      buildTokenElement({ label: '/review', value: '/review' }, document),
      document,
    );
    expect(serializeEditable(a.editor)).toBe('/review ');
    expect(serializeEditable(a.editor)).toBe(serializeEditable(b.editor));
  });

  it('preserves surrounding text outside the trigger range', () => {
    const editor = document.createElement('div');
    const node = document.createTextNode('see @x done');
    editor.appendChild(node);
    replaceTriggerWithTokens(
      { node, triggerOffset: 4, caretOffset: 6, query: 'x' },
      [buildTokenElement({ label: '@a.ts', value: '@a.ts' }, document)],
      document,
    );
    expect(serializeEditable(editor)).toBe('see @a.ts  done');
  });
});

describe('findActiveTrigger (regression: single-mode boundary rules intact)', () => {
  let node: Text;
  beforeEach(() => {
    node = document.createTextNode('');
  });

  function selAt(text: string, caret: number): Selection {
    node.textContent = text;
    return {
      isCollapsed: true,
      rangeCount: 1,
      anchorNode: node,
      anchorOffset: caret,
    } as unknown as Selection;
  }

  it('matches a trigger at the start of text', () => {
    const a = findActiveTrigger(selAt('/rev', 4), '/');
    expect(a?.query).toBe('rev');
  });

  it('matches a trigger after whitespace', () => {
    const a = findActiveTrigger(selAt('hi /rev', 7), '/');
    expect(a?.query).toBe('rev');
  });

  it('rejects a trigger mid-word (no boundary)', () => {
    expect(findActiveTrigger(selAt('foo/rev', 7), '/')).toBeNull();
  });

  it('returns null once whitespace follows the trigger', () => {
    expect(findActiveTrigger(selAt('/rev ', 5), '/')).toBeNull();
  });
});
