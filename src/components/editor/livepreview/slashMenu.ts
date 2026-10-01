/**
 * Slash menu — a self-contained panel, not `@codemirror/autocomplete`.
 *
 * Why it is hand-rolled:
 *   - autocomplete's activation path is opaque and only reachable through view
 *     scheduling, so it could not be verified in jsdom OR in the in-app browser
 *     panel (a trivial control source behaved the same way). Replacing it with
 *     ~120 lines of explicit logic makes the whole feature testable.
 *   - `@codemirror/autocomplete` was only a TRANSITIVE dependency (pulled in via
 *     @codemirror/lang-html). Depending on it directly is a latent build break.
 *   - The menu needs its own presentation (localised labels + the syntax it
 *     inserts), which meant fighting autocomplete's panel markup anyway.
 *
 * The pure decision function is `matchSlash`, which is unit-tested; the plugin
 * below only renders and routes keys.
 */
import {
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from "@codemirror/view";
import { EditorSelection, Prec, type EditorState } from "@codemirror/state";
import { editorIsActive } from "./livePreviewInteractions";

export interface SlashItem {
  label: string;
  detail: string;
  insert: string;
  /** Where the caret lands relative to the end of the inserted text. */
  caretOffset?: number;
  /** Extra words the query may match, beyond the label. */
  keywords?: string;
}

export const SLASH_ITEMS: SlashItem[] = [
  { label: "标题 1", detail: "#", insert: "# ", keywords: "h1 heading title" },
  { label: "标题 2", detail: "##", insert: "## ", keywords: "h2 heading title" },
  { label: "标题 3", detail: "###", insert: "### ", keywords: "h3 heading title" },
  { label: "无序列表", detail: "-", insert: "- ", keywords: "ul bullet list" },
  { label: "有序列表", detail: "1.", insert: "1. ", keywords: "ol number list" },
  { label: "任务", detail: "[ ]", insert: "- [ ] ", keywords: "task todo checkbox" },
  { label: "引用", detail: ">", insert: "> ", keywords: "quote blockquote" },
  { label: "代码块", detail: "```", insert: "```\n\n```", caretOffset: -4, keywords: "code fence" },
  { label: "公式块", detail: "$$", insert: "$$\n\n$$", caretOffset: -3, keywords: "math latex katex" },
  { label: "行内公式", detail: "$…$", insert: "$$", caretOffset: -1, keywords: "math latex inline" },
  {
    label: "表格",
    detail: "| |",
    insert: "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |",
    keywords: "table grid",
  },
  { label: "分隔线", detail: "---", insert: "---\n", keywords: "hr rule divider" },
  // Offsets count back from the END of `insert`; `-4` and `-5` land the caret on
  // the `url` placeholder so typing replaces it.
  { label: "图片", detail: "![]()", insert: "![alt](url)", caretOffset: -4, keywords: "image img" },
  { label: "链接", detail: "[]()", insert: "[text](url)", caretOffset: -4, keywords: "link url" },
  {
    label: "Mermaid",
    detail: "```mermaid",
    insert: "```mermaid\ngraph LR\n  A --> B\n```",
    keywords: "diagram chart flowchart",
  },
];

export interface SlashMatch {
  /** Start of the `/query` run that accepting would replace. */
  from: number;
  to: number;
  query: string;
}

/**
 * Detect a slash trigger at the caret.
 *
 * Only at the start of a line, optionally indented — `/` mid-sentence is far
 * more likely to be a date or a path than a command, and eating it would be a
 * data-loss-shaped annoyance. `from` points at the `/` itself so the indent
 * survives acceptance.
 */
export function matchSlash(state: EditorState, pos: number): SlashMatch | null {
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const m = /^(\s*)\/([^\s/]*)$/.exec(before);
  if (!m) return null;
  const query = m[2];
  return { from: pos - query.length - 1, to: pos, query };
}

/** Filter by label, syntax and English keywords; empty query shows everything. */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(item => {
    const hay = `${item.label} ${item.detail} ${item.keywords ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Replace the `/query` run with the item's syntax. */
export function applySlashItem(view: EditorView, match: SlashMatch, item: SlashItem): void {
  const indent = /^(\s*)/.exec(view.state.doc.lineAt(match.from).text)?.[1] ?? "";
  // Continuation lines inherit the indent; the first line does not, since the
  // existing indent text sits before `from` and survives.
  const body = item.insert.split("\n").join("\n" + indent);
  const caret = match.from + body.length + (item.caretOffset ?? 0);
  view.dispatch({
    changes: { from: match.from, to: match.to, insert: body },
    selection: EditorSelection.cursor(Math.max(match.from, caret)),
    scrollIntoView: true,
  });
}

/* ------------------------------------------------------------------ the panel */

/** Live menu state, shared between the ViewPlugin and the keymap. */
interface OpenMenu {
  view: EditorView;
  match: SlashMatch;
  items: SlashItem[];
  selected: number;
}
let openMenu: OpenMenu | null = null;
let menuTimer: ReturnType<typeof setTimeout> | undefined;

function removeMenuDom(): void {
  document.querySelectorAll(".cm-zn-slash").forEach(el => el.remove());
}

function closeMenu(): void {
  openMenu = null;
  clearTimeout(menuTimer);
  removeMenuDom();
}

/**
 * Record the new menu state and schedule the DOM work.
 *
 * The state write is safe anywhere; building and positioning the panel is not,
 * because it reads editor layout and `coordsAtPos` throws inside a view update
 * ("Reading the editor layout isn't allowed during an update"). That throw
 * crashed this plugin on its first update, so the menu never appeared.
 */
function renderMenu(menu: OpenMenu): void {
  openMenu = menu;
  clearTimeout(menuTimer);
  menuTimer = setTimeout(buildMenuDom);
}

function buildMenuDom(): void {
  removeMenuDom();
  const menu = openMenu;
  if (!menu || !menu.items.length) return;
  // The editor may have been torn down while the frame was pending.
  if (!menu.view.dom.isConnected) { openMenu = null; return; }

  const el = document.createElement("div");
  el.className = "cm-zn-slash";
  el.setAttribute("role", "listbox");
  menu.items.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "cm-zn-slash-item" + (i === menu.selected ? " is-selected" : "");
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(i === menu.selected));
    const label = document.createElement("span");
    label.className = "cm-zn-slash-label";
    label.textContent = item.label;
    const detail = document.createElement("span");
    detail.className = "cm-zn-slash-detail";
    detail.textContent = item.detail;
    row.append(label, detail);
    // mousedown, not click: a click would first blur the editor and collapse
    // the very caret position the menu was opened for.
    row.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
      const current = openMenu;
      if (!current) return;
      applySlashItem(current.view, current.match, item);
      closeMenu();
    });
    el.appendChild(row);
  });
  document.body.appendChild(el);

  const coords = menu.view.coordsAtPos(menu.match.from);
  if (coords) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const below = coords.bottom + 6;
    const flipUp = below + h > window.innerHeight - 8;
    el.style.left = `${Math.max(8, Math.min(coords.left, window.innerWidth - w - 8))}px`;
    el.style.top = `${flipUp ? Math.max(8, coords.top - h - 6) : below}px`;
  }

  el.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
}

function moveSelection(delta: number): void {
  if (!openMenu || !openMenu.items.length) return;
  openMenu.selected =
    (openMenu.selected + delta + openMenu.items.length) % openMenu.items.length;
  renderMenu(openMenu);
}

function acceptSelection(): boolean {
  if (!openMenu || !openMenu.items.length) return false;
  const menu = openMenu;
  applySlashItem(menu.view, menu.match, menu.items[menu.selected]);
  closeMenu();
  return true;
}

/**
 * Keys consumed while the menu is open. Registered at high precedence so Enter
 * inserts the block instead of splitting the line, and so the arrow keys do not
 * fight the caret.
 */
export const slashKeymap = Prec.high(
  keymap.of([
    {
      key: "ArrowDown",
      run: () => { if (!openMenu) return false; moveSelection(1); return true; },
    },
    {
      key: "ArrowUp",
      run: () => { if (!openMenu) return false; moveSelection(-1); return true; },
    },
    {
      key: "Enter",
      run: () => acceptSelection(),
    },
    {
      key: "Tab",
      run: () => acceptSelection(),
    },
    {
      key: "Escape",
      run: () => { if (!openMenu) return false; closeMenu(); return true; },
    },
  ]),
);

export const slashMenu = ViewPlugin.fromClass(
  class {
    private readonly host: EditorView;
    private readonly onDocPointerDown = (e: MouseEvent) => {
      // Ignore presses inside the menu itself; its own handler accepts first.
      if ((e.target as HTMLElement)?.closest?.(".cm-zn-slash")) return;
      closeMenu();
    };

    constructor(view: EditorView) {
      this.host = view;
      document.addEventListener("mousedown", this.onDocPointerDown, true);
    }

    update(update: ViewUpdate): void {
      // The menu can only be open while the user is working in this editor.
      // editorIsActive, not view.hasFocus — see the note there.
      if (!editorIsActive(update.view)) { closeMenu(); return; }
      if (!update.docChanged && !update.selectionSet) return;

      const pos = update.state.selection.main.head;
      // Only for a collapsed caret: a selection is not a command trigger.
      if (!update.state.selection.main.empty) { closeMenu(); return; }

      const match = matchSlash(update.state, pos);
      if (!match) { closeMenu(); return; }

      const items = filterSlashItems(match.query);
      if (!items.length) { closeMenu(); return; }

      // Preserve the highlighted row while the query keeps the same item in it.
      const prevLabel = openMenu?.items[openMenu.selected]?.label;
      const keep = prevLabel ? items.findIndex(i => i.label === prevLabel) : -1;

      renderMenu({
        view: update.view,
        match,
        items,
        selected: keep >= 0 ? keep : 0,
      });
    }

    destroy(): void {
      document.removeEventListener("mousedown", this.onDocPointerDown, true);
      if (openMenu?.view === this.host) closeMenu();
      else document.querySelectorAll(".cm-zn-slash").forEach(el => el.remove());
    }
  },
);

/** Test seam: is a menu currently open, and how many rows does it have? */
export function __slashMenuState(): { open: boolean; count: number; selected: number } {
  return {
    open: openMenu !== null,
    count: openMenu?.items.length ?? 0,
    selected: openMenu?.selected ?? -1,
  };
}
