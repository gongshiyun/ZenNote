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
import { syntaxTree } from "@codemirror/language";
import { openZoomOverlay } from "../zoomOverlay";
import { t } from "../../../i18n";
import {
  cellsOf,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseImageAlt,
  rowOf,
  withImageAlign,
  type ImageAlign,
} from "./renderedBlockHelpers";

const ZOOM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>';

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

/**
 * Make one cell editable. `cells`/`lineIndex` describe where it lives in the
 * table's source lines.
 */
function activateCell(
  view: EditorView,
  wrap: HTMLElement,
  td: HTMLElement,
  lines: string[],
  lineIndex: number,
  width: number,
  target: CellTarget,
): void {
  const cells = cellsOf(lines[lineIndex]);
  const original = cells[target.col] ?? "";

  td.contentEditable = "true";
  td.classList.add("cm-zn-cell-editing");
  td.textContent = original;
  td.spellcheck = false;

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

  const finish = (move: "next" | "prev" | "down" | "none", cancel = false) => {
    if (committing) return;
    committing = true;
    const value = cancel ? original : (td.textContent ?? "");
    td.contentEditable = "false";
    td.classList.remove("cm-zn-cell-editing");

    // Work out where focus should go before the widget is rebuilt.
    let nextTarget: CellTarget | null = null;
    if (move === "next") {
      nextTarget = target.col + 1 < width
        ? { row: target.row, col: target.col + 1 }
        : { row: target.row + 1, col: 0 };
    } else if (move === "prev") {
      nextTarget = target.col > 0
        ? { row: target.row, col: target.col - 1 }
        : { row: target.row - 1, col: width - 1 };
    } else if (move === "down") {
      nextTarget = { row: target.row + 1, col: target.col };
    }

    if (!cancel && value !== original) {
      const next = cells.slice();
      // A cell may not contain an unescaped pipe.
      next[target.col] = value.replace(/(?<!\\)\|/g, "\\|");
      const newLines = lines.slice();
      newLines[lineIndex] = rowOf(next, width);
      const range = tableRange(view, wrap);
      if (range) {
        // The table's start offset survives the edit (only cell text changed),
        // so it is a stable handle for re-finding the widget after the rebuild.
        const tableFrom = range.from;
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
    if (e.key === "Enter") {
      e.preventDefault();
      finish("down");
      return;
    }
    // Everything else is ordinary typing inside the cell.
    e.stopPropagation();
  };

  td.addEventListener("keydown", onKeyDown);
  td.addEventListener("blur", () => finish("none"), { once: true });
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
    activateCell(view, wrap, td, lines, lineIndex, width, { row, col });
  }, 0);
}

