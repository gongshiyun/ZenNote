import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { tableNodes, CellSelection } from '@milkdown/kit/prose/tables';
import {
  executeTableCommand,
  selectTableArea,
  type SavedCellSelection,
} from '../components/editor/tableCommands';

/**
 * End-to-end coverage for the saved-selection restore, against the REAL
 * prosemirror-tables commands (only the milkdown ctx-key lookup is stubbed).
 *
 * Scenario under test:
 *   1. The user selects cells (a CellSelection).
 *   2. They right-click — Crepe's tableBlock node view collapses the selection
 *      to a single node (`wipe` below emulates this).
 *   3. They click a row/column command in the table context menu.
 *
 * The captured `saved` selection must be re-applied so the command acts on the
 * cells the user chose; with no saved selection it must refuse (return false)
 * instead of hitting the wrong target.
 */

// Only the ctx-key lookup is stubbed; prosemirror-tables stays the real module.
vi.mock('@milkdown/kit/core', () => ({ editorViewCtx: 'editorViewCtx-key' }));

const schema = new Schema({
  nodes: {
    doc: { content: 'table+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
    ...tableNodes({
      table: 'table',
      row: 'table_row',
      cell: 'table_cell',
      header: 'table_header',
      cellContent: 'block+',
    }),
  },
});

const table = schema.nodes.table;
const row = schema.nodes.table_row;
const cell = schema.nodes.table_cell;
const para = schema.nodes.paragraph;

function textCell(type: any, content: string) {
  return type.create(null, para.create(null, schema.text(content)));
}

/** 2x2 table: a b / c d. */
function makeDoc() {
  const t = table.create(null, [
    row.create(null, [textCell(cell, 'a'), textCell(cell, 'b')]),
    row.create(null, [textCell(cell, 'c'), textCell(cell, 'd')]),
  ]);
  return schema.nodes.doc.create(null, [t]);
}

function cellNodeStarts(doc: any): number[] {
  const out: number[] = [];
  doc.descendants((n: any, pos: number) => {
    if (n.type.name === 'table_cell' || n.type.name === 'table_header') out.push(pos);
  });
  return out;
}

function countRows(doc: any): number {
  let n = 0;
  doc.descendants((node: any) => {
    if (node.type.name === 'table_row') n++;
  });
  return n;
}

function countCells(doc: any): number {
  let n = 0;
  doc.descendants((node: any) => {
    if (node.type.name === 'table_cell' || node.type.name === 'table_header') n++;
  });
  return n;
}

/** Mock live EditorView backed by a REAL EditorState. */
function makeView(doc: any, selection?: unknown) {
  let state = EditorState.create({ schema, doc, selection: selection as never });
  return {
    get state() {
      return state;
    },
    dispatch(tr: any) {
      state = state.apply(tr);
    },
  };
}

/** Crepe stand-in whose `editor.action(fn)` runs fn against a ctx returning the view. */
function fakeCrepe(view: any) {
  return { editor: { action: (fn: (c: unknown) => unknown) => fn({ get: () => view }) } };
}

/** Emulate Crepe's tableBlock collapsing the selection to the table node. */
function wipe(view: any) {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
}

describe('table commands survive a wiped selection (saved restore)', () => {
  it('addRowAfter REFUSES on a collapsed selection when no saved selection is provided', async () => {
    const doc = makeDoc();
    const starts = cellNodeStarts(doc);
    const sel = new CellSelection(doc.resolve(starts[0]), doc.resolve(starts[1]));
    const view = makeView(doc, sel);
    wipe(view);
    expect(view.state.selection).toBeInstanceOf(NodeSelection); // selection lost

    const ok = await executeTableCommand(fakeCrepe(view), 'addRowAfter');
    expect(ok).toBe(false); // degraded: refuses, does not hit a wrong target
    expect(countRows(view.state.doc)).toBe(2); // doc untouched
  });

  it('restores the saved CellSelection and inserts the row at the chosen place even after a wipe', async () => {
    const doc = makeDoc();
    const starts = cellNodeStarts(doc);
    // Selection over the top row (a + b), captured, then lost.
    const saved: SavedCellSelection = { anchor: starts[0], head: starts[1] };
    const sel = new CellSelection(doc.resolve(starts[0]), doc.resolve(starts[1]));
    const view = makeView(doc, sel);
    wipe(view);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);

    const ok = await executeTableCommand(fakeCrepe(view), 'addRowAfter', saved);
    expect(ok).toBe(true);
    expect(countRows(view.state.doc)).toBe(3); // row inserted after the top row
  });

  it('restores the saved CellSelection and deletes the chosen column even after a wipe', async () => {
    const doc = makeDoc();
    const starts = cellNodeStarts(doc);
    // Selection over the single top-left cell (a) — column 1.
    const saved: SavedCellSelection = { anchor: starts[0], head: starts[0] };
    const sel = new CellSelection(doc.resolve(starts[0]), doc.resolve(starts[0]));
    const view = makeView(doc, sel);
    wipe(view);

    const ok = await executeTableCommand(fakeCrepe(view), 'deleteColumn', saved);
    expect(ok).toBe(true);
    expect(countCells(view.state.doc)).toBe(2); // column 1 gone: b / d remain
  });

  it('selectTableArea resolves the row from the saved selection after a wipe', async () => {
    const doc = makeDoc();
    const starts = cellNodeStarts(doc);
    // Saved selection points at the single top-left cell (a).
    const saved: SavedCellSelection = { anchor: starts[0], head: starts[0] };
    const view = makeView(doc, new CellSelection(doc.resolve(starts[0]), doc.resolve(starts[0])));
    wipe(view); // selection collapsed to the table node

    const ok = await selectTableArea(fakeCrepe(view), 'row', saved);
    expect(ok).toBe(true);
    // The whole first row (a + b) is now selected.
    const sel = view.state.selection as CellSelection;
    expect(sel).toBeInstanceOf(CellSelection);
    const texts: string[] = [];
    sel.forEachCell((node: any) => texts.push(node.textContent));
    expect(texts).toEqual(['a', 'b']);
  });

  it('ignores a saved selection whose positions are no longer valid (no crash, no bogus command)', async () => {
    const doc = makeDoc();
    const view = makeView(doc);
    wipe(view);
    // Far-out-of-range saved positions must be rejected, not throw.
    const ok = await executeTableCommand(fakeCrepe(view), 'addRowAfter', { anchor: 99999, head: 99998 });
    expect(ok).toBe(false);
    expect(countRows(view.state.doc)).toBe(2);
  });
});
