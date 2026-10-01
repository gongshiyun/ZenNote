/**
 * Markdown Live Preview for CodeMirror 6.
 *
 * ARCHITECTURE
 * The document IS the markdown string. There is no second model to keep in
 * sync, which is the point: every syntax character is a real character in the
 * buffer and therefore has a real caret position. That is what makes "put the
 * cursor between the two # of a heading" possible, and it is the one thing a
 * ProseMirror document model structurally cannot do (a block node carries a
 * type + attrs; the `###` that produces them is not content).
 *
 * Syntax ranges come from the lezer markdown syntax tree, never from regexes.
 * A regex cannot know that `# not a heading` inside a fenced block is code, and
 * the first cut of this file did not — it hid the `#` of a code comment. The
 * tree gets that right for free.
 *
 * Every syntax range is in one of two states:
 *   REVEALED  the selection touches it -> the raw mark is shown, dimmed
 *   HIDDEN    everything else          -> the mark is replaced (optionally by a
 *                                        widget) and registered as atomic so
 *                                        arrow keys and clicks skip it
 */
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { StateEffect, StateField, type EditorState, type Range, type Text } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { useStore } from "../../../store";
import { resolveImageUrl } from "../../../services";
import {
  BulletWidget,
  type CellSegment,
  CodeToolsWidget,
  footnoteFlashField,
  FootnoteRefWidget,
  footnoteScanOf,
  FrontmatterWidget,
  HtmlBlockWidget,
  ImageWidget,
  MathWidget,
  MermaidWidget,
  RuleWidget,
  TableWidget,
  TaskWidget,
  TocWidget,
} from "./widgets";
import { footnoteNumbers } from "./footnotes";
import { renderHtmlValue } from "../../../lib/htmlRender";

/* ------------------------------------------------------------ async refresh */

/** Dispatched once an async render (Mermaid, KaTeX) lands, to rebuild widgets. */
export const livePreviewRefresh = StateEffect.define<null>();

/* ------------------------------------------------------------------ mermaid */

// Module-level so the cache survives editor recreation. Keyed by colour scheme
// as well as content, because the rendered SVG bakes the theme in.
const mermaidCache = new Map<string, string>();
const mermaidPending = new Set<string>();
const mermaidFailed = new Set<string>();

const mermaidKey = (source: string) => `${useStore.getState().resolvedMode}|${source}`;

/** Re-render every live preview view once something async resolves. */
function requestRefresh(view: EditorView): void {
  // Never dispatch synchronously: this is reached from inside a view update.
  // `destroyed` is private on EditorView, so the guard is try/catch — a view
  // torn down between the timer and the dispatch throws instead of silently
  // writing into a dead editor.
  setTimeout(() => {
    try {
      view.dispatch({ effects: livePreviewRefresh.of(null) });
    } catch {
      /* view was destroyed while the async render was in flight */
    }
  }, 0);
}

function ensureMermaid(source: string, view: EditorView): void {
  const key = mermaidKey(source);
  if (mermaidCache.has(key) || mermaidPending.has(key) || mermaidFailed.has(key)) return;
  mermaidPending.add(key);
  void (async () => {
    let ok = false;
    try {
      const mod = await import("mermaid");
      mod.default.initialize({
        startOnLoad: false,
        theme: useStore.getState().resolvedMode === "dark" ? "dark" : "default",
        securityLevel: "antiscript",
      });
      const id = "lp-" + Math.random().toString(36).slice(2, 8);
      const { svg } = await mod.default.render(id, source);
      mermaidCache.set(key, svg);
      ok = true;
    } catch (err) {
      // Cache the failure so a broken diagram is not retried on every keystroke.
      mermaidFailed.add(key);
      console.warn("live-preview-mermaid-failed", err);
    } finally {
      mermaidPending.delete(key);
    }
    if (ok) requestRefresh(view);
  })();
}

/* -------------------------------------------------------------------- katex */

let katexModule: typeof import("katex") | null = null;
let katexRequested = false;
const katexCache = new Map<string, string>();

function renderMath(source: string, display: boolean): string | null {
  const key = (display ? "D|" : "I|") + source;
  const hit = katexCache.get(key);
  if (hit !== undefined) return hit;
  if (!katexModule) return null;
  const html = katexModule.renderToString(source, {
    displayMode: display,
    throwOnError: false,
    output: "html",
  });
  katexCache.set(key, html);
  return html;
}

