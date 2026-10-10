/**
 * Widgets for the Live Preview editor.
 *
 * A widget stands in for a run of markdown that is rendered rather than edited
 * while the caret is elsewhere: a list bullet, a task checkbox, an image, a
 * table, a Mermaid diagram, a KaTeX formula. They return `false` from
 * `ignoreEvent` so a click still reaches the editor and moves the caret into
 * the underlying markdown — with one exception: the table returns `true`,
 * because every gesture inside it (cell editing, text selection, cell-range
 * dragging, its context menu) is handled by RenderedBlockManager itself.
 * Handing those events to CodeMirror instead would make the editor's own
 * selection machinery claim every drag, which is exactly why selecting text in
 * a cell did not work.
 */
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { t } from "../../../i18n";
import { scanFootnotes, type FootnoteScan } from "./footnotes";
import { frontmatterRange } from './livePreview';
import { openZoomOverlay } from '../zoomOverlay';

const ZOOM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>';

/**
 * The zoom affordance shared by diagrams and images.
 *
 * Built here rather than by walking the DOM after the fact: that walk mutated
 * the DOM on every viewport change (i.e. during scrolling while CodeMirror was
 * measuring) and it also missed widgets that scrolled back into view.
 */
export function zoomButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "zn-mermaid-zoom-btn";
  btn.type = "button";
  btn.title = t().editor.zoomOpen;
  btn.innerHTML = ZOOM_ICON;
  btn.addEventListener("mousedown", e => e.preventDefault());
  btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export interface CellSegment {
  text: string;
  mark: string | null;
  /** Present only for `mark === "link"`. */
  href: string | null;
}

/* ------------------------------------------------------ block heights */

/**
 * Estimated heights, in pixels, for blocks that are currently off screen.
 *
 * CodeMirror renders only the viewport. Every block widget outside it is stood
 * in for by filler of `estimatedHeight` pixels, and the WidgetType default is
 * "no idea". In a note made of tables, diagrams and formulas that means the
 * height of everything above the viewport is estimated at roughly one line per
 * block, and the correction lands in one go when those blocks are finally
 * measured and the height map is rebuilt — which moves the scroll position. The
 * symptom is the view jumping *backwards* while scrolling *down*, at the same
 * place every time, because it depends on which large blocks sit above.
 *
 * The numbers follow the sizes in `livePreviewThemeSpec` (base 16px,
 * `lineHeight` 1.75, so a 28px line): a table cell is `padding: 6px 10px` around
 * a 0.95em line, `.cm-zn-table-wrap` adds `0.5em` top and bottom, and the image,
 * diagram and display-maths containers add `0.6em`.
 *
 * These are estimates, not measurements: a table row whose cells wrap onto more
 * lines, or an unusually large image, will be taller than the figure here. That
 * is tolerable — only off-screen blocks use these, and a real measured height
 * always wins once the block is drawn. What matters is that they are in the
 * right neighbourhood, because being one line out for every block is precisely
 * the bug this exists to prevent.
 */
export const BLOCK_ESTIMATE = {
  /** `0.5em` top and bottom around the table. */
  tableChrome: 16,
  /** 0.95em line (26.6px) + 12px padding + its share of the collapsed border. */
  tableRow: 40,
  /** `0.6em` top and bottom around a centred display formula. */
  mathBlock: 64,
  /** `0.6em` top and bottom around a typical flowchart. */
  mermaid: 250,
  /** The one-line "rendering diagram…" strip. */
  mermaidPending: 44,
  /** `0.6em` top and bottom around an image of unknown intrinsic size. */
  image: 220,
  /** An image with no source renders one line of alt text, not a picture. */
  imageMissing: 30,
  /** Sanitized HTML blocks are arbitrary; assume a short paragraph. */
  html: 64,
  /** Frontmatter panel chrome, plus 0.85em/1.6 lines. */
  frontmatterChrome: 44,
  frontmatterLine: 22,
  /** `[TOC]` heading plus panel padding, then one 0.9em/1.9 row each. */
  tocChrome: 52,
  tocItem: 27,
} as const;

