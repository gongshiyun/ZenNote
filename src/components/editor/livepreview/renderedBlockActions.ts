/**
 * Interactive affordances for rendered blocks in the Live Preview editor.
 *
 * A rendered diagram, image or table is widget DOM, not document text, so
 * clicking it is a command rather than a caret placement. This module reattaches
 * the actions the Crepe editor offered on those blocks:
 *   - a zoom button on every rendered Mermaid diagram and image
 *   - a click-to-open align toolbar on images (left / centre / right)
 *   - a right-click menu on tables (insert / delete row and column, drop table)
 *   - a language chip and copy button on every fenced code block
 *
 * The last two write back into the markdown source, which is why the helpers in
 * ./renderedBlockHelpers are pure and separately tested.
 */
import { EditorView, ViewPlugin } from "@codemirror/view";
import { EditorSelection, type SelectionRange } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { openZoomOverlay } from "../zoomOverlay";
import { t } from "../../../i18n";
import {
  cellRectOf,
  cellsOf,
  cellsToTsv,
  deleteColumn,
  deleteColumnRange,
  deleteRow,
  deleteRowRange,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  parseImageAlt,
  rectContains,
  rowOf,
  setColumnAlign,
  type CellPos,
  type CellRect,
  type ImageAlign,
} from "./renderedBlockHelpers";
import { parseAlign } from "./livePreview";

const ZOOM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>';

/* ------------------------------------------------------------ image alignment */

/** Alignment metadata marker written into the image's optional title. */
const ALIGN_TITLE_RE = /\bzn:align=(left|center|right)\b/gi;

/** Documents written before the fix stored `"<ratio>|<align>"` in the ALT. */
const LEGACY_ALT_RE = /^\d+(?:\.\d+)?\|(left|center|right)$/i;

/**
 * Read an image node's current alignment.
 *
 * The alignment is stored as a `zn:align=` marker in the image title. Notes
 * written by the previous editor kept it in the alt text (`"<ratio>|<align>"`),
 * so that form is still read as a fallback; anything unparseable is centred.
 */
function imageAlignOf(text: string): ImageAlign {
  const title = /"([^"]*)"\s*\)$/.exec(text)?.[1] ?? "";
  const fromTitle = /\bzn:align=(left|center|right)\b/i.exec(title)?.[1]?.toLowerCase();
  if (fromTitle === "left" || fromTitle === "right" || fromTitle === "center") {
    return fromTitle;
  }
  const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? "";
  return parseImageAlt(alt).align;
}

/**
 * Rewrite an image's markdown with a new alignment.
 *
 * The author's alt text is NEVER touched. The old implementation replaced the
 * whole alt with `<ratio>|<align>`, so nudging an image's alignment silently
 * destroyed the author's description and the image's accessible name; the
 * alignment now lives in the optional title as a `zn:align=` marker instead.
 *
 * Returns null when the source does not have the shape `![alt](url "title")`,
 * in which case the caller leaves the document alone rather than risk
 * corrupting markdown this helper cannot round-trip.
 */
function withImageAlignSource(text: string, align: ImageAlign): string | null {
  if (!text.startsWith("![") || !text.endsWith(")")) return null;
  const close = text.indexOf("](");
  if (close < 0) return null;
  const alt = text.slice(2, close);
  const dest = text.slice(close + 2, -1);
  // The optional title is the last double-quoted run; everything before it is
  // the URL. Single-quoted / parenthesised titles are not round-tripped here.
  const titleMatch = /^(.*?)(?:\s+"([^"]*)")?$/.exec(dest);
  if (!titleMatch) return null;
  const url = titleMatch[1].trim();
  if (!url) return null;
  // A leftover quoted run means an unsupported title form: don't touch it.
  if (/\s/.test(url) && !/^<.*>$/.test(url)) return null;
  if (/['"]\s*$/.test(url)) return null;
  const existingTitle = (titleMatch[2] ?? "").replace(ALIGN_TITLE_RE, "").trim();
  const nextTitle = existingTitle ? `${existingTitle} zn:align=${align}` : `zn:align=${align}`;
  // A legacy-encoded alt was never author copy; clear it so it stops leaking.
  const nextAlt = LEGACY_ALT_RE.test(alt.trim()) ? "" : alt;
  return `![${nextAlt}](${url} "${nextTitle}")`;
}

/* ------------------------------------------------------------- table editing */

/**
 * In-place cell editing for a rendered table.
 *
 * Clicking a cell swaps that one cell into its raw markdown and makes it
 * editable; committing writes the cell back into the table's source lines.
 * This is the Typora gesture, and it is the reason the table is rendered as a
 * widget at all rather than left as source.
 *
 * Two things make this fiddly, both handled here:
 *   - the widget is rebuilt whenever the document changes, so an edit destroys
 *     the DOM it ran in. Tab/Shift+Tab therefore record where to go next and
 *     re-activate that cell after the rebuild.
 *   - the table's document range can only be trusted at the moment it is read,
 *     so it is re-derived from the DOM position on every commit rather than
 *     captured once.
 */
interface CellTarget {
  row: number; // -1 = header
  col: number;
}

/** Set while a cell is mid-commit, so the resulting blur does not re-enter. */
let committing = false;

/** What committing a cell should do next. */
type CellMove =
  | "next"
  | "prev"
  | "down"
  | "none" // navigation and plain commits
  | "insert" // Ctrl+Enter: a new row below the current one
  | "rowUp"
  | "rowDown"
  | "colLeft"
  | "colRight"; // Alt+arrows: reorder, like Typora's table moves

/** Alt+Arrow reorders a table row/column, mirroring Typora. */
const ALT_ARROW_MOVES: Record<string, CellMove> = {
  ArrowUp: "rowUp",
  ArrowDown: "rowDown",
  ArrowLeft: "colLeft",
  ArrowRight: "colRight",
};

/** The table's current source range, derived from its rendered position. */
function tableRange(view: EditorView, wrap: HTMLElement): { from: number; to: number } | null {
  let from: number;
  try { from = view.posAtDOM(wrap, 0); } catch { return null; }
  const node = nodeRangeAt(view, "Table", from);
  return node ? { from: node.from, to: node.to } : null;
}

/** Find the rendered table that starts at `from`, after a rebuild. */
function tableElementAt(view: EditorView, from: number): HTMLElement | null {
  try {
    const at = view.domAtPos(from);
    const node = at.node.nodeType === 3 ? at.node.parentElement : (at.node as HTMLElement);
    return (node?.closest?.(".cm-zn-table-wrap") as HTMLElement | null)
      ?? (node?.querySelector?.(".cm-zn-table-wrap") as HTMLElement | null);
  } catch {
    return null;
  }
}

function cellElement(wrap: HTMLElement, row: number, col: number): HTMLElement | null {
  return wrap.querySelector<HTMLElement>(
    `.cm-zn-table [data-row="${row}"][data-col="${col}"]`,
  );
}

/** The cell address stored on a rendered cell. */
function cellPos(el: HTMLElement): CellPos {
  return { row: Number(el.dataset.row ?? "-1"), col: Number(el.dataset.col ?? "0") };
}

/** The element a live native text selection is anchored in, or null. */
function nativeSelectionAnchor(): Element | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  const anchor = sel.anchorNode;
  return anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
}