function ensureKatex(view: EditorView): void {
  if (katexModule || katexRequested) return;
  katexRequested = true;
  void (async () => {
    try {
      katexModule = await import("katex");
      requestRefresh(view);
    } catch (err) {
      console.warn("live-preview-katex-failed", err);
    }
  })();
}

/* -------------------------------------------------------------- frontmatter */

/**
 * YAML frontmatter is not part of the markdown grammar, so the parser reads the
 * closing `---` as a setext underline and turns `title: x` into a heading. The
 * app defines frontmatter as a document-leading block, so it is detected here
 * and excluded from every decoration.
 */
export function frontmatterRange(doc: Text): { from: number; to: number } | null {
  if (doc.lines < 3) return null;
  if (doc.line(1).text.trim() !== "---") return null;
  for (let n = 2; n <= doc.lines; n++) {
    const text = doc.line(n).text.trim();
    if (text === "---" || text === "...") return { from: 0, to: doc.line(n).to };
    // A blank line means this is an ordinary `---` rule followed by prose, not
    // frontmatter. Stopping here is what keeps page content from being hidden.
    if (text === "") return null;
  }
  return null;
}

/* ------------------------------------------------------------ math scanning */

export interface MathRange {
  from: number;
  to: number;
  display: boolean;
  source: string;
}

/**
 * Scan for math. Inline delimiters are line-local and display delimiters are
 * line-anchored, so a scan is more predictable here than a parser extension.
 * The rules are deliberately conservative so ordinary prose containing `$` or a
 * currency amount is never eaten:
 *   - inline: `$` immediately followed by a non-space, closed by a `$` that is
 *     not preceded by a space, both on the same line
 *   - display: a line that is exactly `$$`, closed by a line that is exactly `$$`
 */
export function findMath(doc: Text): MathRange[] {
  const out: MathRange[] = [];
  let displayStart = -1;

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);

    if (displayStart >= 0) {
      if (line.text.trim() === "$$") {
        out.push({
          from: displayStart,
          to: line.to,
          display: true,
          source: doc.sliceString(displayStart + 2, line.from).trim(),
        });
        displayStart = -1;
      }
      continue;
    }
    if (line.text.trim() === "$$") {
      displayStart = line.from;
      continue;
    }

    const text = line.text;
    let i = 0;
    while (i < text.length) {
      if (text[i] !== "$") { i++; continue; }
      if (text[i + 1] === "$") { i += 2; continue; }
      const first = text[i + 1];
      if (first === undefined || /\s/.test(first)) { i++; continue; }
      let j = i + 1;
      let close = -1;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === "$" && !/\s/.test(text[j - 1])) { close = j; break; }
        j++;
      }
      if (close < 0) { i++; continue; }
      out.push({
        from: line.from + i,
        to: line.from + close + 1,
        display: false,
        source: text.slice(i + 1, close),
      });
      i = close + 1;
    }
  }
  return out;
}

/* ---------------------------------------------------------- table extraction */

// Re-exported from widgets so tests and the widget share one definition.
export type { CellSegment };

export interface ParsedTable {
  header: CellSegment[][];
  rows: CellSegment[][][];
  aligns: Array<"left" | "center" | "right" | null>;
}

/** Split a table row on unescaped pipes, returning trimmed cell sources. */
export function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (s[i] === "|") { cells.push(cur); cur = ""; continue; }
    cur += s[i];
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

/** `:---` -> left, `:---:` -> center, `---:` -> right, `---` -> unset. */
export function parseAlign(spec: string): "left" | "center" | "right" | null {
  const s = spec.trim();
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

/** Compile a cell's inline markdown into flat `{ text, mark }` runs. */
export function inlineSegments(raw: string): CellSegment[] {
  const segs: CellSegment[] = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`(.+?)`|~~(.+?)~~|==(.+?)==/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) segs.push({ text: raw.slice(last, m.index), mark: null });
    if (m[2] !== undefined) segs.push({ text: m[2], mark: "strong" });
    else if (m[4] !== undefined) segs.push({ text: m[4], mark: "em" });
    else if (m[5] !== undefined) segs.push({ text: m[5], mark: "code" });
    else if (m[6] !== undefined) segs.push({ text: m[6], mark: "strike" });
    else if (m[7] !== undefined) segs.push({ text: m[7], mark: "mark" });
    last = m.index + m[0].length;
  }
  if (last < raw.length) segs.push({ text: raw.slice(last), mark: null });
  return segs.length ? segs : [{ text: raw, mark: null }];
}

