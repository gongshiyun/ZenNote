/**
 * Document Context — domain logic for markdown content analysis.
 */
import type { Heading } from "./types";

/**
 * Index of the line that closes a document-leading YAML frontmatter block, or
 * -1 when the file does not have one. Mirrors the editor's rule: the block must
 * start on line 0, close with `---`/`...`, and contain no blank line (a blank
 * line means the leading `---` was a horizontal rule).
 */
function frontmatterEndLine(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  for (let i = 1; i < lines.length; i++) {
    const text = lines[i].trim();
    if (text === "---" || text === "...") return i;
    if (text === "") return -1;
  }
  return -1;
}

/** Strip nested block-quote markers (`> `, `>> `) from the start of a line. */
function stripBlockquote(line: string): string {
  return line.replace(/^(?:\s{0,3}>\s?)+/, "");
}

/** Lines that start a non-paragraph block and therefore cannot be setext text. */
const BLOCK_START = /^\s{0,3}(?:[-*+]\s|\d+[.)]\s|>|\||<|$)/;

/**
 * Parse all headings (#{1,6} ATX and setext) from markdown source.
 * Returns headings with their line index (pos) for scroll-to-heading.
 *
 * The rules intentionally match what the Live Preview editor renders (the
 * lezer markdown grammar + `HEADING_CLASS`), not just "a line that starts with
 * a hash": up to three spaces of indentation, headings inside block quotes,
 * setext underlines, and a furled closing `###` run are all headings on screen,
 * so the outline must list them. Fenced code and frontmatter are skipped.
 */
export function parseHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/);
  const result: Heading[] = [];
  let fence: { marker: string; length: number } | null = null;
  const fmEnd = frontmatterEndLine(lines);
  /** Last plain paragraph line, i.e. a potential setext heading text line. */
  let paragraph: { index: number; text: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (i <= fmEnd) continue;
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code state machine (unchanged from the ATX-only parser).
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) fence = { marker, length };
      else if (marker === fence.marker && length >= fence.length) fence = null;
      paragraph = null;
      continue;
    }
    if (fence) {
      paragraph = null;
      continue;
    }

    // Setext heading: the underline turns the previous paragraph line into a
    // heading. A blank line before it means it is a horizontal rule instead.
    const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    if (setext && paragraph) {
      result.push({
        level: setext[1][0] === "=" ? 1 : 2,
        text: paragraph.text,
        pos: paragraph.index,
      });
      paragraph = null;
      continue;
    }

    // ATX heading, optionally inside a block quote.
    const content = stripBlockquote(line);
    const atx = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(content);
    if (atx) {
      result.push({
        level: atx[1].length,
        text: atx[2].replace(/\s*#+\s*$/, "").trim(),
        pos: i,
      });
      paragraph = null;
      continue;
    }

    if (!trimmed || BLOCK_START.test(line) || /^\s{4,}/.test(line)) {
      paragraph = null;
      continue;
    }
    paragraph = { index: i, text: stripBlockquote(trimmed).trim() };
  }
  return result;
}

/**
 * Filter headings to display levels (h1-h3) while preserving original indices.
 */
export function displayableHeadings(headings: Heading[]): (Heading & { originalIdx: number })[] {
  return headings
    .map((h, originalIdx) => ({ ...h, originalIdx }))
    .filter(h => h.level <= 3);
}

export interface WordCount {
  chineseChars: number;
  englishWords: number;
  totalWords: number;
  totalChars: number;
  lineCount: number;
}

/**
 * Compute word/character statistics for a markdown document.
 * Chinese characters are counted individually; English words by whitespace split.
 */
export function computeWordCount(content: string): WordCount {
  const plain = markdownToPlainText(content);
  const chineseChars = (plain.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = plain
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return {
    chineseChars,
    englishWords,
    totalWords: chineseChars + englishWords,
    totalChars: content.length,
    lineCount: content ? content.split(/\r?\n/).length : 0,
  };
}

function markdownToPlainText(markdown: string): string {
  const withoutFrontmatter = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  const withoutFences = withoutFrontmatter.replace(
    /^```[^\n]*\n[\s\S]*?^```\s*$/gm,
    "",
  );
  return withoutFences
    .split(/\r?\n/)
    .map(line => line
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>+\s?/, "")
      .replace(/^\s*(?:[-+*]|\d+\.)\s+/, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_~]{1,3}/g, ""))
    .filter(line => !/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line))
    .join("\n");
}

/** Average reading speed used for the estimate (mixed CJK/latin content). */
export const WORDS_PER_MINUTE = 400;

/**
 * Estimate the reading time of a document in whole minutes.
 * Returns 0 for empty documents; otherwise at least 1 minute.
 */
export function estimateReadingTime(content: string): number {
  const { totalWords } = computeWordCount(content);
  if (totalWords <= 0) return 0;
  return Math.max(1, Math.ceil(totalWords / WORDS_PER_MINUTE));
}
