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
import {
  EditorSelection,
  Prec,
  type ChangeSpec,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { indentLess, indentMore } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { deleteMarkupBackward, insertNewlineContinueMarkup } from "@codemirror/lang-markdown";

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

  // A collapsed caret INSIDE an existing mark of the same kind removes that
  // mark: `**bo|ld**` + Ctrl+B must give `bold`, not `**bo****ld**`. The
  // selection cases below only look at the range boundaries, so they cannot
  // see this one.
  if (from === to) {
    const inner = unwrapMarkAtCaret(view.state, from, delimiter);
    if (inner) {
      view.dispatch({
        changes: inner.changes,
        selection: EditorSelection.cursor(inner.anchor),
        scrollIntoView: true,
      });
      return true;
    }
  }

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
  // Ctrl+E is the canonical inline-code key in this app (see MARK_TOGGLES);
  // Ctrl+Shift+C is kept as an alias because the shortcuts panel advertised it
  // for years. Both end up in the same command, so they cannot drift apart.
  { key: "Mod-e", preventDefault: true, run: (v) => toggleMark(v, "`") },
  { key: "Mod-Shift-c", preventDefault: true, run: (v) => toggleMark(v, "`") },
  { key: "Mod-Shift-x", preventDefault: true, run: (v) => toggleMark(v, "~~") },
  { key: "Mod-Shift-h", preventDefault: true, run: (v) => toggleMark(v, "==") },
  { key: "Mod-k", preventDefault: true, run: (v) => insertLink(v) },
]);

/* ------------------------------------------------ markdown automation (ED-06) */

/**
 * What a text edit needs to apply: the document changes plus where the caret
 * (or selection) has to end up afterwards. Kept as a plain object so every
 * rule below is a pure function over an `EditorState` and can be unit-tested
 * without a DOM.
 */
export interface TextEdit {
  changes: ChangeSpec[];
  anchor: number;
  head: number;
}

/** Opening delimiter -> closing delimiter for the §5.1 pairing table. */
const PAIR_OPEN: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "*": "*",
  "_": "_",
  "~": "~",
  "`": "`",
  "$": "$",
  '"': '"',
  "'": "'",
};
/** Closing delimiters: typing one over its auto-inserted partner skips it. */
const PAIR_CLOSE = new Set(Object.values(PAIR_OPEN));
/** Same Unicode word class the whole-word search uses, for pairing guards. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;
/** Characters whose "type the pair again" form is a valid markdown run of 4. */
const RUN_DELIMITERS = new Set(["*", "_", "~"]);

export type PairAction =
  | { kind: "edit"; edit: TextEdit }
  | { kind: "skip"; anchor: number };

/**
 * Decide what a single typed character should do about pairing.
 *
 * Returns `null` when the character is not a pairing character (or must be
 * inserted literally, e.g. an apostrophe inside "don't"), `{kind:"skip"}` when
 * the caret should move over an auto-inserted closing delimiter, and
 * `{kind:"edit"}` when the pair (or a wrapped selection) should be inserted.
 */
export function pairInput(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): PairAction | null {
  if (text.length !== 1) return null;
  // `opener` is only set when the typed character OPENS a pair; characters
  // that merely close one (`)`, `]`, `}`) have no partner to insert.
  const opener = PAIR_OPEN[text] ? text : undefined;
  const closer = PAIR_OPEN[text] ?? (PAIR_CLOSE.has(text) ? text : undefined);
  if (!closer) return null;
  const doc = state.doc;

  // Typing a pairing character over a selection wraps the selection instead
  // of replacing it (§5.1: 选中文字后输入配对符号 → 包裹).
  if (from !== to) {
    if (!opener) return null;
    return {
      kind: "edit",
      edit: {
        changes: [
          { from, insert: opener },
          { from: to, insert: closer },
        ],
        anchor: from + opener.length,
        head: to + opener.length,
      },
    };
  }

  const before = from > 0 ? doc.sliceString(from - 1, from) : "";
  const after = from < doc.length ? doc.sliceString(from, from + 1) : "";

  // `*` typed inside the auto-inserted `*|*` turns the pair into `**|**`
  // (MARKDOWN-RENDERING §5.1: `**`（连续两个）→ `****`). Only for the
  // emphasis-style runs where four delimiters are a meaningful mark.
  if (opener === text && RUN_DELIMITERS.has(text) && before === text && after === text) {
    return {
      kind: "edit",
      edit: {
        changes: [{ from, insert: text + text }],
        anchor: from + 1,
        head: from + 1,
      },
    };
  }

  // Typing a closing delimiter that is already right of the caret: skip it.
  if (after === closer) return { kind: "skip", anchor: from + 1 };
  // A closing character with no partner to skip over is literal text.
  if (!opener) return null;

  // Do not pair where the character is almost certainly literal prose:
  // apostrophes/quotes inside a word, and underscores in snake_case.
  if ((text === "'" || text === '"' || text === "_") && WORD_CHAR.test(before) && WORD_CHAR.test(after)) {
    return null;
  }

  return {
    kind: "edit",
    edit: {
      changes: [{ from, insert: opener + closer }],
      anchor: from + opener.length,
      head: from + opener.length,
    },
  };
}