/**
 * The editor's selection just before the last mousedown.
 *
 * A commit caused by clicking into the editor text must keep the caret that
 * click placed (that is where the user is about to type); any other commit
 * leaves the selection stale — somewhere the user is not — and the undo
 * transaction would scroll back to it. Comparing the current selection with
 * this snapshot tells the two apart.
 */
let selectionAtMouseDown: EditorSelection | null = null;

/**
 * A cursor just outside a table's range.
 *
 * A table edit leaves the editor's own selection wherever it happened to be —
 * often far from the table — and the undo transaction restores that selection
 * with `scrollIntoView`, which yanks the viewport away. Moving the caret to
 * this position before the edit makes the history record it, so undo lands
 * (and scrolls) at the table instead. The position must stay OUTSIDE the
 * range: a cursor touching it would reveal the raw markdown.
 */
function cursorNearTable(view: EditorView, node: { from: number; to: number }): SelectionRange | null {
  if (node.from > 0) return EditorSelection.cursor(node.from - 1);
  if (node.to < view.state.doc.length) return EditorSelection.cursor(node.to + 1);
  return null;
}

/**
 * Markdown delimiters for the marks `appendInline` (widgets.ts) can produce.
 * A link is handled separately because it carries an href.
 */
const MARK_WRAPPERS: Record<string, [string, string]> = {
  strong: ["**", "**"],
  em: ["*", "*"],
  strike: ["~~", "~~"],
  mark: ["==", "=="],
  code: ["`", "`"],
};

/**
 * Turn an edited cell back into markdown.
 *
 * The cell is edited with its rendered content still in place, so the marks have
 * to be reconstructed from the DOM instead of read from the source. That is
 * only possible because `appendInline` is the single thing that produces this
 * markup: the set of classes worth recognising is closed, and anything else —
 * including the wrappers contenteditable invents on its own — is treated as
 * plain text, which is the safe reading of it.
 *
 * Typing markdown still works, incidentally: a literal `**x**` typed into a cell
 * contains no marks to serialise, so it round-trips unchanged and is re-parsed as
 * bold on the next render.
 */
function serializeCell(cell: HTMLElement): string {
  const parts: string[] = [];

  const emit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      // A cell may not contain an unescaped pipe.
      parts.push((node.nodeValue ?? "").replace(/(?<!\\)\|/g, "\\|"));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    // A soft line break has no markdown form inside a cell.
    if (el.tagName === "BR") {
      parts.push(" ");
      return;
    }

    const before = parts.length;
    for (const child of Array.from(el.childNodes)) emit(child);
    const text = parts.splice(before).join("");

    const className = typeof el.className === "string" ? el.className : "";
    const mark = /cm-zn-inline-(\w+)/.exec(className)?.[1];
    if (mark === "link") {
      parts.push(`[${text}](${el.getAttribute("href") ?? ""})`);
      return;
    }
    const wrap = mark ? MARK_WRAPPERS[mark] : undefined;
    // A run the user emptied must not leave `****` behind.
    parts.push(wrap && text ? `${wrap[0]}${text}${wrap[1]}` : text);
  };

  for (const child of Array.from(cell.childNodes)) emit(child);
  return parts.join("");
}

/**
 * Cells whose commit wiring is already attached. Elements are recreated by
 * every rebuild, so the set never grows beyond the live widgets.
 */
const wiredCells = new WeakSet<HTMLElement>();