/** Parse table source lines; returns null when it is not really a table. */
export function parseTable(lines: string[]): ParsedTable | null {
  if (lines.length < 2) return null;
  const spec = splitTableRow(lines[1]);
  if (spec.length === 0) return null;
  if (!spec.every(c => /^:?-{1,}:?$/.test(c.trim()))) return null;
  const rows: CellSegment[][][] = [];
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    rows.push(splitTableRow(lines[i]).map(inlineSegments));
  }
  return {
    header: splitTableRow(lines[0]).map(inlineSegments),
    rows,
    aligns: spec.map(parseAlign),
  };
}

/* ------------------------------------------------------------ footnote utils */

/**
 * Resolve an image reference to a loadable URL.
 *
 * `resolveImageUrl` reaches `convertFileSrc`, a Tauri-only API. It throws
 * outside a Tauri context (and could throw for other reasons in one), and a
 * throw here happens INSIDE the decoration pass — which makes CodeMirror tear
 * down the whole plugin, taking every heading, mark and table with it. Failure
 * therefore degrades to the raw reference: a broken image instead of a
 * decoration-less editor.
 */
function safeResolveImageUrl(src: string, notePath: string | null): string {
  try {
    return resolveImageUrl(src, notePath);
  } catch {
    return src;
  }
}

/* ---------------------------------------------------------- block line class */

/** Inline HTML tags that have a meaningful visual treatment. */
const INLINE_HTML_CLASS: Record<string, string> = {
  kbd: "cm-zn-html-kbd",
  mark: "cm-zn-html-mark",
  code: "cm-zn-inline-code",
  strong: "cm-zn-inline-strong",
  b: "cm-zn-inline-strong",
  em: "cm-zn-inline-em",
  i: "cm-zn-inline-em",
  del: "cm-zn-inline-strike",
  s: "cm-zn-inline-strike",
  a: "cm-zn-inline-link",
  sup: "cm-zn-html-sup",
  sub: "cm-zn-html-sub",
};

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-zn-h1",
  ATXHeading2: "cm-zn-h2",
  ATXHeading3: "cm-zn-h3",
  ATXHeading4: "cm-zn-h4",
  ATXHeading5: "cm-zn-h5",
  ATXHeading6: "cm-zn-h6",
  SetextHeading1: "cm-zn-h1",
  SetextHeading2: "cm-zn-h2",
};

/* ---------------------------------------------------------------- the build */

/**
 * Block-level replacements.
 *
 * These MUST come from a StateField, not a ViewPlugin: a block decoration
 * changes vertical layout, so CodeMirror refuses to accept it from the view
 * layer ("Block decorations may not be specified via plugins"). A StateField
 * has no access to the view, so this pass reads the whole document rather than
 * just the viewport — acceptable because it only looks for the handful of node
 * types that render as blocks, and their count is small even in long notes.
 *
 * Async renders (Mermaid) are kicked off by the plugin, which does have a view;
 * this pass only reads what is already cached.
 */
