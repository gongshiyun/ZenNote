/**
 * Live Preview interactions — Phase 4.
 *
 * Three things live here:
 *   1. Mark toggling (Ctrl+B / I / E / K / X / H) that wraps or unwraps the
 *      selection in real markdown delimiters. Because the document IS markdown,
 *      toggling is a plain text edit — there is no mark/schema dance.
 *   2. A bubble toolbar that appears over a non-empty selection. Hidden while
 *      the user drags a selection across lines, shown once they settle.
 *   3. A slash menu (`/` at the start of a line) offering block constructs.
 */
import {
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from "@codemirror/view";
import { EditorSelection, type ChangeSpec } from "@codemirror/state";

/* ------------------------------------------------------------- mark toggling */

export interface MarkToggleSpec {
  /** The delimiter pair, e.g. ["**", "**"]. */
  readonly delimiter: string;
  /** What the toolbar button says. */
  readonly label: string;
  readonly title: string;
}

export const MARK_TOGGLES: MarkToggleSpec[] = [
  { delimiter: "**", label: "B", title: "Bold  Ctrl+B" },
  { delimiter: "*", label: "I", title: "Italic  Ctrl+I" },
  { delimiter: "~~", label: "S", title: "Strikethrough  Ctrl+Shift+X" },
  { delimiter: "`", label: "‹›", title: "Inline code  Ctrl+E" },
  { delimiter: "==", label: "H", title: "Highlight  Ctrl+Shift+H" },
];

/**
 * Wrap or unwrap the selection with `delimiter`.
 *
 * Three cases, in order: the selection is already wrapped from the outside,
 * the delimiters are inside the selection, or nothing is wrapped yet. Handling
 * the middle case is what makes the toolbar button feel like a toggle instead
 * of "add another pair of asterisks".
 */
export function toggleMark(view: EditorView, delimiter: string): boolean {
  const d = delimiter.length;
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const selected = doc.sliceString(from, to);

  const before = doc.sliceString(Math.max(0, from - d), from);
  const after = doc.sliceString(to, Math.min(doc.length, to + d));
  const wrappedOutside = before === delimiter && after === delimiter;

  if (wrappedOutside) {
    view.dispatch({
      changes: [
        { from: from - d, to: from },
        { from: to, to: to + d },
      ],
      selection: EditorSelection.range(from - d, to - d),
      scrollIntoView: true,
    });
    return true;
  }

  // Delimiters sitting INSIDE the selection: `**bold**` selected whole.
  if (selected.length >= 2 * d && selected.startsWith(delimiter) && selected.endsWith(delimiter)) {
    view.dispatch({
      changes: [
        { from, to: from + d },
        { from: to - d, to },
      ],
      selection: EditorSelection.range(from, to - 2 * d),
      scrollIntoView: true,
    });
    return true;
  }

  // Nothing wrapped: add the pair. An empty selection puts the caret between,
  // which is what makes Ctrl+B then typing the natural gesture.
  const changes: ChangeSpec[] = [
    { from, insert: delimiter },
    { from: to, insert: delimiter },
  ];
  view.dispatch({
    changes,
    selection: EditorSelection.range(from + d, to + d),
    scrollIntoView: true,
  });
  return true;
}

/** Wrap the selection as a link, leaving `url` selected for immediate typing. */
export function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const label = doc.sliceString(from, to) || "text";

  // Already a link around the selection? Then select just its URL.
  const lineText = doc.sliceString(doc.lineAt(from).from, doc.lineAt(from).to);
  const rel = from - doc.lineAt(from).from;
  const m = /\[([^\]]*)\]\(([^)]*)\)/g;
  let hit: RegExpExecArray | null;
  while ((hit = m.exec(lineText)) !== null) {
    const start = doc.lineAt(from).from + hit.index;
    const end = start + hit[0].length;
    if (from >= start && to <= end) {
      const urlStart = start + 1 + hit[1].length + 2;
      view.dispatch({
        selection: EditorSelection.range(urlStart, urlStart + hit[2].length),
        scrollIntoView: true,
      });
      return true;
    }
  }
  void rel;

  const insert = `[${label}](url)`;
  view.dispatch({
    changes: { from, to, insert },
    // Select the placeholder URL so the next keystroke replaces it.
    selection: EditorSelection.range(from + 1 + label.length + 2, from + insert.length - 1),
    scrollIntoView: true,
  });
  return true;
}