/**
 * Attach the commit wiring for one cell: Tab / Enter / Escape handling and the
 * blur that serializes the cell back into the table's source.
 *
 * Deliberately separate from activating the edit UI, and idempotent per
 * element: focus alone — a mousedown, which is also how a text selection
 * starts — must already make typing safe (the cell is editable content, so a
 * keystroke would otherwise change the DOM without ever reaching the
 * document). It does not move the caret or touch the selection.
 */
function wireCell(
  view: EditorView,
  wrap: HTMLElement,
  td: HTMLElement,
  lines: string[],
  lineIndex: number,
  width: number,
  target: CellTarget,
): void {
  if (wiredCells.has(td)) return;
  wiredCells.add(td);

  const cells = cellsOf(lines[lineIndex]);
  const original = cells[target.col] ?? "";

  const finish = (move: CellMove, cancel = false) => {
    if (committing) return;
    committing = true;
    const value = cancel ? original : serializeCell(td);
    const changed = !cancel && value !== original;
    td.classList.remove("cm-zn-cell-editing");

    // Work out where focus should go before the widget is rebuilt.
    let nextTarget: CellTarget | null = null;
    let grow = false;
    let insertBelow = false;
    // Reorders are deferred to one closure: the committed text is written into
    // its row first and then moves along with that row/column.
    let reorder: ((lines: string[]) => string[]) | null = null;
    if (move === "next") {
      // Tab past the last cell adds a row. A table editor is expected to work
      // that way, and with the table always rendered it is the only keyboard
      // route to a new row. Data rows are lines[2..], so the last one is
      // `lines.length - 3`.
      grow = target.col >= width - 1 && target.row >= lines.length - 3;
      nextTarget = target.col + 1 < width
        ? { row: target.row, col: target.col + 1 }
        : { row: target.row + 1, col: 0 };
    } else if (move === "prev") {
      nextTarget = target.col > 0
        ? { row: target.row, col: target.col - 1 }
        : { row: target.row - 1, col: width - 1 };
    } else if (move === "down") {
      nextTarget = { row: target.row + 1, col: target.col };
    } else if (move === "insert") {
      // Ctrl+Enter: a fresh row below the current one (below the header when
      // the caret sits in the header), caret in the same column of it.
      insertBelow = true;
      nextTarget = { row: target.row + 1, col: target.col };
    } else if (move === "rowUp" || move === "rowDown") {
      const to = move === "rowUp" ? target.row - 1 : target.row + 1;
      if (target.row >= 0 && to >= 0 && to <= lines.length - 3) {
        reorder = l => moveRow(l, target.row, to);
        nextTarget = { row: to, col: target.col };
      } else if (changed) {
        // At the boundary the order stays; keep the cell after the commit.
        nextTarget = target;
      }
    } else if (move === "colLeft" || move === "colRight") {
      const to = move === "colLeft" ? target.col - 1 : target.col + 1;
      if (to >= 0 && to < width) {
        reorder = l => moveColumn(l, target.col, to);
        nextTarget = { row: target.row, col: to };
      } else if (changed) {
        nextTarget = target;
      }
    }

    const tableChanged = changed || grow || insertBelow || reorder !== null;
    if (tableChanged) {
      const next = cells.slice();
      if (changed) next[target.col] = value;
      let newLines = lines.slice();
      newLines[lineIndex] = rowOf(next, width);
      if (grow) newLines.push(rowOf(new Array(width).fill(""), width));
      if (insertBelow) newLines = insertRow(newLines, target.row);
      if (reorder) newLines = reorder(newLines);
      const range = tableRange(view, wrap);
      if (range) {
        // The table's start offset survives the edit (only cell text changed),
        // so it is a stable handle for re-finding the widget after the rebuild.
        const tableFrom = range.from;
        // A blur-commit that followed a click into the editor text must keep
        // the caret that click placed. Every other commit leaves a stale
        // selection the undo would scroll back to, so the caret is moved next
        // to the table FIRST — the history records the selection a change had
        // before it ran, so it has to be in place before the change dispatch.
        const keepCaret = move === "none"
          && selectionAtMouseDown !== null
          && !view.state.selection.eq(selectionAtMouseDown);
        if (!keepCaret) {
          const near = cursorNearTable(view, range);
          if (near) view.dispatch({ selection: near });
        }
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: newLines.join("\n") },
        });
        if (nextTarget) scheduleActivation(view, tableFrom, nextTarget);
      }
    } else {
      const range = tableRange(view, wrap);
      if (nextTarget && range) scheduleActivation(view, range.from, nextTarget);
    }
    committing = false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Never intercept a keystroke that belongs to an IME composition: Enter
    // would commit the cell mid-word (and Tab would skip cells) while Chinese
    // candidates are still being chosen.
    if (e.isComposing || e.keyCode === 229) {
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish("none", true);
      view.focus();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      finish(e.shiftKey ? "prev" : "next");
      return;
    }
    // Ctrl+Enter inserts a row below (before plain Enter, which it contains).
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finish("insert");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      finish("down");
      return;
    }
    // Alt+arrows move the current row/column, like Typora's table moves.
    if (e.altKey && ALT_ARROW_MOVES[e.key]) {
      e.preventDefault();
      finish(ALT_ARROW_MOVES[e.key]);
      return;
    }
    // Everything else is ordinary typing inside the cell.
    e.stopPropagation();
  };

  td.addEventListener("keydown", onKeyDown);
  // Permanent, not `once`: an unchanged blur keeps the element alive, so the
  // next focus/blur cycle has to commit as well.
  td.addEventListener("blur", () => finish("none"));
}

