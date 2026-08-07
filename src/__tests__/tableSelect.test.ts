import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { tableNodes, CellSelection } from '@milkdown/kit/prose/tables';
import { selectRow, selectCol, selectTable } from '@milkdown/kit/preset/gfm';

/**
 * Tests for the preset-gfm selection helpers (selectRow/selectCol/selectTable)
 * backing the table context menu's "选择行 / 选择列 / 选择整个表格" entries —
 * against the REAL modules the app uses at runtime.
 */

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
      // Required: Milkdown passes this explicitly — without it cells become
      // leaf nodes with no content and every table command misbehaves.
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

/** 2x2 table with text cells a b / c d. */
function makeDoc() {
  const t = table.create(null, [
    row.create(null, [textCell(cell, 'a'), textCell(cell, 'b')]),
    row.create(null, [textCell(cell, 'c'), textCell(cell, 'd')]),
  ]);
  return schema.nodes.doc.create(null, [t]);
}

function stateWith(doc = makeDoc(), selection?: unknown) {
  return EditorState.create({ schema, doc, selection: selection as never });
}

/** Positions of the four cells' inner text (from/to). */
function cellRanges(doc: any) {
  const out: Array<{ from: number; to: number }> = [];
  doc.descendants((n: any, pos: number) => {
    if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
      out.push({ from: pos + 1, to: pos + 1 + n.childCount });
    }
  });
  return out;
}

/** Text of every cell covered by a CellSelection, in document order. */
function selectedCellTexts(sel: CellSelection): string[] {
  const out: string[] = [];
  sel.forEachCell((node: any) => out.push(node.textContent));
  return out;
}

describe('preset-gfm selection helpers (selectRow/selectCol/selectTable)', () => {
  it('selectRow creates a CellSelection spanning the whole current row', () => {
    const s0 = stateWith();
    const ranges = cellRanges(s0.doc);
    const s1 = stateWith(s0.doc, TextSelection.create(s0.doc, ranges[2].from)); // row 2 (c)
    const tr = selectRow(1, ranges[2].from)(s1.tr);
    expect(tr).not.toBe(s1.tr);
    expect(tr.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(tr.selection as CellSelection)).toEqual(['c', 'd']);
  });

  it('selectCol creates a CellSelection spanning the whole current column', () => {
    const s0 = stateWith();
    const ranges = cellRanges(s0.doc);
    const s1 = stateWith(s0.doc, TextSelection.create(s0.doc, ranges[1].from)); // col 2 (b)
    const tr = selectCol(1, ranges[1].from)(s1.tr);
    expect(tr.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(tr.selection as CellSelection)).toEqual(['b', 'd']);
  });

  it('selectTable selects every cell of the table', () => {
    const s0 = stateWith();
    const tr = selectTable(s0.tr);
    expect(tr.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(tr.selection as CellSelection)).toEqual(['a', 'b', 'c', 'd']);
  });
});
