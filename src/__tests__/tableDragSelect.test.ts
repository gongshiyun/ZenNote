import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { tableNodes, CellSelection } from '@milkdown/kit/prose/tables';
import { createTableDragHandlers } from '../components/editor/tableDragSelect';

/**
 * Drag-select integration tests against the REAL prosemirror-tables classes
 * and a real schema. The view is a mock whose posAtCoords maps client
 * coordinates to document positions, so the full press → drag → release flow
 * of the capture-phase handlers can be exercised end to end.
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

/** 3x3 table a b c / d e f / g h i. */
function makeDoc() {
  const t = table.create(null, [
    row.create(null, [textCell(cell, 'a'), textCell(cell, 'b'), textCell(cell, 'c')]),
    row.create(null, [textCell(cell, 'd'), textCell(cell, 'e'), textCell(cell, 'f')]),
    row.create(null, [textCell(cell, 'g'), textCell(cell, 'h'), textCell(cell, 'i')]),
  ]);
  return schema.nodes.doc.create(null, [t]);
}

/** Cell NODE start positions in document order (CellSelection constructor input). */
function cellNodeStarts(doc: any): number[] {
  const out: number[] = [];
  doc.descendants((n: any, pos: number) => {
    if (n.type.name === 'table_cell' || n.type.name === 'table_header') out.push(pos);
  });
  return out;
}

interface MockView {
  state: EditorState;
  editable: boolean;
  dispatch: (tr: any) => void;
  focus: ReturnType<typeof vi.fn>;
  posAtCoords: ReturnType<typeof vi.fn>;
}

/** Build a mock view mapping client coordinates to doc positions (or null). */
function makeView(posMap: Record<string, { pos: number; inside: number } | null>, doc: any = makeDoc()) {
  let state = EditorState.create({ schema, doc });
  const view: MockView = {
    get state() {
      return state;
    },
    editable: true,
    dispatch(tr) {
      state = state.apply(tr);
    },
    focus: vi.fn(),
    posAtCoords: vi.fn(({ left, top }: { left: number; top: number }) =>
      posMap[`${left},${top}`] ?? null,
    ),
  };
  return view;
}

function mouseEvent(partial: Partial<MouseEvent> & { button?: number; clientX: number; clientY: number }) {
  const e = {
    button: 0,
    buttons: 1,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    // Most tests press inside a cell; override per-test when needed.
    target: tdElement(),
    ...partial,
  } as unknown as MouseEvent;
  return e;
}

function tdElement() {
  const td = document.createElement('td');
  return td;
}

function handleElement() {
  const div = document.createElement('div');
  div.className = 'handle cell-handle';
  return div;
}

/** All text contents of the cells in the current CellSelection. */
function selectedCellTexts(view: MockView): string[] {
  const sel = view.state.selection as CellSelection;
  const out: string[] = [];
  sel.forEachCell((node: any) => out.push(node.textContent));
  return out;
}

