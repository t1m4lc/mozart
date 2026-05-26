import { describe, expect, it } from 'vitest';
import { groupConsecutiveEdits } from './timeline';
import { FileEditGroupRenderer } from './renderers/file-edit-group-renderer';
import { FileEditRenderer } from './renderers/file-edit-renderer';
import { FileReadRenderer } from './renderers/file-read-renderer';
import type { TurnItem } from './turn-state.types';

// Covers the "edit, edit, edit" → "Edited N files" UI grouping.
// `groupConsecutiveEdits` is the only piece worth a tight unit test;
// the renderers themselves are exercised end-to-end in agent-message
// integration coverage.

function edit(id: string, label = id): TurnItem {
  return {
    id,
    kind: 'file-edit',
    state: 'done',
    title: 'Edit',
    fileChip: { label, added: 1, removed: 0 },
  };
}

function read(id: string): TurnItem {
  return {
    id,
    kind: 'file-read',
    state: 'done',
    title: 'Read',
  };
}

describe('groupConsecutiveEdits', () => {
  it('keeps a single file-edit as its own per-item row', () => {
    const rows = groupConsecutiveEdits([edit('e1')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].component).toBe(FileEditRenderer);
    expect(rows[0].trackId).toBe('e1');
  });

  it('folds two or more consecutive file-edits into one group row', () => {
    const rows = groupConsecutiveEdits([
      edit('e1', 'a.ts'),
      edit('e2', 'b.ts'),
      edit('e3', 'c.ts'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].component).toBe(FileEditGroupRenderer);
    expect(rows[0].inputs).toMatchObject({
      items: [expect.any(Object), expect.any(Object), expect.any(Object)],
    });
    expect((rows[0].inputs['items'] as TurnItem[]).map((i) => i.id)).toEqual([
      'e1',
      'e2',
      'e3',
    ]);
  });

  it('only groups CONSECUTIVE edits — a read in the middle breaks the run', () => {
    const rows = groupConsecutiveEdits([
      edit('e1'),
      edit('e2'),
      read('r1'),
      edit('e3'),
      edit('e4'),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].component).toBe(FileEditGroupRenderer);
    expect((rows[0].inputs['items'] as TurnItem[]).map((i) => i.id)).toEqual([
      'e1',
      'e2',
    ]);
    expect(rows[1].component).toBe(FileReadRenderer);
    expect(rows[2].component).toBe(FileEditGroupRenderer);
    expect((rows[2].inputs['items'] as TurnItem[]).map((i) => i.id)).toEqual([
      'e3',
      'e4',
    ]);
  });

  it('emits a stable trackId for the same edit group across renders', () => {
    const first = groupConsecutiveEdits([edit('e1'), edit('e2')]);
    const second = groupConsecutiveEdits([
      edit('e1'),
      edit('e2'),
      edit('e3'),
    ]);
    // Group keyed off the first item — adding a new edit to an
    // existing group reuses the same DOM node instead of remounting.
    expect(first[0].trackId).toBe('e1:edit-group');
    expect(second[0].trackId).toBe('e1:edit-group');
  });

  it('flags showConnector=false on the last row and showSpacer=false on the first', () => {
    const rows = groupConsecutiveEdits([
      read('r1'),
      edit('e1'),
      edit('e2'),
      read('r2'),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].inputs['showSpacer']).toBe(false);
    expect(rows[rows.length - 1].inputs['showConnector']).toBe(false);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].inputs['showSpacer']).toBe(true);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].inputs['showConnector']).toBe(true);
    }
  });

  it('returns the empty list for no items', () => {
    expect(groupConsecutiveEdits([])).toEqual([]);
  });
});