export function buildBlockDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const tree = syntaxTree(state);
  const fm = frontmatterRange(doc);
  const sel = state.selection.main;
  const touched = (from: number, to: number) => sel.from <= to && sel.to >= from;
  const ranges: Range<Decoration>[] = [];

  // Frontmatter: a rendered panel, or raw source while the caret is inside.
  // The markdown parser cannot recognise it — the closing `---` reads as a
  // setext underline — so it is handled first and its range is excluded from
  // every other pass below.
  if (fm && !touched(fm.from, fm.to)) {
    const inner = doc.sliceString(fm.from + 3, fm.to - 3).trim();
    ranges.push(
      Decoration.replace({
        widget: new FrontmatterWidget(inner),
        block: true,
      }).range(fm.from, fm.to),
    );
  }

  // Collect headings first: the TOC widget needs the whole document's outline,
  // and the paragraphs it replaces may appear before or after those headings.
  const headings: Array<{ level: number; text: string; pos: number }> = [];
  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      const level = /^ATXHeading([1-6])$/.exec(node.name)?.[1];
      if (!level) return;
      const mark = node.node.getChild("HeaderMark");
      const textFrom = mark ? mark.to : node.from;
      let text = doc.sliceString(textFrom, node.to);
      // Setext headings keep their underline out of the label.
      text = text.replace(/\s*#+\s*$/, "").trim();
      headings.push({ level: Number(level), text, pos: node.from });
    },
  });

  // `[TOC]` on a line of its own renders as an outline.
  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      if (node.name !== "Paragraph") return;
      if (fm && node.from <= fm.to) return;
      const text = doc.sliceString(node.from, node.to).trim();
      if (!/^\[toc\]$/i.test(text)) return;
      // While the caret is inside, leave the literal `[TOC]` editable.
      if (touched(node.from, node.to)) return;
      const key = headings.map(h => `${h.level}:${h.text}@${h.pos}`).join("|");
      ranges.push(
        Decoration.replace({
          widget: new TocWidget(headings, key),
          block: true,
        }).range(node.from, node.to),
      );
    },
  });

  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      if (node.name !== "FencedCode" && node.name !== "Table") return;
      if (fm && node.from <= fm.to) return;
      if (touched(node.from, node.to)) return; // edit as source while inside

      if (node.name === "Table") {
        const lines: string[] = [];
        let pos = node.from;
        for (;;) {
          const line = doc.lineAt(pos);
          lines.push(line.text);
          if (line.to >= node.to || line.to >= doc.length) break;
          pos = line.to + 1;
        }
        const parsed = parseTable(lines);
        if (!parsed) return;
        ranges.push(
          Decoration.replace({
            widget: new TableWidget(parsed.header, parsed.rows, parsed.aligns, doc.sliceString(node.from, node.to)),
            block: true,
          }).range(node.from, node.to),
        );
        return;
      }

      // FencedCode: only ```mermaid renders as a block.
      const info = node.node.getChild("CodeInfo");
      if (!info) return;
      if (doc.sliceString(info.from, info.to).trim().toLowerCase() !== "mermaid") return;
      const body = node.node.getChild("CodeText");
      const source = (body ? doc.sliceString(body.from, body.to) : "").trim();
      if (!source) return;
      const key = mermaidKey(source);
      const cached = mermaidCache.get(key);
      ranges.push(
        Decoration.replace({
          widget: cached ? new MermaidWidget(cached, key) : new MermaidPlaceholder(),
          block: true,
        }).range(node.from, node.to),
      );
    },
  });

  // Raw HTML blocks render (sanitized), matching the previous editor. The
  // caret inside the block shows the source instead, so it stays editable.
  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      if (node.name !== "HTMLBlock") return;
      if (fm && node.from <= fm.to) return;
      const raw = doc.sliceString(node.from, node.to);
      // Ignore an HTML block that is really just the frontmatter fence.
      if (/^\s*---/.test(raw)) return;
      ranges.push(
        Decoration.replace({
          widget: new HtmlBlockWidget(renderHtmlValue(raw)),
          block: true,
        }).range(node.from, node.to),
      );
    },
  });

  // Display math spans lines, so it is a block replacement too.
  for (const m of findMath(doc)) {
    if (!m.display) continue;
    if (fm && m.from <= fm.to) continue;
    if (touched(m.from, m.to)) continue;
    const html = renderMath(m.source, true);
    if (html === null || html === "") continue;
    ranges.push(
      Decoration.replace({ widget: new MathWidget(html, true), block: true }).range(m.from, m.to),
    );
  }

  return Decoration.set(ranges, true);
}

/**
 * Block decorations live in the state so they can be provided to the editor.
 * Recomputed on doc/selection change and whenever an async render lands.
 */
export const livePreviewBlocks = StateField.define<DecorationSet>({
  create: (state) => buildBlockDecorations(state),
  update: (value, tr) => {
    const forced = tr.effects.some(e => e.is(livePreviewRefresh));
    if (!tr.docChanged && !tr.selection && !forced) return value;
    return buildBlockDecorations(tr.state);
  },
  provide: (field) =>
    EditorView.decorations.from(field),
});

/**
 * Kick off async work for the block constructs currently on screen. Called from
 * the plugin (which has a view) so a long note only renders the diagrams the
 * user can actually see rather than every diagram in the file.
 */
