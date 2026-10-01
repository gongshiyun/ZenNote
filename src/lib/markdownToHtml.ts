/**
 * Render the note's markdown to a standalone HTML fragment.
 *
 * This is a renderer rather than a copy of the editor's DOM, and that is the
 * whole point. The editor draws the note with CodeMirror, which renders only its
 * viewport — `ViewState.getViewport` covers the visible area plus a hard-coded
 * 1000px and cannot be widened — so the DOM holds about one screenful and nothing
 * else. Reading it exported the visible part of a note and silently dropped the
 * rest.
 *
 * Rendering from the source instead has three properties that matter for a file
 * a person keeps: it covers the whole document, it is deterministic, and it is a
 * pure function of the markdown, so it can be tested without a browser.
 *
 * The trade-off is that it can drift from the preview's appearance. Both use the
 * same parser (`@lezer/markdown` with the same GFM and highlight extensions the
 * editor installs), and anything async — diagrams, formulas, images — is injected
 * by the caller so this module stays free of the app's runtime.
 */
import { parser, GFM, type MarkdownExtension } from "@lezer/markdown";
import type { SyntaxNode } from "@lezer/common";
import { Text } from "@codemirror/state";
import { Highlight } from "../components/editor/livepreview/markdownExtensions";
import { findMath, frontmatterRange, type MathRange } from "../components/editor/livepreview/livePreview";
import { scanFootnotes } from "../components/editor/livepreview/footnotes";
import { parseHeadings } from "../domain";
import { renderHtmlValue } from "./htmlRender";
import { sanitizeHtmlFragment } from "./sanitize";

export interface RenderMarkdownOptions {
  /** Resolve an image source for the exported file. */
  resolveImage?: (src: string) => string;
  /** Render a diagram to sanitized SVG. Returning null keeps the source. */
  renderMermaid?: (source: string) => Promise<string | null>;
  /** Render TeX to HTML. Returning null keeps the source. */
  renderMath?: (source: string, display: boolean) => string | null;
  /** Heading of the generated outline; the app passes its own translated string. */
  tocTitle?: string;
}

/** The markdown parser, configured exactly as the editor configures it. */
const mdParser = parser.configure([GFM, Highlight as MarkdownExtension]);

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, c => ESCAPES[c] ?? c);
}

/**
 * Whether a link target may be emitted as a live `href`.
 *
 * A relative path, a fragment, or one of the ordinary web schemes is fine.
 * `javascript:` and `data:` are not: the export is a file that gets opened and
 * clicked, so an unrestricted target would execute when the reader clicks it.
 */
const SAFE_SCHEME = /^(?:https?|mailto|ftp|ftps|tel):/i;

function isSafeHref(href: string): boolean {
  const target = href.trim();
  // Protocol-relative and relative targets carry no scheme of their own.
  if (!/^[a-z][\w+.-]*:/i.test(target)) return true;
  return SAFE_SCHEME.test(target);
}

/** Node names that are pure syntax and must not reach the output. */
const MARKER_NODES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "QuoteMark",
  "ListMark",
  "TaskMarker",
  "StrikethroughMark",
  "HighlightMark",
  "TableDelimiter",
]);

const HEADING_TAGS: Record<string, string> = {
  ATXHeading1: "h1",
  ATXHeading2: "h2",
  ATXHeading3: "h3",
  ATXHeading4: "h4",
  ATXHeading5: "h5",
  ATXHeading6: "h6",
  SetextHeading1: "h1",
  SetextHeading2: "h2",
};

const HEADING_LEVELS: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
  SetextHeading1: 1,
  SetextHeading2: 2,
};

/** Every child node, in order. `getChildren()` requires a type in this version. */
function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) out.push(child);
  return out;
}

/**
 * Renders one document. Constructed per call so the walk has no shared state
 * beyond the source it was given.
 */