/* ------------------------------------------------------------- bubble toolbar */

/**
 * Is this editor the thing the user is working in?
 *
 * Deliberately NOT `view.hasFocus`: CodeMirror defines that as
 * `document.hasFocus() && root.activeElement === contentDOM`, and
 * `document.hasFocus()` reports false whenever the window is not OS-focused —
 * which is exactly the state a desktop webview can sit in. Gating on it made
 * the bubble toolbar and the slash menu silently never appear.
 *
 * This check only asks whether the editor subtree owns the active element,
 * which is true the moment the user clicks or types into it.
 */
export function editorIsActive(view: EditorView): boolean {
  const doc = view.dom.ownerDocument;
  const active = doc.activeElement;
  if (!active) return false;
  if (!view.dom.contains(active)) return false;
  // A bubble/menu must not linger while one of our own overlays has focus.
  return !(active as HTMLElement).classList?.contains("cm-zn-bubble-btn");
}

/**
 * Floating toolbar over the selection.
 *
 * Rendered into `document.body` with fixed positioning because the editor's
 * scroller is its own stacking context; positioning it inside the scroller made
 * it scroll away from the text it belongs to.
 */
class BubbleToolbar {
  readonly dom: HTMLElement;
  private view: EditorView | null = null;
  private dragging = false;
  /**
   * Deferred-positioning timer. A timer rather than requestAnimationFrame:
   * rAF is paused for background tabs, and a desktop window is frequently
   * occluded or minimised, which would leave the toolbar stuck at a stale
   * position (or never placed at all).
   */
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const el = document.createElement("div");
    el.className = "cm-zn-bubble";
    el.setAttribute("role", "toolbar");
    el.addEventListener("mousedown", (e) => {
      // Keep the selection: a plain mousedown would collapse it before click.
      e.preventDefault();
      e.stopPropagation();
    });
    for (const spec of MARK_TOGGLES) {
      el.appendChild(this.button(spec.label, spec.title, (v) => toggleMark(v, spec.delimiter)));
    }
    const sep = document.createElement("div");
    sep.className = "cm-zn-bubble-sep";
    el.appendChild(sep);
    el.appendChild(this.button("🔗", "Link  Ctrl+K", (v) => insertLink(v)));
    el.style.display = "none";
    this.dom = el;
    document.body.appendChild(el);
  }

  private button(label: string, title: string, run: (view: EditorView) => void): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cm-zn-bubble-btn";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.view) run(this.view);
    });
    return b;
  }

  /** Called on every view update; decides whether and where to show. */
  sync(view: EditorView): void {
    this.view = view;
    const sel = view.state.selection.main;
    const show = !sel.empty && !this.dragging && editorIsActive(view);

    if (!show) {
      clearTimeout(this.timer);
      this.dom.style.display = "none";
      return;
    }

    // Defer the layout read. `coordsAtPos` is illegal inside a plugin update
    // ("Reading the editor layout isn't allowed during an update"), which
    // crashed this plugin on its first update and meant the toolbar never
    // appeared at all.
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.place(sel.from, sel.to));
  }

  /** Positioning pass. Runs outside the update cycle. */
  private place(from: number, to: number): void {
    const view = this.view;
    if (!view) return;
    const sel = view.state.selection.main;
    // The selection may have moved on while we waited for the frame.
    if (sel.from !== from || sel.to !== to) { this.sync(view); return; }
    if (this.dragging || sel.empty || !editorIsActive(view)) return;

    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    if (!start || !end) {
      this.dom.style.display = "none";
      return;
    }
    // Show before measuring: offsetWidth/Height are 0 while display is none.
    this.dom.style.display = "flex";
    const w = this.dom.offsetWidth;
    const h = this.dom.offsetHeight;
    const midX = (start.left + end.right) / 2;
    const left = Math.max(8, Math.min(midX - w / 2, window.innerWidth - w - 8));
    // Place above the selection, unless that would leave the window.
    const above = start.top - h - 8;
    const top = above < 8 ? end.bottom + 8 : above;
    this.dom.style.left = `${left}px`;
    this.dom.style.top = `${top}px`;
  }

  /** Hide during an active drag: the toolbar would chase the pointer. */
  setDragging(dragging: boolean): void {
    this.dragging = dragging;
    if (dragging) {
      clearTimeout(this.timer);
      this.dom.style.display = "none";
    }
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.dom.remove();
  }
}