/* ------------------------------------------------------------------- markers */

/** Stands in for a hidden `- ` / `* ` / `+ ` list marker. */
export class BulletWidget extends WidgetType {
  private readonly ordinal: string | null;
  private readonly depth: number;

  constructor(ordinal: string | null, depth: number) {
    super();
    this.ordinal = ordinal;
    this.depth = depth;
  }

  eq(other: BulletWidget): boolean {
    return other.ordinal === this.ordinal && other.depth === this.depth;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-zn-bullet";
    el.textContent = this.ordinal ?? "•";
    el.style.paddingLeft = `${this.depth * 1.4}em`;
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Stands in for a hidden `[ ]` / `[x]` task marker. */
export class TaskWidget extends WidgetType {
  private readonly checked: boolean;
  private readonly id: string;

  constructor(checked: boolean, id = "") {
    super();
    this.checked = checked;
    // Identity for `eq`: two boxes with the same state but different source
    // text must not be treated as equal, or a toggle would not re-render.
    this.id = id + (checked ? "1" : "0");
  }

  eq(other: TaskWidget): boolean {
    return other.id === this.id;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-zn-task";
    const box = document.createElement("span");
    box.className = "cm-zn-task-box" + (this.checked ? " cm-zn-task-on" : "");
    box.textContent = this.checked ? "✓" : "";
    wrap.appendChild(box);

    // Clicking the box toggles the item in place. Without this the click fell
    // through to the text, moved the caret into the line and swapped the whole
    // line to source — which is not what a checkbox should do.
    box.title = t().editor.taskToggle;
    box.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
    });
    box.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const view = EditorView.findFromDOM(wrap);
      if (!view) return;
      let pos: number;
      try { pos = view.posAtDOM(wrap, 0); } catch { return; }
      // The widget replaced the `[ ]` run; rewrite it in place.
      const to = Math.min(pos + "[ ]".length, view.state.doc.length);
      view.dispatch({
        changes: { from: pos, to, insert: this.checked ? "[ ]" : "[x]" },
      });
    });
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Stands in for a hidden `---` thematic break. */
export class RuleWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-zn-rule";
    return hr;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

/* -------------------------------------------------------------------- blocks */

/**
 * Renders a markdown table as a real `<table>`. Cell contents are compiled
 * through the same inline markdown the editor uses, so `**bold**` inside a cell
 * still renders.
 */
export class TableWidget extends WidgetType {
  private readonly header: CellSegment[][];
  private readonly rows: CellSegment[][][];
  private readonly aligns: Array<"left" | "center" | "right" | null>;
  private readonly key: string;

  constructor(
    header: CellSegment[][],
    rows: CellSegment[][][],
    aligns: Array<"left" | "center" | "right" | null>,
    key: string,
  ) {
    super();
    this.header = header;
    this.rows = rows;
    this.aligns = aligns;
    this.key = key;
  }

  eq(other: TableWidget): boolean {
    return other.key === this.key;
  }