/** Enter edit mode on a clicked cell. */
function beginCellEdit(view: EditorView, wrap: HTMLElement, td: HTMLElement): void {
  const range = tableRange(view, wrap);
  if (!range) return;
  const lines = view.state.sliceDoc(range.from, range.to).split("\n");
  if (lines.length < 2) return;
  const width = cellsOf(lines[1]).length;
  const row = Number(td.dataset.row ?? "-1");
  const col = Number(td.dataset.col ?? "0");
  const lineIndex = row < 0 ? 0 : row + 2;
  if (lineIndex >= lines.length || col >= width) return;
  activateCell(view, wrap, td, lines, lineIndex, width, { row, col });
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

  private readonly onContextMenu = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement)?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (!cell) { this.closeTableMenu(); return; }
    const wrap = cell.closest(".cm-zn-table-wrap") as HTMLElement | null;
    if (!wrap) return;
    e.preventDefault();
    e.stopPropagation();
    this.closeImageBar();
    this.openTableMenu(e.clientX, e.clientY, wrap, cell);
  };

  private readonly onDocPointerDown = (e: MouseEvent) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt?.closest?.(".zn-lp-image-bar") || tgt?.closest?.(".zn-lp-table-menu")) return;
    this.closeImageBar();
    this.closeTableMenu();
  };

  constructor(view: EditorView) {
    this.view = view;
    view.dom.addEventListener("mousedown", this.onMouseDownCapture, true);
    view.dom.addEventListener("click", this.onClickCapture, true);
    view.dom.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("mousedown", this.onDocPointerDown, true);
  }

  /**
   * mousedown only RECORDS where the press started.
   *
   * The first version called preventDefault here to enter cell editing, which
   * made native text selection inside a cell impossible — dragging to copy did
   * nothing. The decision to edit now waits for the click, and a click that
   * moved is treated as a selection drag instead.
   */
  private readonly onMouseDownCapture = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const cell = target?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (cell) {
      this.cellDown = { x: e.clientX, y: e.clientY, cell };
      return; // no preventDefault: let the browser start a text selection
    }
    this.cellDown = null;
    this.onImagePress(e);
  };

  private readonly onClickCapture = (e: MouseEvent) => {
    const down = this.cellDown;
    this.cellDown = null;
    if (!down) return;
    const cell = (e.target as HTMLElement)?.closest?.(".cm-zn-table th, .cm-zn-table td") as HTMLElement | null;
    if (cell !== down.cell) return;
    // A few pixels of tolerance: a click is never perfectly still.
    const moved = Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4;
    if (moved) return; // the user was selecting text, not opening the cell

    const wrap = cell.closest(".cm-zn-table-wrap") as HTMLElement | null;
    if (!wrap) return;
    e.preventDefault();
    e.stopPropagation();
    this.closeImageBar();
    this.closeTableMenu();
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
    const altMatch = /^!\[([^\]]*)\]/.exec(node.text);
    const current = parseImageAlt(altMatch ? altMatch[1] : "").align;

    const bar = document.createElement("div");
    bar.className = "zn-lp-image-bar";
    const labels: Array<[ImageAlign, string]> = [
      ["left", "左对齐"],
      ["center", "居中"],
      ["right", "右对齐"],
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
    const m = /^!\[([^\]]*)\]/.exec(text);
    if (!m) return;
    const newAlt = withImageAlign(m[1], align);
    // Replace only the alt run, leaving the url and title untouched.
    const altFrom = from + 2;
    this.view.dispatch({
      changes: { from: altFrom, to: altFrom + m[1].length, insert: newAlt },
    });
  }

  private closeImageBar(): void {
    this.imageBar?.remove();
    this.imageBar = null;
  }

  /* -------------------------------------------------------- table context menu */

  private openTableMenu(x: number, y: number, wrap: HTMLElement, cell: HTMLElement): void {
    this.closeTableMenu();
    const row = Number(cell.dataset.row ?? "-1");
    const col = Number(cell.dataset.col ?? "0");
    const pos = this.posOf(wrap);
    if (pos === null) return;
    const node = nodeRangeAt(this.view, "Table", pos);
    if (!node) return;
    const lines = node.text.split("\n");

    const items: Array<{ label: string; run: () => void; danger?: boolean } | "divider"> = [
      { label: "在下方插入行", run: () => this.applyTable(node, insertRow(lines, row)) },
      { label: "删除行", run: () => this.applyTable(node, deleteRow(lines, row)) },
      "divider",
      { label: "在右侧插入列", run: () => this.applyTable(node, insertColumn(lines, col)) },
      { label: "删除列", run: () => this.applyTable(node, deleteColumn(lines, col)) },
      "divider",
      { label: "删除表格", run: () => this.deleteTable(node), danger: true },
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
    this.view.dispatch({
      changes: { from: node.from, to: node.to, insert: lines.join("\n") },
    });
  }

  private deleteTable(node: { from: number; to: number }): void {
    // Take the trailing newline too, so no blank line is left behind.
    const to = this.view.state.sliceDoc(node.to, node.to + 1) === "\n" ? node.to + 1 : node.to;
    this.view.dispatch({ changes: { from: node.from, to } });
  }

  private closeTableMenu(): void {
    this.tableMenu?.remove();
    this.tableMenu = null;
  }

  destroy(): void {
    this.view.dom.removeEventListener("mousedown", this.onMouseDownCapture, true);
    this.view.dom.removeEventListener("click", this.onClickCapture, true);
    this.view.dom.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("mousedown", this.onDocPointerDown, true);
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
