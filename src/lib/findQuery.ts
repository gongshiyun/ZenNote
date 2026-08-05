/**
 * Find/Replace core matching logic — pure functions, shared by the
 * ProseMirror find plugin (WYSIWYG mode) and the CodeMirror source editor.
 * Keeping matching here makes it unit-testable without any editor instance.
 */

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
}

export const defaultFindOptions: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

/** Escape a literal string so it can be embedded in a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the global RegExp used for scanning. Returns null when the query is
 * empty or (in regex mode) the pattern is invalid — callers surface that as
 * an "invalid regex" hint instead of throwing.
 *
 * Whole-word boundaries use Unicode letter/number classes so CJK text behaves
 * sensibly (\b alone is ASCII-only).
 */
export function buildFindRegex(query: string, opts: FindOptions): RegExp | null {
  if (!query) return null;
  let src: string;
  if (opts.regex) {
    src = query;
  } else {
    src = escapeRegExp(query);
    if (opts.wholeWord) {
      src = "(?<![\\p{L}\\p{N}_])" + src + "(?![\\p{L}\\p{N}_])";
    }
  }
  let flags = "g";
  if (!opts.caseSensitive) flags += "i";
  flags += "u";
  try {
    return new RegExp(src, flags);
  } catch {
    return null;
  }
}

/** Upper bound so a pathological query can never freeze the UI. */
export const MAX_MATCHES = 10000;

/**
 * Find all matches of `query` inside `text` (plain string coordinates).
 * Zero-length regex matches are skipped to avoid infinite loops.
 */
export function findAllMatches(text: string, query: string, opts: FindOptions): FindMatch[] {
  if (!text || !query) return [];
  const re = buildFindRegex(query, opts);
  if (!re) return [];
  const out: FindMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ from: m.index, to: m.index + m[0].length });
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

/** Wrap an index into [0, count) for cyclic next/prev navigation. */
export function wrapIndex(idx: number, count: number): number {
  if (count <= 0) return 0;
  return ((idx % count) + count) % count;
}

/** True when the string looks like an absolute http(s) URL (paste-as-link). */
export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/[^\s<>"']+$/i.test(text.trim());
}

/**
 * Minimal structural contract of a ProseMirror document node — enough for
 * match collection without importing ProseMirror here (keeps this module
 * dependency-free and unit-testable with fakes).
 */
export interface DocLike {
  descendants: (cb: (node: DocNodeLike, pos: number) => false | void) => void;
}

export interface DocNodeLike {
  isText?: boolean;
  text?: string;
}

/**
 * Collect all matches of `query` in DOCUMENT coordinates by scanning each text
 * node of a ProseMirror-like document. Matching per text node keeps positions
 * exact (no offset drift from inline atom nodes such as footnote refs or
 * images). Results are ordered by position and capped at MAX_MATCHES.
 */
export function collectMatchesFromDoc(doc: DocLike, query: string, opts: FindOptions): FindMatch[] {
  const out: FindMatch[] = [];
  if (!query) return out;
  doc.descendants((node, pos) => {
    if (out.length >= MAX_MATCHES) return false;
    if (node.isText && typeof node.text === "string" && node.text) {
      for (const m of findAllMatches(node.text, query, opts)) {
        out.push({ from: pos + m.from, to: pos + m.to });
        if (out.length >= MAX_MATCHES) break;
      }
    }
    return undefined;
  });
  return out;
}