/** One `EditorView` input handler covering the whole pairing table. */
const pairInputHandler: Extension = EditorView.inputHandler.of((view, from, to, text) => {
  // Never interfere with an IME composition: the composed text is not "typed
  // characters" and inserting delimiters around it corrupts the candidate.
  if (view.composing) return false;
  const action = pairInput(view.state, from, to, text);
  if (!action) return false;
  if (action.kind === "skip") {
    view.dispatch({ selection: EditorSelection.cursor(action.anchor) });
    return true;
  }
  view.dispatch({
    changes: action.edit.changes,
    selection: EditorSelection.range(action.edit.anchor, action.edit.head),
  });
  return true;
});

/**
 * Close a freshly typed fenced-code opener: ` ```lang` + Enter inserts the
 * closing fence and an empty body line (§5.2), leaving the caret in the body.
 *
 * Only the LAST line of the document is treated as an opener. If anything
 * follows, the block already has content (or a closing fence), and inserting
 * another fence there would split the code the user is writing.
 */
export function fenceAutoClose(state: EditorState, pos: number): TextEdit | null {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  if (line.number !== doc.lines || pos !== line.to) return null;
  const match = /^ {0,3}(`{3,}|~{3,})([^`]*)$/.exec(line.text);
  if (!match) return null;
  const fence = match[1];
  // If an earlier fence is still open, this line is code content, not a fence.
  let open: string | null = null;
  for (let n = 1; n < line.number; n++) {
    const other = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(doc.line(n).text);
    if (!other) continue;
    if (!open) {
      if (!(other[1][0] === "`" && other[2].includes("`"))) open = other[1];
    } else if (other[1][0] === open[0] && other[1].length >= open.length && other[2].trim() === "") {
      open = null;
    }
  }
  if (open) return null;
  const closing = fence[0].repeat(fence.length);
  return {
    changes: [{ from: pos, insert: "\n\n" + closing }],
    anchor: pos + 1,
    head: pos + 1,
  };
}

/** Apply a `TextEdit` returned by one of the pure helpers. */
function applyTextEdit(view: EditorView, edit: TextEdit): boolean {
  view.dispatch({
    changes: edit.changes,
    selection: EditorSelection.range(edit.anchor, edit.head),
    scrollIntoView: true,
  });
  return true;
}

/**
 * Enter: close a fence, or continue the current list/blockquote.
 *
 * Falling through (returning false) lets the default keymap insert a plain
 * newline, which is what non-Markdown contexts and plain paragraphs need.
 */
export const continueMarkup = (view: EditorView): boolean => {
  const fence = fenceAutoClose(view.state, view.state.selection.main.head);
  if (fence) return applyTextEdit(view, fence);
  return insertNewlineContinueMarkup(view);
};

/** Backspace: remove list/quote markup from an empty line (§5.3 exit). */
export const removeMarkupBackward = (view: EditorView): boolean =>
  deleteMarkupBackward(view);

