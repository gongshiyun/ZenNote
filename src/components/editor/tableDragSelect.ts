/**
 * Table-cell drag selection: press the mouse inside a cell, drag across the
 * adjacent cells, release — the covered rectangle becomes a CellSelection that
 * the context menu's row/column commands (and the select-row/col/table
 * actions) operate on.
 *
 * Why this exists: Crepe's Table feature renders tables through its own node
 * view (tableBlock). Its `stopEvent`/`handleClick` turns ANY mousedown inside
 * a cell into a NodeSelection and stops ProseMirror from processing the event,
 * so prosemirror-tables' built-in drag selection (the `tableEditing` plugin's
 * handleMouseDown) never gets a chance to start. We therefore implement the
 * drag here, on the editor container, in the CAPTURE phase:
 * - mousedown inside a td/th (left button, no modifiers, not on a tableBlock
 *   handle/button/image) → preventDefault + stopPropagation (blocks both
 *   ProseMirror and the browser's native text selection) and record the
 *   anchor cell plus the EXACT text offset under the pointer;
 * - mousemove beyond a small threshold:
 *   - pointer still inside the PRESSED cell → synthesize a native-style
 *     TextSelection from the press offset to the pointer (the user is picking
 *     a text range to edit);
 *   - pointer entered ANOTHER cell → dispatch a CellSelection rectangle from
 *     the anchor cell to the cell under the pointer on every further move;
 * - mouseup: a plain click (no drag) still places the caret; a drag keeps
 *   whatever selection it built so editing / table menu commands act on it.
 */

import { CellSelection, cellAround } from "@milkdown/kit/prose/tables";
import { TextSelection } from "@milkdown/kit/prose/state";

const DRAG_THRESHOLD = 4; // px — past this a press counts as a drag

interface DragState {
  view: any;
  startX: number;
  startY: number;
  /** Anchor cell NODE start (doc position) — what CellSelection expects. */
  anchorStart: number;
  /** Exact text offset under the pointer at press time (in-cell text drag anchor). */
  anchorTextPos: number | null;
  active: boolean;
}

/**
 * Resolve the cell NODE start under the given client coordinates, or null
 * when the pointer is not inside a table cell.
 */
function cellStartAt(view: any, clientX: number, clientY: number): number | null {
  try {
    const pos = view.posAtCoords({ left: clientX, top: clientY });
    if (!pos) return null;
    const $pos = view.state.doc.resolve(pos.inside >= 0 ? pos.inside : pos.pos);
    const $cell = cellAround($pos);
    if (!$cell) return null;
    // cellAround resolves AT the cell node start (its `node(-1)` is the
    // table), which is exactly what the CellSelection constructor expects.
    return $cell.pos;
  } catch {
    return null;
  }
}

/** Whether the event target is a selectable cell body (not a handle/button). */
function cellTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (!target.closest("td, th")) return false;
  // Keep tableBlock's own handles/buttons (add row/col, align, delete) working.
  if (target.closest(".handle, button")) return false;
  // Keep dragging images inside cells working.
  if (target.closest('img, [data-type="image-block"]')) return false;
  return true;
}

export interface TableDragHandlers {
  mousedown: (e: MouseEvent) => void;
  mousemove: (e: MouseEvent) => void;
  mouseup: (e: MouseEvent) => void;
}

/**
 * Create the drag-select handlers bound to a live ProseMirror view obtained
 * through `getView` (called per event, so it always sees the current editor).
 */
