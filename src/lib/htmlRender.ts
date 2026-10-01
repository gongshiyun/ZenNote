/**
 * Raw-HTML rendering, shared by both editors.
 *
 * Extracted verbatim from the Crepe editor's node view so the Live Preview
 * editor renders raw HTML the same way — the same inner-markdown pass, the same
 * sanitizer, the same block detection. Duplicating this logic would inevitably
 * drift.
 */
import { sanitizeHtmlFragment } from "./sanitize";

/**
 * Render simple markdown (links / bold / italic / code / lists) inside an HTML
 * block's inner text — Typora also processes markdown within block-level HTML
 * tags, which is why `<cite>` containing a `- [x](y)` list renders as a list.
 */
export function renderInnerMarkdown(text: string): string {
  let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = s.split("\n");
  let out = "";
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { out += "<ul>"; inList = true; }
      out += "<li>" + trimmed.replace(/^[-*]\s+/, "") + "</li>";
    } else {
      if (inList) { out += "</ul>"; inList = false; }
      if (trimmed) out += "<p>" + trimmed + "</p>";
    }
  }
  if (inList) out += "</ul>";
  return out;
}

/** Whether a raw-HTML value is block-level (multi-line or a block tag). */
export function isBlockHtml(value: string): boolean {
  return (
    /\n/.test(value) ||
    /^<(div|p|h[1-6]|ul|ol|dl|table|blockquote|pre|section|article|cite|figure|details|header|footer|nav|aside|hr|form|fieldset|address|center)/i.test(
      value.trim(),
    )
  );
}

/**
 * innerHTML for a rendered raw-HTML node.
 *
 * If the block is a single tag pair whose inner content is pure markdown (no
 * nested HTML), the inner markdown is rendered too.
 */
export function renderHtmlValue(value: string): string {
  const block = isBlockHtml(value);
  const m = block ? value.trim().match(/^<(\w+)([^>]*)>([\s\S]*)<\/\1>\s*$/) : null;
  if (m && !m[3].includes("<")) {
    return sanitizeHtmlFragment(
      "<" + m[1] + m[2] + ">" + renderInnerMarkdown(m[3]) + "</" + m[1] + ">",
    );
  }
  return sanitizeHtmlFragment(value);
}