describe('table drag selection', () => {
  it('dragging across 4 cells creates a CellSelection covering exactly those cells', () => {
    const starts = cellNodeStarts(makeDoc());
    const posMap = {
      '100,100': { pos: starts[0] + 1, inside: -1 }, // a
      '200,200': { pos: starts[4] + 1, inside: -1 }, // e
    };
    const view = makeView(posMap);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('dragging in the opposite direction (bottom-right → top-left) still selects the rectangle', () => {
    const starts = cellNodeStarts(makeDoc());
    const posMap = {
      '300,300': { pos: starts[8] + 1, inside: -1 }, // i
      '100,100': { pos: starts[0] + 1, inside: -1 }, // a
    };
    const view = makeView(posMap);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 300, clientY: 300 }));
    h.mousemove(mouseEvent({ clientX: 100, clientY: 100 }));

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  });

  it('dragging a single row selects only that row', () => {
    const starts = cellNodeStarts(makeDoc());
    const posMap = {
      '100,100': { pos: starts[0] + 1, inside: -1 }, // a
      '300,100': { pos: starts[2] + 1, inside: -1 }, // c
    };
    const view = makeView(posMap);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 300, clientY: 100 }));

    expect(selectedCellTexts(view)).toEqual(['a', 'b', 'c']);
  });

  it('movement within the 4px threshold does not start a drag (no dispatch)', () => {
    const starts = cellNodeStarts(makeDoc());
    const posMap = {
      '100,100': { pos: starts[0] + 1, inside: -1 },
      '103,101': { pos: starts[0] + 1, inside: -1 },
    };
    const view = makeView(posMap);
    const h = createTableDragHandlers(() => view);
    const before = view.state.selection;
    const dispatch = vi.spyOn(view, 'dispatch');

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 103, clientY: 101 }));

    expect(view.state.selection).toBe(before);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a plain click (no movement) places the caret instead of selecting cells', () => {
    const starts = cellNodeStarts(makeDoc());
    const posMap = {
      '100,100': { pos: starts[1] + 1, inside: -1 }, // b
    };
    const view = makeView(posMap);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mouseup(mouseEvent({ clientX: 100, clientY: 100 }));

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    const $pos = view.state.doc.resolve(view.state.selection.from);
    // The caret must sit inside cell b.
    expect($pos.node($pos.depth - 1).textContent).toBe('b');
    expect(view.focus).toHaveBeenCalled();
  });

  it('a plain click places the caret at the EXACT offset, not the cell/paragraph start', () => {
    // Regression: posAtCoords also reports `inside` — the START of the
    // enclosing block — and an earlier version used it, snapping every caret
    // to the left edge of the cell. Multi-character cell makes the exact
    // offset observable.
    const doc2 = schema.nodes.doc.create(null, [
      table.create(null, [row.create(null, [textCell(cell, 'hello'), textCell(cell, 'world')])]),
    ]);
    const starts: number[] = [];
    doc2.descendants((n: any, pos: number) => {
      if (n.type.name === 'table_cell') starts.push(pos);
    });
    // Click after "he" in the first cell: exact pos = starts[0]+1+2, while
    // `inside` points at the wrapping paragraph start (starts[0]+1).
    const view = makeView({
      '120,100': { pos: starts[0] + 3, inside: starts[0] + 1 },
    }, doc2);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 120, clientY: 100 }));
    h.mouseup(mouseEvent({ clientX: 120, clientY: 100 }));

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.from).toBe(starts[0] + 3); // NOT the paragraph start
    expect(view.focus).toHaveBeenCalled();
  });

  it('dragging past the table edge keeps the current selection (no crash)', () => {
    const starts = cellNodeStarts(makeDoc());
    const posMap = {
      '100,100': { pos: starts[0] + 1, inside: -1 }, // a
      '500,500': null, // outside the table
    };
    const view = makeView(posMap);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 500, clientY: 500 }));

    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
  });

  it('a whole-table drag selects all four cells (valid rectangle for row/col commands)', () => {
    // 2x2 table for a whole-table drag.
    const doc2 = schema.nodes.doc.create(null, [
      table.create(null, [
        row.create(null, [textCell(cell, 'a'), textCell(cell, 'b')]),
        row.create(null, [textCell(cell, 'c'), textCell(cell, 'd')]),
      ]),
    ]);
    const starts: number[] = [];
    doc2.descendants((n: any, pos: number) => {
      if (n.type.name === 'table_cell') starts.push(pos);
    });
    const view = makeView({
      '100,100': { pos: starts[0] + 1, inside: -1 },
      '200,200': { pos: starts[3] + 1, inside: -1 },
    }, doc2);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('mousedown on a tableBlock handle is not intercepted (no preventDefault)', () => {
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({ '100,100': { pos: starts[0] + 1, inside: -1 } });
    const h = createTableDragHandlers(() => view);

    const e = mouseEvent({ clientX: 100, clientY: 100, target: handleElement() });
    h.mousedown(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();

    // And no drag follows.
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));
    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
  });

  it('mousedown outside any cell is not intercepted', () => {
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({ '100,100': { pos: starts[0] + 1, inside: -1 } });
    const h = createTableDragHandlers(() => view);

    const e = mouseEvent({ clientX: 100, clientY: 100, target: document.createElement('div') });
    h.mousedown(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('right-click inside a cell stops propagation (protects the selection) but never preventDefault', () => {
    // Crepe's tableBlock node view turns ANY mousedown inside a cell into a
    // single-node selection, which would wipe an active CellSelection right as
    // the context menu opens. Stopping propagation keeps the event away from
    // ProseMirror; NOT preventDefault-ing still lets the browser raise
    // `contextmenu` so the menu appears.
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({ '100,100': { pos: starts[0] + 1, inside: -1 } });
    const h = createTableDragHandlers(() => view);

    const e = mouseEvent({ clientX: 100, clientY: 100, button: 2, target: tdElement() });
    h.mousedown(e);

    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
    // Right-click must never start a drag.
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));
    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
  });

  it('right-click keeps an existing CellSelection intact (no collapse)', () => {
    // Pre-select a..b via drag, then right-click: the CellSelection must
    // survive unchanged (nothing dispatched, still the same rectangle).
    const starts = cellNodeStarts(makeDoc());
    const posMap = {
      '100,100': { pos: starts[0] + 1, inside: -1 }, // a
      '200,100': { pos: starts[1] + 1, inside: -1 }, // b
      '150,100': { pos: starts[0] + 1, inside: -1 }, // right-click lands in a
    };
    const view = makeView(posMap);
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 200, clientY: 100 }));
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    const before = view.state.selection;

    const e = mouseEvent({ clientX: 150, clientY: 100, button: 2, target: tdElement() });
    h.mousedown(e);

    // The handler shielded the event; the selection object is untouched.
    expect(view.state.selection).toBe(before);
    expect(selectedCellTexts(view)).toEqual(['a', 'b']);
  });

  it('right-click OUTSIDE a cell is not intercepted (no stopPropagation)', () => {
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({ '100,100': { pos: starts[0] + 1, inside: -1 } });
    const h = createTableDragHandlers(() => view);

    const e = mouseEvent({ clientX: 100, clientY: 100, button: 2, target: document.createElement('div') });
    h.mousedown(e);

    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('mousedown with Ctrl/Shift is not intercepted', () => {
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({ '100,100': { pos: starts[0] + 1, inside: -1 } });
    const h = createTableDragHandlers(() => view);

    const ctrl = mouseEvent({ clientX: 100, clientY: 100, ctrlKey: true, target: tdElement() });
    h.mousedown(ctrl);
    expect(ctrl.preventDefault).not.toHaveBeenCalled();

    const shift = mouseEvent({ clientX: 100, clientY: 100, shiftKey: true, target: tdElement() });
    h.mousedown(shift);
    expect(shift.preventDefault).not.toHaveBeenCalled();
  });

  it('dragging into a DIFFERENT table does not select across tables', () => {
    // Two tables: first is 1x1 "A", second is 1x1 "B".
    const tA = table.create(null, [row.create(null, [textCell(cell, 'A')])]);
    const tB = table.create(null, [row.create(null, [textCell(cell, 'B')])]);
    const doc2 = schema.nodes.doc.create(null, [tA, tB]);
    const starts: number[] = [];
    doc2.descendants((n: any, pos: number) => {
      if (n.type.name === 'table_cell') starts.push(pos);
    });

    let state = EditorState.create({ schema, doc: doc2 });
    const view = {
      get state() {
        return state;
      },
      editable: true,
      dispatch(tr: any) {
        state = state.apply(tr);
      },
      focus: vi.fn(),
      posAtCoords: vi.fn(({ left }: { left: number; top: number }) => {
        if (left === 100) return { pos: starts[0] + 1, inside: -1 };
        if (left === 200) return { pos: starts[1] + 1, inside: -1 };
        return null;
      }),
    };

    const h = createTableDragHandlers(() => view);
    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 200, clientY: 100 }));

    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
  });

  it('mousemove with buttons=0 cancels a leftover drag', () => {
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({
      '100,100': { pos: starts[0] + 1, inside: -1 },
      '200,200': { pos: starts[4] + 1, inside: -1 },
    });
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    // Mouse released outside the window: the move event reports buttons=0.
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200, buttons: 0 }));

    expect(view.state.selection).not.toBeInstanceOf(CellSelection);

    // A later move without a press must not select anything either.
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));
    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
  });

  it('a single drag dispatches only distinct selections (no redundant transactions)', () => {
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({
      '100,100': { pos: starts[0] + 1, inside: -1 },
      '200,200': { pos: starts[4] + 1, inside: -1 },
    });
    const h = createTableDragHandlers(() => view);
    const dispatch = vi.spyOn(view, 'dispatch');

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));
    // Same rectangle again — the selection already equals the target.
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('mouseup after a drag keeps the CellSelection (does not collapse to caret)', () => {
    const starts = cellNodeStarts(makeDoc());
    const view = makeView({
      '100,100': { pos: starts[0] + 1, inside: -1 },
      '200,200': { pos: starts[4] + 1, inside: -1 },
    });
    const h = createTableDragHandlers(() => view);

    h.mousedown(mouseEvent({ clientX: 100, clientY: 100 }));
    h.mousemove(mouseEvent({ clientX: 200, clientY: 200 }));
    const e = mouseEvent({ clientX: 200, clientY: 200 });
    h.mouseup(e);

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view)).toEqual(['a', 'b', 'd', 'e']);
    expect(e.stopPropagation).toHaveBeenCalled();
  });
});
