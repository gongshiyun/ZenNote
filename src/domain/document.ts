/**
 * Document Context — domain logic for markdown content analysis.
 */
import type { Heading } from "./types";

/**
 * Parse all ATX headings (#{1,6}) from markdown source.
 * Returns headings with their line index (pos) for scroll-to-heading.
 */
export function parseHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/);
  const result: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      result.push({ level: match[1].length, text: match[2].trim(), pos: i });
    }
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
  const chineseChars = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = content
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

/** Average reading speed used for the estimate (mixed CJK/latin content). */
const WORDS_PER_MINUTE = 400;

/**
 * Estimate the reading time of a document in whole minutes.
 * Returns 0 for empty documents; otherwise at least 1 minute.
 */
export function estimateReadingTime(content: string): number {
  const { totalWords } = computeWordCount(content);
  if (totalWords <= 0) return 0;
  return Math.max(1, Math.ceil(totalWords / WORDS_PER_MINUTE));
}
