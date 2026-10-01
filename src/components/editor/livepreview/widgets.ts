/**
 * Widgets for the Live Preview editor.
 *
 * A widget stands in for a run of markdown that is rendered rather than edited
 * while the caret is elsewhere: a list bullet, a task checkbox, an image, a
 * table, a Mermaid diagram, a KaTeX formula. All of them return `false` from
 * `ignoreEvent` so a click still reaches the editor and moves the caret into
 * the underlying markdown.
 */
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { t } from "../../../i18n";
import { scanFootnotes, type FootnoteScan } from "./footnotes";
import { frontmatterRange } from "./livePreview";

/** A run of table-cell content with the inline markdown already resolved. */
export interface CellSegment {
  text: string;
  mark: string | null;
  /** Present only for `mark === "link"`. */
  href: string | null;
}

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
        const a = alignOf(i);
        if (a) td.style.textAlign = a;
        appendInline(td, cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
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

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-zn-code-tools";
    wrap.setAttribute("contenteditable", "false");

    // A native <select> deliberately: it is keyboard accessible, closes on
    // blur, and needs no positioning code inside a scrolled container.
    const picker = document.createElement("select");
    picker.className = "zn-lp-code-lang";
    picker.title = t().editor.codeLanguage;
    const known = t().editor.codeLanguages.split(",");
    const languages = this.lang && !known.includes(this.lang) ? [this.lang, ...known] : known;
    for (const name of languages) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name || t().editor.codeLanguagePlain;
      if (name === this.lang) option.selected = true;
      picker.appendChild(option);
    }
    picker.addEventListener("mousedown", e => e.stopPropagation());
    picker.addEventListener("click", e => e.stopPropagation());
    picker.addEventListener("change", e => {
      e.stopPropagation();
      const view = EditorView.findFromDOM(wrap);
      if (!view || this.infoFrom < 0) return;
      view.dispatch({
        changes: { from: this.infoFrom, to: this.infoTo, insert: picker.value },
      });
      view.focus();
    });
    wrap.appendChild(picker);

    const btn = document.createElement("button");
    btn.className = "cm-zn-code-copy";
    btn.type = "button";
    btn.textContent = t().editor.copyCode;
    // mousedown would drop the caret into the widget instead of pressing it.
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      void navigator.clipboard
        .writeText(this.source)
        .then(() => {
          btn.textContent = t().editor.copied;
          setTimeout(() => { btn.textContent = t().editor.copyCode; }, 1200);
        })
        .catch(err => { console.warn("live-preview-copy-failed", err); });
    });
    wrap.appendChild(btn);
    return wrap;
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

/** Renders a YAML frontmatter block as a labelled, bordered panel. */export class FrontmatterWidget extends WidgetType {
  private readonly yaml: string;

  constructor(yaml: string) {
    super();
    this.yaml = yaml;
  }

  eq(other: FrontmatterWidget): boolean {
    return other.yaml === this.yaml;
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

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-zn-mermaid";
    wrap.innerHTML = this.svg;
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