class HtmlRenderer {
  private readonly out: string[] = [];
  private readonly src: string;
  private readonly doc: Text;
  private readonly opts: RenderMarkdownOptions;
  private readonly math: MathRange[];
  private readonly maths: Array<{ from: number; to: number; source: string; display: boolean; html: string | null }> = [];
  private readonly footnoteNumbers = new Map<string, number>();
  private readonly footnoteRefs: Array<{ id: string; from: number; to: number }> = [];
  private readonly footnotes: Array<{ id: string; body: string }> = [];
  /** Mermaid blocks are rendered asynchronously; the slot is filled afterwards. */
  private readonly pendingDiagrams: Array<{ slot: string; source: string }> = [];
  /** Heading ids already handed out, so repeated titles stay separately linkable. */
  private readonly usedHeadingIds = new Set<string>();
  /** Ids assigned to heading nodes before the walk, in document order. */
  private readonly headingIdByFrom = new Map<number, string>();
  private readonly headingIds: string[] = [];

  constructor(src: string, doc: Text, opts: RenderMarkdownOptions) {
    this.src = src;
    this.doc = doc;
    this.opts = opts;
    this.math = findMath(doc);
  }

  /** Render a TeX range, or null when no renderer was supplied / it failed. */
  private tex(source: string, display: boolean): string | null {
    return this.opts.renderMath?.(source, display) ?? null;
  }

  async render(): Promise<string> {
    const scan = scanFootnotes(this.doc);

    // Footnote numbering follows definition order, matching the editor.
    scan.defs.forEach((def, i) => {
      this.footnoteNumbers.set(def.id, i + 1);
      this.footnotes.push({ id: def.id, body: this.src.slice(def.bodyFrom, def.bodyTo).trim() });
    });
    for (const ref of scan.refs) {
      if (!this.footnoteNumbers.has(ref.id)) continue;
      this.footnoteRefs.push({ id: ref.id, from: ref.from, to: ref.to });
    }

    // Maths is substituted by range, not by the grammar: `$$` and `$` are not
    // markdown, so the parser reads them as ordinary text. TeX that fails to
    // render keeps its source rather than disappearing.
    for (const m of this.math) {
      this.maths.push({ from: m.from, to: m.to, source: m.source, display: m.display, html: this.tex(m.source, m.display) });
    }

    const tree = mdParser.parse(this.src);
    this.assignHeadingIds(tree.topNode);
    this.emitChildren(tree.topNode, 0, this.src.length);
    if (this.footnotes.length) this.emitFootnotes();
    return this.resolveDiagrams(this.out.join(""));
  }

  /**
   * Swap the diagram placeholders for rendered SVG.
   *
   * The walk itself is synchronous, so a mermaid fence records a slot and the
   * render is awaited once at the end. Awaiting inside the walk would have pushed
   * the SVG into the output *after* it was joined, which lost the diagram
   * entirely.
   */
  private async resolveDiagrams(html: string): Promise<string> {
    if (!this.pendingDiagrams.length || !this.opts.renderMermaid) return html;
    let out = html;
    for (const diagram of this.pendingDiagrams) {
      const svg = await this.opts.renderMermaid(diagram.source);
      const replacement = svg
        ? `<div class="zn-export-mermaid">${svg}</div>`
        : `<pre><code class="language-mermaid">${escapeHtml(diagram.source)}</code></pre>`;
      out = out.split(diagram.slot).join(replacement);
    }
    return out;
  }

  /**
   * Hand out every heading's id up front, in document order.
   *
   * A `[TOC]` usually sits above the headings it links to, so ids assigned during
   * the walk would reach the outline first and the headings themselves would then
   * take the `-2` suffix — leaving every outline link dead.
   */
  private assignHeadingIds(root: SyntaxNode): void {
    const visit = (node: SyntaxNode): void => {
      const level = HEADING_LEVELS[node.name];
      if (level) {
        const id = this.headingId(level, this.src.slice(node.from, node.to));
        this.headingIdByFrom.set(node.from, id);
        this.headingIds.push(id);
        return;
      }
      for (const child of childrenOf(node)) visit(child);
    };
    visit(root);
  }