/**
 * Turn a cell into the editing one: the commit wiring, plus the visible state —
 * the outline and the caret. `caret: "keep"` wires without either, for focus
 * that arrived as part of a selection gesture.
 */
function activateCell(
  view: EditorView,
  wrap: HTMLElement,
  td: HTMLElement,
  lines: string[],
  lineIndex: number,
  width: number,
  target: CellTarget,
  caret: "end" | "keep",
): void {
  wireCell(view, wrap, td, lines, lineIndex, width, target);
  if (caret === "keep") return;

  td.classList.add("cm-zn-cell-editing");
  // The rendered content is deliberately NOT replaced with its source. Revealing
  // the markdown on a click made every table look like it had fallen apart, when
  // all the reader wanted was to put the caret in a cell. The marks stay rendered
  // and `serializeCell` puts them back on commit.

  // Put the caret at the end and select nothing, so typing appends rather than
  // wiping a cell the user only meant to look at.
  try {
    const range = document.createRange();
    range.selectNodeContents(td);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch { /* selection is best-effort */ }
  td.focus();
}

/**
 * Activate a cell after the widget has been rebuilt.
 *
 * Keyed off the table's start offset rather than its element: the element is
 * destroyed and recreated by the very edit that triggers this, so holding a
 * reference to it would always be stale.
 */
function scheduleActivation(view: EditorView, tableFrom: number, target: CellTarget): void {
  setTimeout(() => {
    const node = nodeRangeAt(view, "Table", tableFrom);
    if (!node) return;
    const lines = view.state.sliceDoc(node.from, node.to).split("\n");
    if (lines.length < 2) return;
    const width = cellsOf(lines[1]).length;

    let row = target.row;
    let col = target.col;
    // Tab past the last column wraps; Shift+Tab before the first wraps back.
    if (col < 0) { col = width - 1; row -= 1; }
    if (col >= width) { col = 0; row += 1; }
    if (row < -1) return;

    // Tab past the last row appends one, which is what a table editor is
    // expected to do rather than trapping the user at the end.
    if (row > lines.length - 3) {
      const withRow = insertRow(lines, lines.length - 3);
      const near = cursorNearTable(view, node);
      if (near) view.dispatch({ selection: near });
      view.dispatch({
        changes: { from: node.from, to: node.to, insert: withRow.join("\n") },
      });
      scheduleActivation(view, node.from, { row, col });
      return;
    }

    const wrap = tableElementAt(view, node.from);
    if (!wrap) return;
    const td = cellElement(wrap, row, col);
    if (!td) return;
    const lineIndex = row < 0 ? 0 : row + 2;
    activateCell(view, wrap, td, lines, lineIndex, width, { row, col }, "end");
  }, 0);
}

/**
 * Enter edit mode on a clicked cell, or — with `caret: "keep"` — only attach
 * the commit wiring for a cell that just received focus (a mousedown that may
 * be the start of a text selection).
 */
function beginCellEdit(
  view: EditorView,
  wrap: HTMLElement,
  td: HTMLElement,
  caret: "end" | "keep" = "end",
): void {
  const range = tableRange(view, wrap);
  if (!range) return;
  const lines = view.state.sliceDoc(range.from, range.to).split("\n");
  if (lines.length < 2) return;
  const width = cellsOf(lines[1]).length;
  const row = Number(td.dataset.row ?? "-1");
  const col = Number(td.dataset.col ?? "0");
  const lineIndex = row < 0 ? 0 : row + 2;
  if (lineIndex >= lines.length || col >= width) return;
  activateCell(view, wrap, td, lines, lineIndex, width, { row, col }, caret);
}

/* ------------------------------------------------------------------- helpers */


function asCommandButton(btn: HTMLButtonElement, title: string, onClick: () => void): void {
  btn.type = "button";
  btn.title = title;
  // mousedown would move the caret into the widget instead of pressing it.
  btn.addEventListener("mousedown", e => e.preventDefault());
  btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
}

interface NodeRange {
  from: number;
  to: number;
  text: string;
}

/**
 * The range of the nearest ancestor node of `name` covering `pos`.
 *
 * Walks up from the resolved node (O(depth)) rather than iterating the document,
 * because this runs on every click.
 */
function nodeRangeAt(view: EditorView, name: string, pos: number): NodeRange | null {
  let node = syntaxTree(view.state).resolve(pos, 1);
  while (node.parent && node.name !== name) node = node.parent;
  if (node.name !== name) return null;
  return { from: node.from, to: node.to, text: view.state.sliceDoc(node.from, node.to) };
}

/* ---------------------------------------------------------------- the manager */

class RenderedBlockManager {
  private readonly view: EditorView;
  private imageBar: HTMLElement | null = null;
  private tableMenu: HTMLElement | null = null;
  /** Where a press inside a table cell began, to tell a click from a drag. */
  private cellDown: { x: number; y: number; cell: HTMLElement } | null = null;
  /**
   * The cell the pointer was last over. The table's row/column button lives on
   * the frame, not in a cell, so without this the menu would have no row or
   * column to act on.
   */
  private hoverCell: HTMLElement | null = null;
  /** The painted cell-range selection, if one is active. */
  private cellSel: { wrap: HTMLElement; rect: CellRect } | null = null;
  /** The cell-range drag in progress, if the pointer went down on a cell. */
  private cellDrag: { anchor: CellPos; wrap: HTMLElement; active: boolean } | null = null;
  /**
   * Set when a drag ended as a cell range, so the click that follows the
   * mouseup does not also open a cell for editing.
   */
  private suppressClick = false;

  private readonly onMouseOver = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement)?.closest?.(
      ".cm-zn-table th, .cm-zn-table td",
    ) as HTMLElement | null;
    // Only ever set, never cleared: moving onto the button leaves the last cell
    // as the target, which is what the menu should act on.
    if (cell) this.hoverCell = cell;
  };

  private readonly onContextMenu = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement)?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (!cell) { this.closeTableMenu(); return; }
    const wrap = cell.closest(".cm-zn-table-wrap") as HTMLElement | null;
    if (!wrap) return;
    this.closeImageBar();
    // A right-click over selected text is a text gesture: the browser's own
    // menu (copy, paste, ...) is what belongs there, so nothing is prevented.
    if (nativeSelectionAnchor()?.closest(".cm-zn-table-wrap") === wrap) {
      this.closeTableMenu();
      return;
    }
    // Inside a painted range the menu operates on the range; anywhere else the
    // table menu stays out of the way — row/column operations remain on the
    // frame's own button.
    const sel = this.cellSel;
    const pos = cellPos(cell);
    const inRange = !!sel && sel.wrap === wrap && sel.wrap.isConnected
      && rectContains(sel.rect, pos.row, pos.col);
    if (!inRange) {
      this.closeTableMenu();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.openTableMenu(e.clientX, e.clientY, wrap, cell, sel ? sel.rect : null);
  };

  private readonly onDocPointerDown = (e: MouseEvent) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt?.closest?.(".zn-lp-image-bar") || tgt?.closest?.(".zn-lp-table-menu")
        || tgt?.closest?.(".cm-zn-table-ops")) return;
    this.closeImageBar();
    this.closeTableMenu();
    // A press outside the painted range drops it; a press inside it keeps the
    // range alive so the menu (which opens on the following click or
    // contextmenu) still has something to act on.
    const sel = this.cellSel;
    if (!sel) return;
    const cell = tgt?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (!cell || cell.closest(".cm-zn-table-wrap") !== sel.wrap) {
      this.clearCellSelection();
      return;
    }
    const pos = cellPos(cell);
    if (!rectContains(sel.rect, pos.row, pos.col)) this.clearCellSelection();
  };

  constructor(view: EditorView) {
    this.view = view;
    view.dom.addEventListener("mousedown", this.onMouseDownCapture, true);
    view.dom.addEventListener("click", this.onClickCapture, true);
    view.dom.addEventListener("mouseover", this.onMouseOver);
    view.dom.addEventListener("contextmenu", this.onContextMenu);
    view.dom.addEventListener("focusin", this.onCellFocus);
    document.addEventListener("mousedown", this.onDocPointerDown, true);
    document.addEventListener("copy", this.onCopy, true);
  }

  /**
   * mousedown only RECORDS where the press started.
   *
   * The first version called preventDefault here to enter cell editing, which
   * made native text selection inside a cell impossible — dragging to copy did
   * nothing. The decision to edit now waits for the click, and a click that
   * moved is treated as a selection drag instead.
   *
   * A left press on a cell also arms the cell-range drag: it stays dormant
   * while the pointer moves within the starting cell (that is a text
   * selection), and only takes over once it crosses into another cell.
   */
  private readonly onMouseDownCapture = (e: MouseEvent) => {
    selectionAtMouseDown = this.view.state.selection;
    const target = e.target as HTMLElement | null;
    const cell = target?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (cell) {
      this.cellDown = { x: e.clientX, y: e.clientY, cell };
      this.suppressClick = false;
      const wrap = cell.closest(".cm-zn-table-wrap") as HTMLElement | null;
      // Presses inside the cell being edited are caret placement or word
      // selection, never a cell-range drag.
      if (wrap && e.button === 0 && !cell.classList.contains("cm-zn-cell-editing")) {
        this.cellDrag = { anchor: cellPos(cell), wrap, active: false };
        document.addEventListener("mousemove", this.onDragMove, true);
        document.addEventListener("mouseup", this.onDragUp, true);
      }
      return; // no preventDefault: let the browser start a text selection
    }
    this.cellDown = null;
    this.cellDrag = null;
    this.suppressClick = false;
    this.onImagePress(e);
  };

  /**
   * A cell that gains focus is wired for committing immediately — without
   * moving the caret or touching the selection. Focus arrives on mousedown, so
   * a drag that starts in a cell can still select its text (or cross into
   * other cells) while typing and the blur-commit keep working. The click path
   * stays as the fallback that also shows the edit outline.
   */
  private readonly onCellFocus = (e: FocusEvent) => {
    const cell = (e.target as HTMLElement | null)?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (!cell || cell.classList.contains("cm-zn-cell-editing")) return;
    const wrap = cell.closest(".cm-zn-table-wrap") as HTMLElement | null;
    if (!wrap) return;
    beginCellEdit(this.view, wrap, cell, "keep");
  };

  /** The cell under a viewport point, if it belongs to `wrap`. */
  private cellUnder(x: number, y: number, wrap: HTMLElement): HTMLElement | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    return cell && cell.closest(".cm-zn-table-wrap") === wrap ? cell : null;
  }

  /**
   * Watches a press that began on a cell.
   *
   * Moving within the starting cell stays a native text selection — that is
   * how a cell's text is selected for copying. Crossing into another cell
   * switches the gesture to a cell range: the native selection is dropped and
   * the cells between the two corners are painted instead.
   */
  private readonly onDragMove = (e: MouseEvent) => {
    const drag = this.cellDrag;
    if (!drag || !(e.buttons & 1)) return;
    const cell = this.cellUnder(e.clientX, e.clientY, drag.wrap);
    if (!cell) return;
    const pos = cellPos(cell);
    if (!drag.active) {
      if (pos.row === drag.anchor.row && pos.col === drag.anchor.col) return;
      drag.active = true;
      // The gesture is about cells now, not text.
      window.getSelection()?.removeAllRanges();
    }
    this.cellSel = { wrap: drag.wrap, rect: cellRectOf(drag.anchor, pos) };
    this.paintCellSelection();
  };

  private readonly onDragUp = () => {
    document.removeEventListener("mousemove", this.onDragMove, true);
    document.removeEventListener("mouseup", this.onDragUp, true);
    const drag = this.cellDrag;
    this.cellDrag = null;
    if (!drag?.active) return;
    // The browser's own drag-selection keeps re-adding ranges while the
    // pointer moves over editable cells, so a stale text selection can survive
    // the gesture — and a live selection would win the copy (native text, not
    // the TSV the user expects from a cell range). Clear it once more now that
    // the gesture has ended as a range.
    window.getSelection()?.removeAllRanges();
    this.suppressClick = true;
    const rect = this.cellSel?.rect;
    // A range that collapsed to a single cell is not worth keeping.
    if (rect && rect.r1 === rect.r2 && rect.c1 === rect.c2) this.clearCellSelection();
  };

  private paintCellSelection(): void {
    const sel = this.cellSel;
    if (!sel || !sel.wrap.isConnected) return;
    for (const el of Array.from(sel.wrap.querySelectorAll(".cm-zn-cell-selected"))) {
      el.classList.remove("cm-zn-cell-selected");
    }
    for (let r = sel.rect.r1; r <= sel.rect.r2; r++) {
      for (let c = sel.rect.c1; c <= sel.rect.c2; c++) {
        cellElement(sel.wrap, r, c)?.classList.add("cm-zn-cell-selected");
      }
    }
  }

  private clearCellSelection(): void {
    const sel = this.cellSel;
    this.cellSel = null;
    if (!sel || !sel.wrap.isConnected) return;
    for (const el of Array.from(sel.wrap.querySelectorAll(".cm-zn-cell-selected"))) {
      el.classList.remove("cm-zn-cell-selected");
    }
  }

  /**
   * Copy for a cell-range selection: TSV, so it pastes into a spreadsheet.
   * A live native selection inside a cell always wins — the user selected
   * text, not cells, and the browser copies that itself.
   */
  private readonly onCopy = (e: ClipboardEvent) => {
    const sel = this.cellSel;
    if (!sel || !sel.wrap.isConnected) return;
    if (nativeSelectionAnchor()?.closest(".cm-zn-table-wrap")) return;
    const pos = this.posOf(sel.wrap);
    if (pos === null) return;
    const node = nodeRangeAt(this.view, "Table", pos);
    if (!node) return;
    const tsv = cellsToTsv(node.text.split("\n"), sel.rect);
    if (!tsv) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", tsv);
  };

  private readonly onClickCapture = (e: MouseEvent) => {
    // The table frame's own button, before anything cell-related: it is not in a
    // cell, so the cell-click path below would ignore it.
    const ops = (e.target as HTMLElement)?.closest?.(".cm-zn-table-ops") as HTMLElement | null;
    if (ops) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = ops.closest(".cm-zn-table-wrap") as HTMLElement | null;
      if (!wrap) return;
      // A painted range in this table takes precedence over the hovered cell.
      const sel = this.cellSel && this.cellSel.wrap === wrap && wrap.isConnected ? this.cellSel : null;
      let cell = sel ? cellElement(wrap, sel.rect.r1, sel.rect.c1) : null;
      if (!cell && this.hoverCell?.closest(".cm-zn-table-wrap") === wrap) cell = this.hoverCell;
      if (!cell) cell = wrap.querySelector(".cm-zn-table td, .cm-zn-table th") as HTMLElement | null;
      if (!cell) return;
      this.closeImageBar();
      this.closeTableMenu();
      const r = ops.getBoundingClientRect();
      this.openTableMenu(r.right, r.bottom + 6, wrap, cell, sel ? sel.rect : null);
      return;
    }

    // A drag that just painted a cell range must not also open a cell.
    const wasRange = this.suppressClick;
    this.suppressClick = false;
    if (wasRange) { this.cellDown = null; return; }

    const down = this.cellDown;
    this.cellDown = null;
    if (!down) return;
    const cell = (e.target as HTMLElement)?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (cell !== down.cell) return;
    // Clicking inside the cell already open for editing is caret placement or
    // word selection within it — re-activating would collapse that selection.
    if (cell.classList.contains("cm-zn-cell-editing")) return;
    // A few pixels of tolerance: a click is never perfectly still.
    const moved = Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4;
    if (moved) return; // the user was selecting text, not opening the cell

    const wrap = cell.closest(".cm-zn-table-wrap") as HTMLElement | null;
    if (!wrap) return;
    e.preventDefault();
    e.stopPropagation();
    this.closeImageBar();
    this.closeTableMenu();
    this.clearCellSelection();
    beginCellEdit(this.view, wrap, cell);
  };

  private readonly onImagePress = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".zn-mermaid-zoom-btn")) return; // the button owns its click

    const wrap = target?.closest?.(".cm-zn-image") as HTMLElement | null;
    if (!wrap) { this.closeImageBar(); return; }
    const img = wrap.querySelector("img");
    if (!img) return;
    const pos = this.posOf(wrap);
    if (pos === null) return;
    this.openImageBar(wrap, pos);
  };

  private posOf(el: Element): number | null {
    try { return this.view.posAtDOM(el, 0); } catch { return null; }
  }

  /* ------------------------------------------------------- image align bar */

  private openImageBar(wrap: HTMLElement, pos: number): void {
    this.closeImageBar();
    const node = nodeRangeAt(this.view, "Image", pos);
    if (!node) return;
    const current = imageAlignOf(node.text);

    const bar = document.createElement("div");
    bar.className = "zn-lp-image-bar";
    const labels: Array<[ImageAlign, string]> = [
      ["left", t().table.alignLeft],
      ["center", t().table.alignCenter],
      ["right", t().table.alignRight],
    ];
    for (const [align, title] of labels) {
      const b = document.createElement("button");
      b.type = "button";
      b.title = title;
      b.dataset.align = align;
      if (align === current) b.classList.add("is-active");
      b.innerHTML = alignIcon(align);
      asCommandButton(b, title, () => {
        this.applyImageAlign(node.from, node.text, align);
        this.closeImageBar();
      });
      bar.appendChild(b);
    }
    const sep = document.createElement("div");
    sep.className = "zn-lp-bar-sep";
    bar.appendChild(sep);
    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.innerHTML = ZOOM_ICON;
    asCommandButton(zoom, t().editor.zoomOpen, () => {
      const img = wrap.querySelector("img");
      if (img) openZoomOverlay(img);
      this.closeImageBar();
    });
    bar.appendChild(zoom);

    document.body.appendChild(bar);
    const r = wrap.getBoundingClientRect();
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    const above = r.top - h - 6;
    bar.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
    bar.style.top = `${above < 8 ? r.bottom + 6 : above}px`;
    this.imageBar = bar;
  }

  private applyImageAlign(from: number, text: string, align: ImageAlign): void {
    // Keep the author's alt text and store the alignment in the image title, so
    // an alignment click never costs the reader their description.
    const next = withImageAlignSource(text, align);
    if (!next) return;
    this.view.dispatch({
      changes: { from, to: from + text.length, insert: next },
    });
  }

  private closeImageBar(): void {
    this.imageBar?.remove();
    this.imageBar = null;
  }

  /* -------------------------------------------------------- table context menu */

  private openTableMenu(
    x: number,
    y: number,
    wrap: HTMLElement,
    cell: HTMLElement,
    range: CellRect | null = null,
  ): void {
    this.closeTableMenu();
    const row = Number(cell.dataset.row ?? "-1");
    const col = Number(cell.dataset.col ?? "0");
    const pos = this.posOf(wrap);
    if (pos === null) return;
    const node = nodeRangeAt(this.view, "Table", pos);
    if (!node) return;
    const lines = node.text.split("\n");
    const width = cellsOf(lines[1]).length;
    const aligns = cellsOf(lines[1]).map(parseAlign);

    // The columns an operation acts on: the hovered one, or every column a
    // painted range covers (the same batch behaviour Typora's toolbar has).
    const cols = range
      ? Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => range.c1 + i)
      : [col];
    const sharedAlign = cols.every(c => aligns[c] === aligns[cols[0]]) ? aligns[cols[0]] : undefined;

    const applyAlign = (align: "left" | "center" | "right") => {
      let out = lines;
      for (const c of cols) out = setColumnAlign(out, c, align);
      this.applyTable(node, out);
    };
    const alignItem = (align: "left" | "center" | "right", label: string) => ({
      label,
      run: () => applyAlign(align),
      active: sharedAlign === align,
    });

    type Item = {
      label: string;
      run: () => void;
      danger?: boolean;
      disabled?: boolean;
      active?: boolean;
    };
    // Range semantics: deletes cover every row/column the selection touches,
    // inserts land just past its bottom/right edge. Disabled states mirror
    // Typora's dynamic menu: no header deletion, no deleting the last column.
    const items: Array<Item | "divider"> = range
      ? [
          { label: `${t().table.insertRowBelow} (Ctrl+Enter)`, run: () => this.applyTable(node, insertRow(lines, range.r2)) },
          { label: t().table.deleteRow, run: () => this.applyTable(node, deleteRowRange(lines, Math.max(range.r1, 0), range.r2)), disabled: range.r2 < 0 },
          "divider",
          { label: t().table.insertColRight, run: () => this.applyTable(node, insertColumn(lines, range.c2)) },
          { label: t().table.deleteCol, run: () => this.applyTable(node, deleteColumnRange(lines, range.c1, range.c2)), disabled: width <= 1 },
          "divider",
          alignItem("left", t().table.alignLeft),
          alignItem("center", t().table.alignCenter),
          alignItem("right", t().table.alignRight),
          "divider",
          { label: t().table.deleteTable, run: () => this.deleteTable(node), danger: true },
        ]
      : [
          { label: `${t().table.insertRowBelow} (Ctrl+Enter)`, run: () => this.applyTable(node, insertRow(lines, row)) },
          { label: t().table.deleteRow, run: () => this.applyTable(node, deleteRow(lines, row)), disabled: row < 0 },
          "divider",
          { label: t().table.insertColRight, run: () => this.applyTable(node, insertColumn(lines, col)) },
          { label: t().table.deleteCol, run: () => this.applyTable(node, deleteColumn(lines, col)), disabled: width <= 1 },
          "divider",
          alignItem("left", t().table.alignLeft),
          alignItem("center", t().table.alignCenter),
          alignItem("right", t().table.alignRight),
          "divider",
          { label: t().table.moveRowUp, run: () => this.applyTable(node, moveRow(lines, row, row - 1)), disabled: row <= 0 },
          { label: t().table.moveRowDown, run: () => this.applyTable(node, moveRow(lines, row, row + 1)), disabled: row < 0 || row >= lines.length - 3 },
          { label: t().table.moveColLeft, run: () => this.applyTable(node, moveColumn(lines, col, col - 1)), disabled: col <= 0 },
          { label: t().table.moveColRight, run: () => this.applyTable(node, moveColumn(lines, col, col + 1)), disabled: col >= width - 1 },
          "divider",
          { label: t().table.deleteTable, run: () => this.deleteTable(node), danger: true },
        ];

    const menu = document.createElement("div");
    menu.className = "zn-lp-table-menu";
    for (const item of items) {
      if (item === "divider") {
        const d = document.createElement("div");
        d.className = "zn-lp-menu-divider";
        menu.appendChild(d);
        continue;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.label;
      if (item.danger) b.classList.add("is-danger");
      if (item.active) b.classList.add("is-active");
      if (item.disabled) {
        b.disabled = true;
        menu.appendChild(b);
        continue;
      }
      asCommandButton(b, item.label, () => { item.run(); this.closeTableMenu(); });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
    this.tableMenu = menu;
  }

  private applyTable(node: { from: number; to: number }, lines: string[]): void {
    this.clearCellSelection();
    const near = cursorNearTable(this.view, node);
    if (near) this.view.dispatch({ selection: near });
    this.view.dispatch({
      changes: { from: node.from, to: node.to, insert: lines.join("\n") },
    });
    // The menu's buttons swallow mousedown focus, which can leave focus on a
    // table cell — whose keydown handler stops propagation, so Ctrl+Z would
    // die there instead of reaching the editor's history. Hand focus back.
    this.view.focus();
  }

  private deleteTable(node: { from: number; to: number }): void {
    this.clearCellSelection();
    // Take the trailing newline too, so no blank line is left behind.
    const to = this.view.state.sliceDoc(node.to, node.to + 1) === "\n" ? node.to + 1 : node.to;
    const near = cursorNearTable(this.view, node);
    if (near) this.view.dispatch({ selection: near });
    this.view.dispatch({ changes: { from: node.from, to } });
    this.view.focus();
  }

  private closeTableMenu(): void {
    this.tableMenu?.remove();
    this.tableMenu = null;
  }

  destroy(): void {
    this.view.dom.removeEventListener("mousedown", this.onMouseDownCapture, true);
    this.view.dom.removeEventListener("click", this.onClickCapture, true);
    this.view.dom.removeEventListener("mouseover", this.onMouseOver);
    this.view.dom.removeEventListener("contextmenu", this.onContextMenu);
    this.view.dom.removeEventListener("focusin", this.onCellFocus);
    document.removeEventListener("mousedown", this.onDocPointerDown, true);
    document.removeEventListener("copy", this.onCopy, true);
    document.removeEventListener("mousemove", this.onDragMove, true);
    document.removeEventListener("mouseup", this.onDragUp, true);
    this.clearCellSelection();
    this.closeImageBar();
    this.closeTableMenu();
  }
}

function alignIcon(dir: ImageAlign): string {
  const x = dir === "left" ? 2 : dir === "center" ? 5 : 8;
  return (
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    `stroke-width="1.6" stroke-linecap="round"><line x1="2" y1="3.5" x2="14" y2="3.5"/>` +
    `<line x1="${x}" y1="8" x2="${x + 6}" y2="8"/>` +
    '<line x1="2" y1="12.5" x2="14" y2="12.5"/></svg>'
  );
}

/* ---------------------------------------------------- rendered-block manager */

export const renderedBlockActions = ViewPlugin.fromClass(
  class {
    private readonly manager: RenderedBlockManager;

    constructor(view: EditorView) {
      this.manager = new RenderedBlockManager(view);
    }

    // No `update` hook on purpose.
    //
    // An earlier version decorated the rendered blocks here, walking and
    // MUTATING the DOM on every viewport change — i.e. on every scroll step,
    // while CodeMirror was measuring. That is the classic way to make an editor
    // jump while scrolling, and it also missed widgets that scrolled back into
    // view after being destroyed. The zoom affordances are now built inside each
    // widget's own `toDOM`, so they are always present and nothing is mutated
    // after the fact.

    destroy(): void {
      this.manager.destroy();
    }
  },
);