/** Is `pos` inside a Markdown list item? */
export function lineInList(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1);
  while (node) {
    if (node.name === "ListItem" || node.name === "BulletList" || node.name === "OrderedList") {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/** Tab inside a list nests the item; anywhere else the default Tab runs. */
export const listTab = (view: EditorView): boolean =>
  lineInList(view.state, view.state.selection.main.head) ? indentMore(view) : false;

/** Shift+Tab inside a list un-nests the item; anywhere else the default runs. */
export const listShiftTab = (view: EditorView): boolean =>
  lineInList(view.state, view.state.selection.main.head) ? indentLess(view) : false;

/* -------------------------------------------------- heading shortcuts (ED-19) */

const HEADING_PREFIX = /^(\s*)(#{1,6}[ \t]+)?/;

/** The heading level of a line, or 0 when it is a plain paragraph. */
export function headingLevelOf(lineText: string): number {
  const match = /^\s*(#{1,6})[ \t]+/.exec(lineText);
  return match ? match[1].length : 0;
}

/** Rewrite one line at `level` (0 = paragraph), keeping its indentation. */
export function setHeadingOnLine(lineText: string, level: number): string {
  const match = HEADING_PREFIX.exec(lineText);
  const indent = match?.[1] ?? "";
  const body = lineText.slice(indent.length);
  const withoutHeading = body.replace(/^#{1,6}[ \t]+/, "");
  if (level <= 0) return indent + withoutHeading;
  return indent + "#".repeat(level) + " " + withoutHeading;
}

/**
 * The changes for applying `level` to every line the selection touches.
 * `toggle` turns an already-matching single line back into a paragraph, which
 * is the behaviour users expect from a formatting shortcut.
 */
export function headingChanges(state: EditorState, level: number, toggle: boolean): ChangeSpec[] {
  const sel = state.selection.main;
  const first = state.doc.lineAt(sel.from).number;
  const last = state.doc.lineAt(sel.to).number;
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const current = headingLevelOf(line.text);
    const nextLevel = toggle && first === last && current === level && level > 0 ? 0 : level;
    const text = setHeadingOnLine(line.text, nextLevel);
    if (text !== line.text) changes.push({ from: line.from, to: line.to, insert: text });
  }
  return changes;
}

/** Ctrl+1…6 / Ctrl+0: set (or toggle off) the heading level of the line(s). */
export function setHeading(view: EditorView, level: number): boolean {
  const changes = headingChanges(view.state, level, true);
  if (changes.length) view.dispatch({ changes, scrollIntoView: true });
  return true;
}

/* ------------------------------------------------ cursor-aware mark removal */

/** node/mark names for each delimiter MARK_TOGGLES can remove. */
const MARK_UNWRAP: Record<string, { node: string; mark: string }> = {
  "**": { node: "StrongEmphasis", mark: "EmphasisMark" },
  "*": { node: "Emphasis", mark: "EmphasisMark" },
  "~~": { node: "Strikethrough", mark: "StrikethroughMark" },
  "`": { node: "InlineCode", mark: "CodeMark" },
  "==": { node: "Highlight", mark: "HighlightMark" },
};

/**
 * Remove both delimiters of the mark of `delimiter` kind that encloses `pos`.
 *
 * The syntax tree decides which mark the caret is in, so nested forms behave:
 * `***bi***` + Ctrl+B removes only the `**` pair and leaves `*bi*`.
 * Returns null when the caret is not inside such a mark (normal toggle path).
 */
export function unwrapMarkAtCaret(
  state: EditorState,
  pos: number,
  delimiter: string,
): TextEdit | null {
  const spec = MARK_UNWRAP[delimiter];
  if (!spec) return null;
  const tree = syntaxTree(state);
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1);
  while (node) {
    // `from < pos < to` keeps a caret resting just OUTSIDE the mark (before
    // its opener or after its closer) on the normal wrap path.
    if (node.name === spec.node && node.from < pos && pos < node.to) {
      const marks = node.getChildren(spec.mark);
      if (marks.length >= 2) {
        const changes: ChangeSpec[] = marks.map(m => ({ from: m.from, to: m.to }));
        let removed = 0;
        for (const m of marks) if (m.to <= pos) removed += m.to - m.from;
        return { changes, anchor: pos - removed, head: pos - removed };
      }
    }
    node = node.parent;
  }
  return null;
}

/* -------------------------------------------------------------- the extension */

/**
 * ONE extension that turns on the Markdown editing behaviours of
 * MARKDOWN-RENDERING §5 and PRD §3.8 (plus the ED-09/ED-19 fixes).
 *
 * Wiring: add `markdownAutomation` to the Live Preview extension array AFTER
 * `slashKeymap`/`slashMenu`. Both use `Prec.high`; for equal precedence the
 * earlier extension wins, so the slash menu keeps owning Enter/Tab/Escape
 * while it is open, and this keymap still beats `defaultKeymap`/`indentWithTab`.
 *
 * A single array is deliberate: the Lead wires one import, and every rule
 * below lives in one file next to `MARK_TOGGLES` so the delimiters cannot drift.
 */
export const markdownAutomation: Extension = [
  Prec.high(
    keymap.of([
      { key: "Enter", run: continueMarkup },
      { key: "Backspace", run: removeMarkupBackward },
      { key: "Tab", run: listTab },
      { key: "Shift-Tab", run: listShiftTab },
      { key: "Mod-1", preventDefault: true, run: v => setHeading(v, 1) },
      { key: "Mod-2", preventDefault: true, run: v => setHeading(v, 2) },
      { key: "Mod-3", preventDefault: true, run: v => setHeading(v, 3) },
      { key: "Mod-4", preventDefault: true, run: v => setHeading(v, 4) },
      { key: "Mod-5", preventDefault: true, run: v => setHeading(v, 5) },
      { key: "Mod-6", preventDefault: true, run: v => setHeading(v, 6) },
      { key: "Mod-0", preventDefault: true, run: v => setHeading(v, 0) },
    ]),
  ),
  pairInputHandler,
];