function ensureVisibleBlockRenders(view: EditorView): void {
  const doc = view.state.doc;
  const fm = frontmatterRange(doc);
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "FencedCode") return;
        if (fm && node.from <= fm.to) return;
        const info = node.node.getChild("CodeInfo");
        if (!info) return;
        if (doc.sliceString(info.from, info.to).trim().toLowerCase() !== "mermaid") return;
        const body = node.node.getChild("CodeText");
        const source = (body ? doc.sliceString(body.from, body.to) : "").trim();
        if (source) ensureMermaid(source, view);
      },
    });
  }
}

export function buildDecorations(view: EditorView): {
  decos: Range<Decoration>[];
  atomic: Range<Decoration>[];
} {
  const decos: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  const state = view.state;
  const doc = state.doc;
  const sel = state.selection.main;
  const tree = syntaxTree(state);
  const fm = frontmatterRange(doc);

  const inFrontmatter = (pos: number) => fm !== null && pos >= fm.from && pos <= fm.to;

  /** True when the selection touches [from, to] — i.e. it is being edited. */
  const touched = (from: number, to: number) => sel.from <= to && sel.to >= from;

  /** True when a real range (not just a caret) is selected. */
  const hasSelection = () => state.selection.main.from !== state.selection.main.to;

  /** Hide a syntax range, or reveal (dim) it when the caret is inside. */
  const markRange = (from: number, to: number, widget?: WidgetType) => {
    if (from >= to) return;
    if (touched(from, to)) {
      // The dim mark colour sits at ~2:1 against a selection background, which
      // is what made selected text unreadable. Revealed marks therefore switch
      // to full contrast whenever a range is selected, and stay dim when the
      // caret is merely resting in the block.
      const cls = hasSelection() ? "cm-zn-mark cm-zn-mark-on" : "cm-zn-mark";
      decos.push(Decoration.mark({ class: cls }).range(from, to));
      return;
    }
    const deco = Decoration.replace(widget ? { widget } : {});
    decos.push(deco.range(from, to));
    atomic.push(deco.range(from, to));
  };

  const styleRange = (from: number, to: number, cls: string) => {
    // Append the "-on" variant while a range is selected so every dim colour
    // (link, muted prose) clears contrast against the selection background.
    // Without this the low-contrast colours stayed at ~3:1 when selected.
    if (from < to) decos.push(Decoration.mark({ class: hasSelection() ? `${cls} ${cls}-on` : cls }).range(from, to));
  };

  const styledLines = new Set<number>();
  const styleLine = (pos: number, cls: string) => {
    const line = doc.lineAt(pos);
    if (styledLines.has(line.from)) return;
    styledLines.add(line.from);
    decos.push(
      Decoration.line({ class: hasSelection() ? `${cls} ${cls}-on` : cls }).range(line.from),
    );
  };

  /** Every line a range covers, inclusive. */
  const eachLine = (from: number, to: number, fn: (line: ReturnType<Text["lineAt"]>) => void) => {
    let pos = from;
    for (;;) {
      const line = doc.lineAt(pos);
      fn(line);
      if (line.to >= to || line.to >= doc.length) break;
      pos = line.to + 1;
    }
  };

  /** The single space that separates a marker from its content. */
  const pastSpace = (pos: number) =>
    doc.sliceString(pos, pos + 1) === " " ? pos + 1 : pos;

  ensureKatex(view);
  ensureVisibleBlockRenders(view);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const { name, from: nFrom, to: nTo } = node;
        if (inFrontmatter(nFrom)) return;

        const headingClass = HEADING_CLASS[name];
        if (headingClass) {
          eachLine(nFrom, nTo, (line) => styleLine(line.from, headingClass));
          const headerMark = node.node.getChild("HeaderMark");
          if (headerMark) {
            // Hides the `#` run plus the one space after it, so no gap remains.
            markRange(headerMark.from, pastSpace(headerMark.to));
          }
          return;
        }

        if (name === "Blockquote") {
          eachLine(nFrom, nTo, (line) => styleLine(line.from, "cm-zn-quote"));
          return;
        }
        if (name === "QuoteMark") {
          markRange(nFrom, pastSpace(nTo));
          return;
        }

        if (name === "ListMark") {
          // A task item renders a checkbox; a bullet beside it would be doubled
          // chrome. The mark still gets hidden, just with no widget.
          if (node.node.parent?.node.getChild("Task")) {
            markRange(nFrom, pastSpace(nTo));
            return;
          }
          const text = doc.sliceString(nFrom, nTo);
          const indent = nFrom - doc.lineAt(nFrom).from;
          const depth = Math.floor(indent / 2);
          const ordered = /^\d/.test(text) ? text : null;
          markRange(nFrom, pastSpace(nTo), new BulletWidget(ordered, depth));
          return;
        }
        if (name === "TaskMarker") {
          const checked = /\[[xX]\]/.test(doc.sliceString(nFrom, nTo));
          markRange(nFrom, pastSpace(nTo), new TaskWidget(checked));
          return;
        }

        if (name === "HorizontalRule") {
          markRange(nFrom, nTo, new RuleWidget());
          return;
        }

        if (name === "FencedCode") {
          eachLine(nFrom, nTo, (line) => styleLine(line.from, "cm-zn-fence"));
          // Language chip + copy button, placed after the info string on the
          // opening fence line (where the Crepe editor put its language button).
          if (!touched(nFrom, nTo)) {
            const info = node.node.getChild("CodeInfo");
            const body = node.node.getChild("CodeText");
            const lang = info ? doc.sliceString(info.from, info.to).trim() : "";
            const source = body ? doc.sliceString(body.from, body.to).replace(/\n$/, "") : "";
            const at = info ? info.to : node.node.getChild("CodeMark")?.to ?? nFrom;
            decos.push(
              Decoration.widget({ widget: new CodeToolsWidget(lang, source), side: 1 }).range(at),
            );
          }
          return;
        }
        if (name === "CodeMark" && node.node.parent?.name === "FencedCode") {
          // Only the fences; `CodeInfo` (the language chip) deliberately stays.
          markRange(nFrom, nTo);
          return;
        }

        if (name === "Image") {
          if (touched(nFrom, nTo)) { markRange(nFrom, nTo); return; }
          // A single inline node, so a plain (non-block) replacement is correct.
          const raw = doc.sliceString(nFrom, nTo);
          const alt = /^!\[([^\]]*)\]/.exec(raw)?.[1] ?? "";
          const urlNode = node.node.getChild("URL");
          const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : "";
          markRange(
            nFrom,
            nTo,
            new ImageWidget(
              safeResolveImageUrl(url, useStore.getState().currentFilePath),
              alt,
            ),
          );
          return;
        }

        if (name === "StrongEmphasis" || name === "Emphasis") {
          const marks = node.node.getChildren("EmphasisMark");
          if (marks.length >= 2) {
            styleRange(
              marks[0].to,
              marks[marks.length - 1].from,
              name === "StrongEmphasis" ? "cm-zn-inline-strong" : "cm-zn-inline-em",
            );
            for (const m of marks) markRange(m.from, m.to);
          }
          return;
        }
        if (name === "Strikethrough") {
          const marks = node.node.getChildren("StrikethroughMark");
          if (marks.length >= 2) {
            styleRange(marks[0].to, marks[marks.length - 1].from, "cm-zn-inline-strike");
            for (const m of marks) markRange(m.from, m.to);
          }
          return;
        }
        if (name === "Highlight") {
          const marks = node.node.getChildren("HighlightMark");
          if (marks.length >= 2) {
            styleRange(marks[0].to, marks[marks.length - 1].from, "cm-zn-inline-mark");
            for (const m of marks) markRange(m.from, m.to);
          }
          return;
        }
        if (name === "InlineCode") {
          const marks = node.node.getChildren("CodeMark");
          if (marks.length >= 2) {
            styleRange(marks[0].to, marks[marks.length - 1].from, "cm-zn-inline-code");
            for (const m of marks) markRange(m.from, m.to);
          }
          return;
        }

        if (name === "Link") {
          // `[text](url)` -> keep `text`, hide the brackets AND the target.
          // Hiding must start at the closing `]`, not at the `(`: starting at
          // the `(` left a stray bracket rendered after the link text.
          const marks = node.node.getChildren("LinkMark");
          if (marks.length >= 4) {
            const open = marks[0];
            styleRange(open.to, marks[1].from, "cm-zn-inline-link");
            markRange(open.from, open.to);
            markRange(marks[1].from, marks[marks.length - 1].to);
          }
          return;
        }
      },
    });
  }

  /* ---- inline raw HTML ---- */
  // `<kbd>Ctrl</kbd>` arrives as two separate HTMLTag nodes with the content
  // between them, so the tags are paired here and the content is classified by
  // tag name. Without this, inline HTML showed as literal `<kbd>` text while
  // block HTML rendered — an inconsistency the previous editor did not have.
  const openTags: Array<{ name: string; from: number; to: number }> = [];
  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      if (node.name !== "HTMLTag") return;
      if (fm && node.from <= fm.to) return;
      const raw = doc.sliceString(node.from, node.to);
      const closing = /^<\s*\//.test(raw);
      const name = /^<\s*\/?\s*([a-zA-Z][\w-]*)/.exec(raw)?.[1]?.toLowerCase();
      if (!name) return;
      if (closing) {
        // Close the nearest unclosed tag with the same name on this line.
        const lineFrom = doc.lineAt(node.from).from;
        for (let i = openTags.length - 1; i >= 0; i--) {
          const open = openTags[i];
          if (open.name !== name) continue;
          if (doc.lineAt(open.from).from !== lineFrom) break;
          openTags.splice(i, 1);
          const cls = INLINE_HTML_CLASS[name];
          if (cls) styleRange(open.to, node.from, cls);
          markRange(open.from, open.to);
          markRange(node.from, node.to);
          break;
        }
        return;
      }
      openTags.push({ name, from: node.from, to: node.to });
    },
  });
  // Any tag left unpaired (a void tag like <br>, or malformed HTML): hide it
  // rather than leaving angle brackets in the prose.
  for (const open of openTags) markRange(open.from, open.to);

  /* ---- footnotes ---- */
  // Refs render as numbered chips; a definition's `[^id]:` marker is hidden and
  // its body gets a line class, so the rendered form matches the Crepe editor's
  // sup / definition pair without needing footnote grammar in the parser.
  const fn = footnoteScanOf(view);
  const fnNumbers = footnoteNumbers(fn);
  for (const ref of fn.refs) {
    if (inFrontmatter(ref.from)) continue;
    markRange(ref.from, ref.to, new FootnoteRefWidget(fnNumbers.get(ref.id) ?? 0, ref.id));
  }
  for (const def of fn.defs) {
    markRange(def.markFrom, def.markTo);
    styleLine(def.markFrom, "cm-zn-footnote-def");
  }

  /* ---- inline math (display math is a block, handled by the field) ---- */
  for (const m of findMath(doc)) {
    if (m.display) continue;
    if (inFrontmatter(m.from)) continue;
    if (touched(m.from, m.to)) { markRange(m.from, m.to); continue; }
    const html = renderMath(m.source, false);
    if (html === null || html === "") continue;
    markRange(m.from, m.to, new MathWidget(html, false));
  }

  return { decos, atomic };
}