export function createTableDragHandlers(getView: () => any | null): TableDragHandlers {
  let drag: DragState | null = null;

  const mousedown = (e: MouseEvent) => {
    drag = null; // a new press always restarts any leftover drag
    // Right-click inside a cell: protect the active selection. Crepe's
    // tableBlock node view converts EVERY mousedown inside a cell into a
    // single-node selection (its stopEvent → #handleClick dispatches a
    // NodeSelection, deferred ~20ms when a CellSelection is present), which
    // wipes the multi-cell selection the context menu is about to merge/split.
    // Stopping propagation in the capture phase keeps the event away from
    // ProseMirror, so the selection — and its highlight — survive until the
    // menu acts on them. Do NOT preventDefault: the browser must still raise
    // the `contextmenu` event that opens the table menu.
    if (e.button === 2) {
      if (cellTarget(e.target)) e.stopPropagation();
      return;
    }
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (!cellTarget(e.target)) return;
    const view = getView();
    if (!view || view.editable === false) return;
    const anchorStart = cellStartAt(view, e.clientX, e.clientY);
    if (anchorStart == null) return;
    // Also capture the EXACT text offset under the pointer — the anchor of an
    // in-cell TEXT drag (selecting a range of characters to edit).
    let anchorTextPos: number | null = null;
    try {
      const c = view.posAtCoords({ left: e.clientX, top: e.clientY });
      anchorTextPos = c ? c.pos : null;
    } catch { anchorTextPos = null; }
    e.preventDefault();
    e.stopPropagation();
    drag = { view, startX: e.clientX, startY: e.clientY, anchorStart, anchorTextPos, active: false };
  };

  const mousemove = (e: MouseEvent) => {
    if (!drag) return;
    if (e.buttons === 0) {
      drag = null; // mouse was released outside the window
      return;
    }
    if (!drag.active) {
      if (
        Math.abs(e.clientX - drag.startX) <= DRAG_THRESHOLD &&
        Math.abs(e.clientY - drag.startY) <= DRAG_THRESHOLD
      ) {
        return;
      }
      drag.active = true;
    }
    e.stopPropagation(); // ProseMirror must not run its own text-selection
    const headStart = cellStartAt(drag.view, e.clientX, e.clientY);
    if (headStart == null) return; // pointer left the table — keep current selection
    try {
      const doc = drag.view.state.doc;
      if (headStart === drag.anchorStart) {
        // Still inside the PRESSED cell: behave like native text selection so
        // the user can pick a range of characters to edit. The moment the
        // pointer crosses into another cell, the branch below takes over and
        // builds the cell rectangle instead.
        if (drag.anchorTextPos == null) return;
        const c = drag.view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!c) return;
        const sel = TextSelection.create(doc, drag.anchorTextPos, c.pos);
        if (!drag.view.state.selection.eq(sel)) {
          drag.view.dispatch(drag.view.state.tr.setSelection(sel));
        }
        return;
      }
      const $anchor = doc.resolve(drag.anchorStart);
      const $head = doc.resolve(headStart);
      if ($anchor.node(-1) !== $head.node(-1)) return; // different tables
      const selection = new CellSelection($anchor, $head);
      if (!drag.view.state.selection.eq(selection)) {
        drag.view.dispatch(drag.view.state.tr.setSelection(selection));
      }
    } catch {
      // Invalid rectangle/text range — keep the previous selection.
    }
  };

  const mouseup = (e: MouseEvent) => {
    if (!drag) return;
    const state = drag;
    drag = null;
    if (!state.active) {
      // A plain click: place the caret where the user pressed (ProseMirror
      // never saw the mousedown, so we do its default job here). Use
      // posAtCoords' `pos` — the EXACT character offset — and NOT `inside`
      // (that is the start of the enclosing block, which would drop the caret
      // at the left edge of the cell on every click).
      try {
        const coords = state.view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (coords) {
          const $pos = state.view.state.doc.resolve(coords.pos);
          state.view.dispatch(
            state.view.state.tr.setSelection(TextSelection.near($pos, 1))
          );
        }
      } catch {
        // Keep whatever selection already exists.
      }
      state.view.focus();
      return;
    }
    e.stopPropagation(); // PM's mouseup would move the caret — keep the CellSelection
    state.view.focus();
  };

  return { mousedown, mousemove, mouseup };
}

/**
 * Bind table drag selection to an editor container. Returns a cleanup
 * function. The capture phase runs before ProseMirror's own listeners, so
 * preventDefault/stopPropagation here reliably takes the event away from it.
 */
export function startTableDragSelect(container: HTMLElement, getView: () => any | null): () => void {
  const handlers = createTableDragHandlers(getView);
  container.addEventListener("mousedown", handlers.mousedown, true);
  window.addEventListener("mousemove", handlers.mousemove, true);
  window.addEventListener("mouseup", handlers.mouseup, true);
  return () => {
    container.removeEventListener("mousedown", handlers.mousedown, true);
    window.removeEventListener("mousemove", handlers.mousemove, true);
    window.removeEventListener("mouseup", handlers.mouseup, true);
  };
}