  /** Render a sub-range on its own so its outer whitespace can be trimmed. */
  private capture(fn: () => void): string {
    const mark = this.out.length;
    fn();
    return this.out.splice(mark).join("");
  }

  /* --------------------------------------------------------------- structure */

  private emitChildren(node: SyntaxNode, from: number, to: number): void {
    let pos = from;
    for (const child of childrenOf(node)) {
      // Text between children is plain content; the parser does not create leaves
      // for it.
      if (child.from > pos) this.emitText(pos, child.from);
      this.emitNode(child);
      pos = child.to;
    }
    if (pos < to) this.emitText(pos, to);
  }

  private emitNode(node: SyntaxNode): void {
    const { name } = node;
    if (MARKER_NODES.has(name)) return;

    // A footnote reference. `[^id]` parses as a link — the brackets become markers
    // — so it is matched by range against the scanned references rather than by
    // node type. Without this the markers were consumed and only `^id` survived.
    if (name === "Link" || name === "LinkReference") {
      const ref = this.footnoteRefs.find(r => r.from >= node.from && r.to <= node.to);
      if (ref) {
        const n = this.footnoteNumbers.get(ref.id);
        this.out.push(`<sup class="zn-fn-ref" id="fnref-${n}"><a href="#fn-${n}">${n}</a></sup>`);
        return;
      }
    }

    // A display-maths range, if any, is substituted in the text pass below, where
    // every range it covers is emitted. Swallowing the enclosing block instead
    // would have dropped a second `$$` block sharing that block.
    const heading = HEADING_TAGS[name];
    if (heading) {
      const marks = childrenOf(node).filter(c => c.name === "HeaderMark");
      // ATX headings lead with their `#` run (and may close with another); a setext
      // heading's only mark is the underline at the END. Reading the first mark as
      // "leading" handed setext an empty range, which is how the title vanished.
      const leading = marks.find(m => m.from <= node.from + 1);
      const trailing = marks.find(m => m.from > node.from + 1);
      const innerFrom = leading ? leading.to : node.from;
      const innerTo = trailing ? trailing.from : node.to;
      const id = this.headingIdByFrom.get(node.from) ?? this.headingId(HEADING_LEVELS[name], this.plainText(node));
      const inner = this.capture(() => this.emitChildren(node, innerFrom, innerTo)).trim();
      this.out.push(`<${heading} id="${id}">${inner}</${heading}>`);
      return;
    }

    switch (name) {
      case "Paragraph": {
        // `[TOC]` on a line of its own renders as the outline.
        const raw = this.src.slice(node.from, node.to).trim();
        if (/^\[toc\]$/i.test(raw)) {
          this.emitToc();
          return;
        }
        // A paragraph that is nothing but a display formula: a block <div> cannot
        // live inside a <p>, so the wrapper is dropped.
        if (this.maths.some(m => m.display && m.from <= node.from + 1 && m.to >= node.to - 1)) {
          this.emitChildren(node, node.from, node.to);
          return;
        }
        this.out.push("<p>");
        this.emitChildren(node, node.from, node.to);
        this.out.push("</p>");
        return;
      }
      case "Blockquote": {
        const inner = this.capture(() => this.emitChildren(node, node.from, node.to)).trim();
        this.out.push(`<blockquote>${inner}</blockquote>`);
        return;
      }
      case "BulletList":
        this.out.push("<ul>");
        this.emitChildren(node, node.from, node.to);
        this.out.push("</ul>");
        return;
      case "OrderedList": {
        // The marker is a child of the first ITEM, not of the list.
        const firstItem = node.firstChild;
        const mark = firstItem?.getChild("ListMark");
        const start = mark ? Number(/^(\d+)/.exec(this.src.slice(mark.from, mark.to))?.[1] ?? 1) : 1;
        this.out.push(start > 1 ? `<ol start="${start}">` : "<ol>");
        this.emitChildren(node, node.from, node.to);
        this.out.push("</ol>");
        return;
      }
      case "ListItem": {
        const mark = node.getChild("ListMark");
        const innerFrom = mark ? mark.to : node.from;
        // A task item is a ListItem that CONTAINS a Task node. Emitting an <li>
        // here as well produced `<li><li class="zn-task">`, which browsers render
        // as two list items — a stray bullet above the checkbox.
        if (node.getChild("Task")) {
          this.emitChildren(node, innerFrom, node.to);
          return;
        }
        // The marker and the space after it are syntax; without trimming, every
        // item opens with a stray space.
        const inner = this.capture(() => this.emitChildren(node, innerFrom, node.to)).trim();
        this.out.push(`<li>${inner}</li>`);
        return;
      }
      case "Task": {
        const marker = node.getChild("TaskMarker");
        const done = marker ? /\[x\]/i.test(this.src.slice(marker.from, marker.to)) : false;
        const inner = this.capture(() =>
          this.emitChildren(node, marker ? marker.to : node.from, node.to),
        ).trim();
        this.out.push(`<li class="zn-task"><input type="checkbox" disabled${done ? " checked" : ""}> ${inner}</li>`);
        return;
      }
      case "FencedCode":
        this.emitFencedCode(node);
        return;
      case "Table":
        this.emitTable(node);
        return;
      case "HorizontalRule":
        this.out.push("<hr>");
        return;
      case "HTMLBlock":
      case "CommentBlock": {
        const raw = this.src.slice(node.from, node.to).trim();
        // An HTML comment is not content.
        if (/^<!--/.test(raw)) return;
        this.out.push(`<div class="zn-html-render zn-html-block">${renderHtmlValue(raw)}</div>`);
        return;
      }
      case "LinkReference": {
        // `[^id]` references parse as links — the same node type as the `[^id]: …`
        // definition line. They are told apart by shape, and the reference is
        // emitted as a superscript.
        const raw = this.src.slice(node.from, node.to);
        if (/^\[\^[^\]]+\]:/.test(raw)) return; // a definition, emitted at the end
        const ref = this.footnoteRefs.find(r => r.from >= node.from && r.from < node.to);
        if (ref) {
          const n = this.footnoteNumbers.get(ref.id);
          this.out.push(`<sup class="zn-fn-ref" id="fnref-${n}"><a href="#fn-${n}">${n}</a></sup>`);
          return;
        }
        // An ordinary `[label]` reference: keep its text.
        this.emitChildren(node, node.from, node.to);
        return;
      }
      case "HardBreak":
        this.out.push("<br>");
        return;
      case "Escape":
        // The node covers the backslash and the escaped character.
        this.out.push(escapeHtml(this.src.slice(node.from + 1, node.to)));
        return;
      case "Entity":
        this.out.push(this.src.slice(node.from, node.to));
        return;
      case "Emphasis":
        this.wrap(node, "em");
        return;
      case "StrongEmphasis":
        this.wrap(node, "strong");
        return;
      case "Strikethrough":
        this.wrap(node, "del");
        return;
      case "Highlight":
        this.wrap(node, "mark");
        return;
      case "InlineCode": {
        const raw = this.src.slice(node.from, node.to);
        const ticks = /^`+/.exec(raw)?.[0] ?? "`";
        const body = raw.slice(ticks.length, raw.length - ticks.length);
        this.out.push(`<code>${escapeHtml(body)}</code>`);
        return;
      }
      case "Image":
      case "Link":
        this.emitLinkOrImage(node);
        return;
      default:
        // Anything unrecognised keeps its content rather than vanishing.
        this.emitChildren(node, node.from, node.to);
    }
  }

  private wrap(node: SyntaxNode, tag: string): void {
    this.out.push(`<${tag}>`);
    this.emitChildren(node, node.from, node.to);
    this.out.push(`</${tag}>`);
  }

  /* ------------------------------------------------------------------ inline */

  /**
   * Emit text between child nodes, substituting maths and footnote references,
   * which are recognised by range rather than by the grammar.
   */
  private emitText(from: number, to: number): void {
    let pos = from;
    const marks = [
      ...this.maths.map(m => ({ from: m.from, to: m.to, kind: "math" as const, m })),
      ...this.footnoteRefs.map(r => ({ from: r.from, to: r.to, kind: "footnote" as const, id: r.id })),
    ]
      .filter(m => m.from < to && m.to > pos)
      .sort((a, b) => a.from - b.from);

    for (const mark of marks) {
      if (mark.from < pos) continue;
      if (mark.from > pos) this.out.push(escapeHtml(this.src.slice(pos, mark.from)));
      if (mark.kind === "math") {
        const { m } = mark;
        const fallback = escapeHtml(this.src.slice(m.from, m.to));
        if (m.display) {
          this.out.push(`<div class="zn-export-latex">${m.html ?? fallback}</div>`);
        } else {
          this.out.push(m.html ? `<span class="zn-export-latex-inline">${m.html}</span>` : fallback);
        }
      } else {
        const n = this.footnoteNumbers.get(mark.id);
        this.out.push(`<sup class="zn-fn-ref" id="fnref-${n}"><a href="#fn-${n}">${n}</a></sup>`);
      }
      pos = mark.to;
    }
    if (pos < to) this.out.push(escapeHtml(this.src.slice(pos, to)));
  }

  /** `![alt](src "title")` — the label is plain text. */
  private emitLinkOrImage(node: SyntaxNode): void {
    const raw = this.src.slice(node.from, node.to);
    const isImage = node.name === "Image";
    const m = isImage
      ? /^!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)$/.exec(raw)
      : /^\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)$/.exec(raw);
    if (!m) {
      // A reference link or something the regex does not cover: keep the label.
      this.emitChildren(node, node.from, node.to);
      return;
    }
    const [, label, href, title] = m;
    if (isImage) {
      const src = this.opts.resolveImage?.(href) ?? href;
      this.out.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}"${title ? ` title="${escapeHtml(title)}"` : ""}>`);
      return;
    }
    // An exported file is a document someone opens and clicks, so a
    // `javascript:` (or `data:`) target would run on click. Anything outside the
    // allowlist is shown as plain text instead of a live link.
    if (!isSafeHref(href)) {
      this.out.push(`<span class="zn-link-blocked" title="${escapeHtml(href)}">${escapeHtml(label)}</span>`);
      return;
    }
    this.out.push(
      `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${escapeHtml(label)}</a>`,
    );
  }

  /* ------------------------------------------------------------------- blocks */

  private emitFencedCode(node: SyntaxNode): void {
    const info = node.getChild("CodeInfo");
    const language = info ? this.src.slice(info.from, info.to).trim() : "";
    const body = node.getChild("CodeText");
    const source = (body ? this.src.slice(body.from, body.to) : "").replace(/\n$/, "");

    if (language.toLowerCase() === "mermaid") {
      const slot = `\u0000mermaid-${this.pendingDiagrams.length}\u0000`;
      this.pendingDiagrams.push({ slot, source: source.trim() });
      this.out.push(slot);
      return;
    }
    const cls = /^[\w+#-]+$/.test(language) ? ` class="language-${escapeHtml(language)}"` : "";
    this.out.push(`<pre><code${cls}>${escapeHtml(source)}</code></pre>`);
  }

  private emitTable(node: SyntaxNode): void {
    // Alignment lives in the delimiter row, which the grammar does not attribute.
    const headerLine = this.src.slice(node.from, node.to).split("\n")[1] ?? "";
    const aligns = headerLine
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map(cell => {
        const c = cell.trim();
        if (c.startsWith(":") && c.endsWith(":")) return "center";
        if (c.endsWith(":")) return "right";
        if (c.startsWith(":")) return "left";
        return "";
      });

    this.out.push("<table>");
    for (const section of childrenOf(node)) {
      if (section.name === "TableDelimiter") continue;
      const isHeader = section.name === "TableHeader";
      this.out.push(isHeader ? "<thead><tr>" : "<tr>");
      let col = 0;
      for (const cell of childrenOf(section)) {
        if (cell.name !== "TableCell") continue;
        const tag = isHeader ? "th" : "td";
        const align = aligns[col];
        this.out.push(`<${tag}${align ? ` style="text-align:${align}"` : ""}>`);
        this.emitChildren(cell, cell.from, cell.to);
        this.out.push(`</${tag}>`);
        col++;
      }
      this.out.push(isHeader ? "</tr></thead><tbody>" : "</tr>");
    }
    this.out.push("</tbody></table>");
  }

  private emitToc(): void {
    const headings = parseHeadings(this.src);
    if (!headings.length) return;
    this.out.push(
      `<nav class="zn-toc"><div class="zn-toc-title">${escapeHtml(this.opts.tocTitle ?? "目录")}</div>` +
        '<ul class="zn-toc-list">',
    );
    let level = 0;
    headings.forEach((h, i) => {
      if (h.level > level) {
        this.out.push("<ul>".repeat(h.level - level));
      } else {
        this.out.push("</li>");
        this.out.push("</ul></li>".repeat(level - h.level));
      }
      level = h.level;
      // The pre-assigned ids, in the same document order, so each entry lands on
      // the heading it names.
      const id = this.headingIds[i] ?? this.headingId(h.level, h.text);
      this.out.push(`<li><a href="#${id}">${escapeHtml(h.text)}</a>`);
    });
    this.out.push("</li>" + "</ul></li>".repeat(Math.max(0, level - 1)) + "</ul></nav>");
  }

  private emitFootnotes(): void {
    this.out.push('<section class="zn-export-footnotes"><hr><ol>');
    for (const fn of this.footnotes) {
      const n = this.footnoteNumbers.get(fn.id);
      this.out.push(`<li id="fn-${n}">${renderHtmlValue(fn.body)} <a class="zn-fn-back" href="#fnref-${n}">↩</a></li>`);
    }
    this.out.push("</ol></section>");
  }

  /**
   * A stable id for a heading, so the outline can link to it.
   *
   * Repeated titles are common in a long note; without a suffix the second
   * `## Notes` and every outline entry after it would point at the first.
   */
  private headingId(level: number, text: string): string {
    const slug = text.trim().toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "");
    const base = `h-${level}-${slug || "section"}`;
    let id = base;
    for (let n = 2; this.usedHeadingIds.has(id); n++) id = `${base}-${n}`;
    this.usedHeadingIds.add(id);
    return id;
  }

  private plainText(node: SyntaxNode): string {
    return this.src.slice(node.from, node.to);
  }
}

/** Render the markdown to an HTML fragment. */
export async function renderMarkdownToHtml(
  markdown: string,
  options: RenderMarkdownOptions = {},
): Promise<string> {
  const doc = Text.of(markdown.split("\n"));

  // Frontmatter is not part of the grammar, so it is stripped before parsing and
  // emitted as its own block: dropping it silently would lose the note's metadata.
  const fm = frontmatterRange(doc);
  let body = markdown;
  let frontmatter = "";
  if (fm) {
    frontmatter = markdown.slice(fm.from, fm.to);
    body = markdown.slice(fm.to);
  }

  const renderer = new HtmlRenderer(body, Text.of(body.split("\n")), options);
  const rendered = await renderer.render();
  if (!frontmatter) return rendered;
  const inner = frontmatter.replace(/^---\n?/, "").replace(/\n?---\s*$/, "").trim();
  return `<pre class="zn-fm-block">${escapeHtml(inner)}</pre>${rendered}`;
}

/** Exported for tests: the escaping the renderer uses for text. */
export { escapeHtml as escapeExportText, sanitizeHtmlFragment };