  get estimatedHeight(): number {
    return BLOCK_ESTIMATE.tableChrome + (this.rows.length + 1) * BLOCK_ESTIMATE.tableRow;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-zn-table-wrap";
    const table = document.createElement("table");
    table.className = "cm-zn-table";

    const alignOf = (i: number) => this.aligns[i] ?? null;

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    this.header.forEach((cell, i) => {
      const th = document.createElement("th");
      // Identity for the table context menu: the header is row -1.
      th.dataset.row = "-1";
      th.dataset.col = String(i);
      // The cell is editable content from the start: Chrome refuses to start a
      // mouse selection inside a contenteditable=false island, so a read-only
      // cell could not be dragged over or copied. Editing is still a separate
      // step — a click adds the commit wiring on top (see activateCell).
      th.contentEditable = "true";
      th.spellcheck = false;
      const a = alignOf(i);
      if (a) th.style.textAlign = a;
      appendInline(th, cell);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach((cell, i) => {
        const td = document.createElement("td");
        td.dataset.row = String(rowIndex);
        td.dataset.col = String(i);
        // Editable from the start — see the header comment above: this is what
        // makes native text selection (and copying) work inside a cell.
        td.contentEditable = "true";
        td.spellcheck = false;
        const a = alignOf(i);
        if (a) td.style.textAlign = a;
        appendInline(td, cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    // Row and column operations were reachable only by right-clicking a cell,
    // which is the same as not having them. A quiet button on the frame opens the
    // same menu; the manager supplies the cell the pointer was last over so the
    // row and column items act on the right one.
    wrap.appendChild(tableOpsButton());
    return wrap;
  }

  /**
   * The table owns its events. Every pointer gesture here is handled by
   * RenderedBlockManager (cell click-to-edit, native text selection in a cell,
   * drag across cells, the row/column menu), so the editor must keep its hands
   * off. With the default (`false`) CodeMirror starts its own MouseSelection on
   * mousedown, whose selection lives in the document model — native text
   * selection inside the cells then never survives, and copy stops working.
   */
  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Append a cell's inline content. `segments` is a flat list of
 * `{ text, mark }` runs already resolved by the caller, so the widget does no
 * markdown parsing of its own.
 */
function appendInline(el: HTMLElement, segments: CellSegment[]): void {
  for (const seg of segments) {
    if (!seg.mark) {
      el.appendChild(document.createTextNode(seg.text));
      continue;
    }
    // Links become real anchors so they are clickable and copyable as links.
    const node = seg.mark === "link" && seg.href ? document.createElement("a") : document.createElement("span");
    node.className = `cm-zn-inline-${seg.mark}`;
    if (seg.mark === "link" && seg.href) {
      node.setAttribute("href", seg.href);
      node.setAttribute("title", seg.href);
      // Keep the editor's own click handling from swallowing the navigation.
      node.addEventListener("click", e => e.stopPropagation());
    }
    node.textContent = seg.text;
    el.appendChild(node);
  }
}

/** Renders an image reference. The URL is resolved by the caller. */
export class ImageWidget extends WidgetType {
  private readonly src: string;
  private readonly alt: string;

  constructor(src: string, alt: string) {
    super();
    this.src = src;
    this.alt = alt;
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  get estimatedHeight(): number {
    // No source means the widget renders one line of alt text instead of an
    // image, so the image estimate would overstate it.
    if (!this.src) return BLOCK_ESTIMATE.imageMissing;
    // The intrinsic size is unknowable until the file loads, so this is the
    // typical height of a note image rather than a computed one.
    return BLOCK_ESTIMATE.image;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-zn-image";
    if (!this.src) {
      wrap.classList.add("cm-zn-image-empty");
      wrap.textContent = this.alt || t().editor.imageMissing;
      return wrap;
    }
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.loading = "lazy";
    // An image arriving changes the line's height AFTER CodeMirror measured it,
    // which leaves hit-testing stale (clicks land a line off). Also show the alt
    // text when the file is missing, instead of an invisible broken image.
    img.addEventListener("load", () => {
      try { EditorView.findFromDOM(wrap)?.requestMeasure(); } catch { /* torn down */ }
    });
    img.addEventListener("error", () => {
      wrap.classList.add("cm-zn-image-empty");
      wrap.textContent = this.alt || t().editor.imageMissing;
    });
    wrap.appendChild(img);
    // The zoom button is part of the widget, NOT added by a post-hoc DOM walk:
    // a walk that runs on every viewport change mutates the DOM while
    // CodeMirror is measuring, and it also missed widgets that scrolled back
    // into view after being destroyed.
    wrap.appendChild(zoomButton(() => openZoomOverlay(img)));
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Renders a KaTeX formula (inline or display). `html` is pre-rendered. */
export class MathWidget extends WidgetType {
  private readonly html: string;
  private readonly display: boolean;

  constructor(html: string, display: boolean) {
    super();
    this.html = html;
    this.display = display;
  }

  eq(other: MathWidget): boolean {
    return other.html === this.html && other.display === this.display;
  }

  get estimatedHeight(): number {
    // Only a display formula is a block replacement; an inline one sits inside a
    // line whose height the line itself already accounts for, so `-1` keeps
    // CodeMirror's default for it.
    return this.display ? BLOCK_ESTIMATE.mathBlock : -1;
  }

  toDOM(): HTMLElement {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "cm-zn-math-display" : "cm-zn-math-inline";
    el.innerHTML = this.html;
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Language picker + copy button for a fenced code block.
 *
 * Rendered as a widget at the end of the opening fence line, which is where the
 * Crepe editor put its language button. The code body stays inline markdown (so
 * it remains selectable and editable); only the affordances are a widget.
 *
 * The chip is a picker: choosing a language rewrites the fence's info string in
 * place, which is how the previous editor let you change a block's syntax.
 */
/* ------------------------------------------------- code-block chrome */

const CHEVRON_SVG =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg>';

const TICK_SVG =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-5.5"/></svg>';

/** Two offset sheets: the conventional copy mark. */
const COPY_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.6"/>' +
  '<path d="M10.25 5.5V3.9c0-.91-.74-1.65-1.65-1.65H3.9c-.91 0-1.65.74-1.65 1.65v4.7' +
  'c0 .91.74 1.65 1.65 1.65h1.6"/></svg>';

/** A grid with its header and column rules: the table frame itself. */
const TABLE_OPS_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
  'stroke-linecap="round" aria-hidden="true">' +
  '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.8"/>' +
  '<path d="M1.75 6.25h12.5M6.4 6.25v7M10.1 6.25v7"/></svg>';

/** The table's row/column button. Behaviour lives in renderedBlockActions. */
export function tableOpsButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cm-zn-table-ops";
  btn.title = t().table.ops;
  btn.setAttribute("aria-label", t().table.ops);
  btn.innerHTML = TABLE_OPS_SVG;
  // mousedown would move the caret out of the widget before the click lands.
  btn.addEventListener("mousedown", e => e.preventDefault());
  return btn;
}

/** The open language menu, if any. At most one exists at a time. */
let openLangMenu: {
  el: HTMLElement;
  trigger: HTMLElement;
  detach: () => void;
} | null = null;

/**
 * Closes the open language menu, if there is one.
 *
 * Exported so the editor can drop the menu when the view goes away: the menu
 * lives on `document.body` with its own document-level listeners, so without
 * this a view destroyed while a menu was open would leave both behind.
 */
export function closeLangMenu(): void {
  if (!openLangMenu) return;
  openLangMenu.detach();
  openLangMenu.el.remove();
  openLangMenu.trigger.classList.remove("is-open");
  openLangMenu = null;
}

/**
 * Opens the code-language menu under its trigger.
 *
 * This replaces a native `<select>`. A select draws its popup itself — a light
 * grey OS list that ignores the app's theming, which is what made it look wrong
 * over the dark editor — and it printed the language name a second time next to
 * the raw info string. A menu built from the same pieces as the table context
 * menu picks up this app's surfaces, borders and hover states for free.
 */
function openLanguageMenu(
  trigger: HTMLElement,
  choices: string[],
  current: string,
  onPick: (name: string) => void,
): void {
  closeLangMenu();

  const menu = document.createElement("div");
  menu.className = "zn-lp-code-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", t().editor.codeLanguage);

  for (const choice of choices) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "zn-lp-code-menu-item";
    item.setAttribute("role", "option");
    if (choice === current) {
      item.classList.add("is-selected");
      item.setAttribute("aria-selected", "true");
    }

    const tick = document.createElement("span");
    tick.className = "zn-lp-code-menu-tick";
    tick.innerHTML = TICK_SVG;
    item.appendChild(tick);

    const text = document.createElement("span");
    text.textContent = choice || t().editor.codeLanguagePlain;
    item.appendChild(text);

    // mousedown would drop the caret into the block before the click lands.
    item.addEventListener("mousedown", e => e.preventDefault());
    item.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      closeLangMenu();
      onPick(choice);
    });
    menu.appendChild(item);
  }

  document.body.appendChild(menu);

  // Keep it on screen: below the trigger, nudged back inside the window edges.
  const r = trigger.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - h - 8))}px`;

  const onPointerDown = (e: MouseEvent) => {
    if (menu.contains(e.target as Node) || trigger.contains(e.target as Node)) return;
    closeLangMenu();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeLangMenu();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    // A native <select> allowed arrow keys; a menu of buttons does not by
    // default, so it has to be put back or the control is worse to use.
    e.preventDefault();
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>(".zn-lp-code-menu-item"));
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = at < 0 ? 0 : (at + step + items.length) % items.length;
    items[next].focus();
  };
  // Dismiss when the EDITOR moves under the menu, not when the menu itself
  // scrolls. The listener is on the document with capture, so it also sees the
  // language list's own scrolling — and because opening the menu focuses the
  // selected entry, a language far down the list scrolled it and closed the menu
  // the instant it appeared. Clicking then did nothing.
  const onScroll = (e: Event) => {
    if (menu.contains(e.target as Node)) return;
    closeLangMenu();
  };

  document.addEventListener("mousedown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);

  openLangMenu = {
    el: menu,
    trigger,
    detach: () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("scroll", onScroll, true);
    },
  };
  trigger.classList.add("is-open");
  // preventScroll: focusing the selected entry must not scroll the list. A plain
  // focus() scrolled it, which fired a scroll event that closed the menu.
  menu.querySelector<HTMLButtonElement>(".is-selected")?.focus({ preventScroll: true });
}

export class CodeToolsWidget extends WidgetType {
  private readonly lang: string;
  private readonly source: string;
  /** Range of the fence's info string, so a change can rewrite it in place. */
  private readonly infoFrom: number;
  private readonly infoTo: number;

  constructor(lang: string, source: string, infoFrom = -1, infoTo = -1) {
    super();
    this.lang = lang;
    this.source = source;
    this.infoFrom = infoFrom;
    this.infoTo = infoTo;
  }

  eq(other: CodeToolsWidget): boolean {
    return (
      other.lang === this.lang &&
      other.source === this.source &&
      other.infoFrom === this.infoFrom &&
      other.infoTo === this.infoTo
    );
  }

  private languages(): string[] {
    const known = t().editor.codeLanguages.split(",");
    return this.lang && !known.includes(this.lang) ? [this.lang, ...known] : known;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-zn-code-tools";
    wrap.setAttribute("contenteditable", "false");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "zn-lp-code-lang";
    trigger.title = t().editor.codeLanguage;
    trigger.setAttribute("aria-haspopup", "listbox");

    const name = document.createElement("span");
    name.className = "zn-lp-code-lang-name";
    name.textContent = this.lang || t().editor.codeLanguagePlain;
    trigger.appendChild(name);

    const chevron = document.createElement("span");
    chevron.className = "zn-lp-code-chevron";
    chevron.innerHTML = CHEVRON_SVG;
    trigger.appendChild(chevron);

    // mousedown, not click: preventDefault keeps the caret out of the widget, so
    // opening the menu never moves the selection into the code block.
    trigger.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
    });
    trigger.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      if (openLangMenu?.trigger === trigger) {
        closeLangMenu();
        return;
      }
      openLanguageMenu(trigger, this.languages(), this.lang, next => {
        const view = EditorView.findFromDOM(wrap);
        if (!view || this.infoFrom < 0) return;
        view.dispatch({
          changes: { from: this.infoFrom, to: this.infoTo, insert: next },
        });
        view.focus();
      });
    });
    wrap.appendChild(trigger);

    const btn = document.createElement("button");
    btn.className = "cm-zn-code-copy";
    btn.type = "button";
    // An icon carries no words, so the name has to come from the label and the
    // tooltip; without them the button is unreadable to a screen reader.
    btn.title = t().editor.copyCode;
    btn.setAttribute("aria-label", t().editor.copyCode);
    btn.innerHTML = COPY_SVG;
    // mousedown would drop the caret into the widget instead of pressing it.
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      void navigator.clipboard
        .writeText(this.source)
        .then(() => {
          // Swap the mark rather than the words: the button keeps its size, so
          // nothing in the header moves when it confirms.
          btn.innerHTML = TICK_SVG;
          btn.classList.add("is-copied");
          btn.title = t().editor.copied;
          setTimeout(() => {
            btn.innerHTML = COPY_SVG;
            btn.classList.remove("is-copied");
            btn.title = t().editor.copyCode;
          }, 1200);
        })
        .catch(err => { console.warn("live-preview-copy-failed", err); });
    });
    wrap.appendChild(btn);
    return wrap;
  }

  /** The widget is rebuilt whenever the decorations are; drop any open menu. */
  destroy(): void {
    closeLangMenu();
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/* --------------------------------------------------------------- footnotes */

/** Ask for a one-shot highlight on a footnote jump target. */
export const setFootnoteFlash = StateEffect.define<{ from: number; to: number } | null>();

/**
 * Holds the transient highlight for a footnote jump.
 *
 * A StateField rather than a DOM class: the highlight must survive the
 * decoration rebuild that the selection change triggers, or it would be wiped
 * the moment the jump lands.
 */
export const footnoteFlashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (!e.is(setFootnoteFlash)) continue;
      const v = e.value;
      if (!v) return Decoration.none;
      const to = Math.min(v.to, tr.state.doc.length);
      if (v.from >= to) return Decoration.none;
      return Decoration.set([
        Decoration.mark({ class: "cm-zn-footnote-flash" }).range(v.from, to),
      ]);
    }
    return value.map(tr.changes);
  },
  provide: field => EditorView.decorations.from(field),
});

/**
 * Scan this view's document for footnotes, skipping fenced code and
 * frontmatter — a `[^1]` inside a code sample is data, not a footnote.
 */
export function footnoteScanOf(view: EditorView): FootnoteScan {
  const doc = view.state.doc;
  const skip: Array<{ from: number; to: number }> = [];
  const fm = frontmatterRange(doc);
  if (fm) skip.push(fm);
  syntaxTree(view.state).iterate({
    from: 0,
    to: doc.length,
    enter: node => {
      if (node.name === "FencedCode" || node.name === "InlineCode") {
        skip.push({ from: node.from, to: node.to });
      }
    },
  });
  return scanFootnotes(
    { lines: doc.lines, line: n => doc.line(n) },
    skip,
  );
}

/**
 * A footnote reference rendered as a numbered chip.
 *
 * The number comes from `footnoteNumbers` (definition order), so `[^note]` can
 * render as 1. The jump target is looked up at click time from the live
 * document, so a reference whose definition is added later still resolves.
 */
export class FootnoteRefWidget extends WidgetType {
  private readonly number: number;
  private readonly id: string;

  constructor(number: number, id: string) {
    super();
    this.number = number;
    this.id = id;
  }

  eq(other: FootnoteRefWidget): boolean {
    return other.number === this.number && other.id === this.id;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("sup");
    el.className = "cm-zn-footnote-ref";
    el.textContent = String(this.number);
    el.title = `[^${this.id}]`;
    el.addEventListener("mousedown", e => {
      // mousedown, not click: the caret must not land before we move it.
      e.preventDefault();
      e.stopPropagation();
      const view = EditorView.findFromDOM(el);
      if (!view) return;
      const def = footnoteScanOf(view).byId.get(this.id);
      if (!def) return;
      view.dispatch({
        selection: { anchor: def.markFrom },
        effects: [
          EditorView.scrollIntoView(def.markFrom, { y: "center" }),
          setFootnoteFlash.of({ from: def.markFrom, to: def.bodyTo }),
        ],
      });
      view.focus();
      // Clear the highlight after the animation, guarding against a torn-down
      // view (dispatching into a destroyed editor throws).
      setTimeout(() => {
        try {
          view.dispatch({ effects: setFootnoteFlash.of(null) });
        } catch { /* view replaced while the highlight was showing */ }
      }, 1200);
    });
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * `[TOC]` auto table of contents.
 *
 * The heading list comes from the syntax tree, so the widget is rebuilt with the
 * document and can never drift out of date. Clicking an entry moves the caret
 * there — the view is recovered from the widget's own DOM via
 * `EditorView.findFromDOM`, which avoids threading a view reference through the
 * decoration field (a StateField has no view).
 */
export class TocWidget extends WidgetType {
  private readonly entries: Array<{ level: number; text: string; pos: number }>;
  private readonly key: string;

  constructor(entries: Array<{ level: number; text: string; pos: number }>, key: string) {
    super();
    this.entries = entries;
    this.key = key;
  }

  eq(other: TocWidget): boolean {
    return other.key === this.key;
  }

  get estimatedHeight(): number {
    return BLOCK_ESTIMATE.tocChrome + Math.max(1, this.entries.length) * BLOCK_ESTIMATE.tocItem;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-zn-toc";

    const title = document.createElement("div");
    title.className = "cm-zn-toc-title";
    title.textContent = t().editor.tocTitle;
    wrap.appendChild(title);

    if (!this.entries.length) {
      const empty = document.createElement("div");
      empty.className = "cm-zn-toc-empty";
      empty.textContent = t().outline.noHeadings;
      wrap.appendChild(empty);
      return wrap;
    }

    const list = document.createElement("div");
    list.className = "cm-zn-toc-list";
    for (const entry of this.entries) {
      const row = document.createElement("div");
      row.className = `cm-zn-toc-item cm-zn-toc-level-${entry.level}`;
      row.textContent = entry.text || "—";
      row.title = entry.text;
      row.addEventListener("mousedown", e => {
        // mousedown, not click: the jump must happen before the caret moves.
        e.preventDefault();
        e.stopPropagation();
        const view = EditorView.findFromDOM(wrap);
        if (!view) return;
        view.dispatch({
          selection: { anchor: Math.min(entry.pos, view.state.doc.length) },
          effects: EditorView.scrollIntoView(entry.pos, { y: "start" }),
        });
        view.focus();
      });
      list.appendChild(row);
    }
    wrap.appendChild(list);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Raw HTML block, rendered and sanitized.
 *
 * Uses the shared renderer so a `<cite>` holding a markdown list looks exactly
 * as it did in the previous editor — including the inner-markdown pass, which
 * is what turns `- [x](y)` inside block HTML into a real list.
 */
export class HtmlBlockWidget extends WidgetType {
  private readonly html: string;

  constructor(html: string) {
    super();
    this.html = html;
  }

  eq(other: HtmlBlockWidget): boolean {
    return other.html === this.html;
  }

  get estimatedHeight(): number {
    return BLOCK_ESTIMATE.html;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-zn-html-block";
    el.innerHTML = this.html;
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Renders a YAML frontmatter block as a labelled, bordered panel. */
export class FrontmatterWidget extends WidgetType {
  private readonly yaml: string;
  /** Counted up front: `estimatedHeight` must not depend on live layout. */
  private readonly lines: number;

  constructor(yaml: string) {
    super();
    this.yaml = yaml;
    this.lines = yaml ? yaml.split("\n").length : 0;
  }

  eq(other: FrontmatterWidget): boolean {
    return other.yaml === this.yaml;
  }

  get estimatedHeight(): number {
    return BLOCK_ESTIMATE.frontmatterChrome + this.lines * BLOCK_ESTIMATE.frontmatterLine;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-zn-frontmatter";
    const label = document.createElement("div");
    label.className = "cm-zn-frontmatter-label";
    label.textContent = "YAML";
    const pre = document.createElement("pre");
    pre.className = "cm-zn-frontmatter-body";
    pre.textContent = this.yaml;
    wrap.appendChild(label);
    wrap.appendChild(pre);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Renders a Mermaid diagram. `svg` is pre-rendered by mermaidRender. */
export class MermaidWidget extends WidgetType {
  private readonly svg: string;
  private readonly key: string;

  constructor(svg: string, key: string) {
    super();
    this.svg = svg;
    this.key = key;
  }

  eq(other: MermaidWidget): boolean {
    return other.key === this.key;
  }

  get estimatedHeight(): number {
    return BLOCK_ESTIMATE.mermaid;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-zn-mermaid";
    wrap.innerHTML = this.svg;
    wrap.appendChild(zoomButton(() => {
      const svg = wrap.querySelector("svg") as SVGElement | null;
      if (svg) openZoomOverlay(svg);
    }));
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