export const bubbleToolbar = ViewPlugin.fromClass(
  class {
    toolbar = new BubbleToolbar();
    private readonly host: EditorView;
    // Real pointer events, not `select.pointer` user events: CodeMirror tags the
    // FINAL selection transaction of a drag with `select.pointer` too, so keying
    // off that tag left `dragging` permanently true and the toolbar never
    // appeared after a mouse selection.
    private readonly onPointerDown = () => { this.toolbar.setDragging(true); };
    private readonly onPointerUp = () => {
      this.toolbar.setDragging(false);
      this.toolbar.sync(this.host);
    };
    // Clicking any non-editor chrome (titlebar, sidebar) must dismiss it.
    private readonly onDocFocusIn = (e: FocusEvent) => {
      if (!this.host.dom.contains(e.target as Node)) this.toolbar.sync(this.host);
    };

    constructor(view: EditorView) {
      this.host = view;
      this.toolbar.sync(view);
      view.dom.addEventListener("pointerdown", this.onPointerDown);
      // On document: the release can land outside the editor.
      document.addEventListener("pointerup", this.onPointerUp);
      document.addEventListener("focusin", this.onDocFocusIn);
    }

    update(update: ViewUpdate): void {
      // A keyboard selection (Shift+arrows, Ctrl+A) must clear the drag flag;
      // nothing will fire pointerup for it.
      if (update.selectionSet && !update.docChanged) {
        const fromPointer = update.transactions.some(
          tr => tr.isUserEvent("select.pointer") || tr.isUserEvent("select.extend"),
        );
        if (!fromPointer) this.toolbar.setDragging(false);
      }
      this.toolbar.sync(update.view);
    }

    destroy(): void {
      this.host.dom.removeEventListener("pointerdown", this.onPointerDown);
      document.removeEventListener("pointerup", this.onPointerUp);
      document.removeEventListener("focusin", this.onDocFocusIn);
      this.toolbar.destroy();
    }
  },
);

/* ---------------------------------------------------------------- slash menu */
// Moved to ./slashMenu.ts — a self-contained panel rather than
// @codemirror/autocomplete. See the header comment there for why.

/* ------------------------------------------------------------ bold/italic etc */

export const markKeymap = keymap.of([
  { key: "Mod-b", preventDefault: true, run: (v) => toggleMark(v, "**") },
  { key: "Mod-i", preventDefault: true, run: (v) => toggleMark(v, "*") },
  { key: "Mod-e", preventDefault: true, run: (v) => toggleMark(v, "`") },
  { key: "Mod-Shift-x", preventDefault: true, run: (v) => toggleMark(v, "~~") },
  { key: "Mod-Shift-h", preventDefault: true, run: (v) => toggleMark(v, "==") },
  { key: "Mod-k", preventDefault: true, run: (v) => insertLink(v) },
]);