/** Shown for the frame or two before Mermaid finishes rendering. */
class MermaidPlaceholder extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-zn-mermaid cm-zn-mermaid-pending";
    el.textContent = "rendering diagram…";
    return el;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Recomputes on doc, selection and viewport changes — the selection matters
 * because moving the caret in or out of a range is what flips it between hidden
 * and revealed. Viewport-only recomputation keeps a 5000-line note cheap.
 */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;

    constructor(view: EditorView) {
      const { decos, atomic } = buildDecorations(view);
      this.decorations = Decoration.set(decos, true);
      this.atomic = Decoration.set(atomic, true);
    }

    update(update: ViewUpdate): void {
      const forced = update.transactions.some(tr =>
        tr.effects.some(e => e.is(livePreviewRefresh)),
      );
      // `geometryChanged` matters on mount: the constructor's pass runs before
      // layout, so anything scoped to the viewport (code-block tools, inline
      // marks) would be missing until the next update without it.
      if (
        !forced &&
        !update.docChanged &&
        !update.selectionSet &&
        !update.viewportChanged &&
        !update.geometryChanged
      ) return;
      const { decos, atomic } = buildDecorations(update.view);
      this.decorations = Decoration.set(decos, true);
      this.atomic = Decoration.set(atomic, true);
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  },
);

/**
 * Everything the Live Preview editor needs, in one array.
 *
 * The field and the plugin are kept separate on purpose: block replacements
 * must come from the state, everything else is cheaper from the view because it
 * can be limited to the viewport.
 */
export const livePreviewExtensions = [
  livePreviewBlocks,
  livePreview,
  footnoteFlashField,
  // Block replacements are skipped by the caret too.
  EditorView.atomicRanges.of((view) => view.state.field(livePreviewBlocks)),
];
