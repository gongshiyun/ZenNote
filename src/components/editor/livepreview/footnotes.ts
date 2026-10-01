/**
 * Footnote support for the Live Preview editor.
 *
 * The markdown grammar has no footnote construct, so there is no syntax node to
 * read. Rather than write a lezer block+inline extension (deep, untestable
 * internals), footnotes are scanned textually — the same approach already used
 * for math and frontmatter — and ranges inside fenced code are excluded by the
 * caller using the syntax tree. That keeps every decision a pure function.
 *
 * Recognised forms, matching what the Crepe editor renders:
 *   definition   `[^id]: body text`   at the start of a line, optionally indented
 *   reference    `[^id]`              inline, anywhere except a definition's `:`
 */

export interface FootnoteDef {
  id: string;
  /** Range of the whole definition marker `[^id]:`, i.e. what gets hidden. */
  markFrom: number;
  markTo: number;
  /** Body text range, so it can be styled as the definition's content. */
  bodyFrom: number;
  bodyTo: number;
}

export interface FootnoteRef {
  id: string;
  from: number;
  to: number;
}

/** `[^id]: body` at a line start -> the id and where the body begins. */
export function parseFootnoteDefLine(line: string, lineStart: number):
  { id: string; markFrom: number; markTo: number; bodyFrom: number; bodyTo: number } | null {
  const m = /^(\s*)\[\^([^\]\s]+)\]:[ \t]?/.exec(line);
  if (!m) return null;
  const markFrom = lineStart + m[1].length;
  const markTo = lineStart + m[0].length;
  return {
    id: m[2],
    markFrom,
    markTo,
    bodyFrom: markTo,
    bodyTo: lineStart + line.length,
  };
}

/**
 * Every `[^id]` reference in `text`, as offsets relative to `text`.
 *
 * A definition's own marker is excluded because it is always followed by `:`,
 * which no reference form allows.
 */
export function findFootnoteRefs(text: string): Array<{ id: string; from: number; to: number }> {
  const out: Array<{ id: string; from: number; to: number }> = [];
  const re = /\[\^([^\]\s]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (text[m.index + m[0].length] === ":") continue; // a definition marker
    out.push({ id: m[1], from: m.index, to: m.index + m[0].length });
  }
  return out;
}

/** Ranges (absolute) that must never be scanned: fenced code and frontmatter. */
export interface SkipRange {
  from: number;
  to: number;
}

function inAny(pos: number, ranges: SkipRange[]): boolean {
  return ranges.some(r => pos >= r.from && pos <= r.to);
}

export interface FootnoteScan {
  defs: FootnoteDef[];
  refs: FootnoteRef[];
  /** id -> definition, for jump targets. */
  byId: Map<string, FootnoteDef>;
}

/**
 * Collect every definition and reference in the document.
 *
 * `skip` should contain the fenced-code and frontmatter ranges; a `[^1]` inside
 * a code sample is data, not a footnote.
 */
export function scanFootnotes(
  doc: { lines: number; line: (n: number) => { number: number; from: number; to: number; text: string } },
  skip: SkipRange[] = [],
): FootnoteScan {
  const defs: FootnoteDef[] = [];
  const refs: FootnoteRef[] = [];

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (inAny(line.from, skip)) continue;

    const def = parseFootnoteDefLine(line.text, line.from);
    if (def) {
      defs.push(def);
      // A definition's body may itself contain references; still scan it.
      for (const r of findFootnoteRefs(line.text.slice(def.markTo - line.from))) {
        const from = def.markTo + r.from;
        refs.push({ id: r.id, from, to: from + (r.to - r.from) });
      }
      continue;
    }

    for (const r of findFootnoteRefs(line.text)) {
      refs.push({ id: r.id, from: line.from + r.from, to: line.from + r.to });
    }
  }

  const byId = new Map<string, FootnoteDef>();
  for (const d of defs) if (!byId.has(d.id)) byId.set(d.id, d);

  return { defs, refs, byId };
}

/**
 * Sequential display numbers for references.
 *
 * Footnotes are numbered by the order their DEFINITIONS appear, not by their
 * ids, so `[^note]` still renders as ¹ when it is the first one. Repeated
 * references to the same id share a number.
 */
export function footnoteNumbers(scan: FootnoteScan): Map<string, number> {
  const order = new Map<string, number>();
  let next = 1;
  for (const d of scan.defs) {
    if (!order.has(d.id)) order.set(d.id, next++);
  }
  // A reference with no definition still needs a number rather than a blank.
  for (const r of scan.refs) {
    if (!order.has(r.id)) order.set(r.id, next++);
  }
  return order;
}
