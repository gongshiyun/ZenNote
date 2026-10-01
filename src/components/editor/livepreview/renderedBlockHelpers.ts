/**
 * Pure helpers behind the Live Preview parity features.
 *
 * Kept free of DOM and CodeMirror so every index calculation is unit-testable.
 * All table helpers take and return the table's SOURCE LINES as an array of
 * strings, in the shape:
 *   [0]      header row      `| a | b |`
 *   [1]      delimiter row   `| --- | --- |`
 *   [2..]    data rows
 * and column indices are 0-based across cells.
 */

/* ------------------------------------------------------------ image alignment */

export type ImageAlign = "left" | "center" | "right";

export interface ImageAlt {
  /** Milkdown's resize ratio, kept verbatim so resizing is not lost. */
  ratio: string;
  align: ImageAlign;
}

/**
 * Parse an image's alt text.
 *
 * The convention (shared with the Crepe editor) is `"<ratio>|<align>"`, with a
 * legacy form of just the ratio and an implicit "center". Anything unparseable
 * falls back to a 1.00 ratio at centre rather than throwing, because alt text is
 * author-controlled and may be anything at all.
 */
export function parseImageAlt(alt: string): ImageAlt {
  const parts = String(alt ?? "").split("|");
  const ratioRaw = parts[0];
  const ratio = Number.isFinite(Number(ratioRaw)) && Number(ratioRaw) !== 0
    ? ratioRaw
    : "1.00";
  const alignRaw = (parts[1] ?? "").toLowerCase();
  const align: ImageAlign =
    alignRaw === "left" || alignRaw === "right" ? alignRaw : "center";
  return { ratio, align };
}

/** Re-encode alt text with a new alignment, preserving the ratio. */
export function withImageAlign(alt: string, align: ImageAlign): string {
  const { ratio } = parseImageAlt(alt);
  return `${ratio}|${align}`;
}

/* -------------------------------------------------------------- table editing */

const CELL_DELIM = "|";

/** Split a table row into trimmed cell texts. */
export function cellsOf(line: string): string[] {
  let s = line.trim();
  if (s.startsWith(CELL_DELIM)) s = s.slice(1);
  if (s.endsWith(CELL_DELIM) && !s.endsWith("\\|")) s = s.slice(0, -1);
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

/** Rebuild a row from cells, padded or trimmed to `width`. */
export function rowOf(cells: string[], width: number, fill = ""): string {
  const out = cells.slice(0, width);
  while (out.length < width) out.push(fill);
  return `${CELL_DELIM} ${out.join(` ${CELL_DELIM} `)} ${CELL_DELIM}`;
}

/** Number of columns in a table, taken from the delimiter row. */
export function tableWidth(lines: string[]): number {
  return lines.length >= 2 ? cellsOf(lines[1]).length : 0;
}

/**
 * Insert a data row. `after` is a DATA-row index (0 = the first row under the
 * header), so the insertion point in the line array is `after + 3`: past the
 * header, the delimiter, and the row being inserted after. -1 inserts first.
 */
export function insertRow(lines: string[], after: number): string[] {
  const width = tableWidth(lines);
  if (width === 0) return lines;
  const blank = rowOf([], width);
  const at = Math.min(Math.max(after + 3, 2), lines.length);
  const out = lines.slice();
  out.splice(at, 0, blank);
  return out;
}

/** Delete a data row. Refuses to remove the header or the delimiter row. */
export function deleteRow(lines: string[], index: number): string[] {
  if (index < 0 || index + 2 >= lines.length + 1) return lines;
  const at = index + 2;
  if (at < 2 || at >= lines.length) return lines;
  const out = lines.slice();
  out.splice(at, 1);
  return out;
}

/** Insert a column. `after` is a column index; -1 inserts the first column. */
export function insertColumn(lines: string[], after: number): string[] {
  const width = tableWidth(lines);
  if (width === 0) return lines;
  const at = Math.min(Math.max(after + 1, 0), width);
  return lines.map((line, i) => {
    const cells = cellsOf(line);
    // The delimiter row must gain a valid `---` cell, not an empty one.
    const fill = i === 1 ? "---" : "  ";
    cells.splice(at, 0, fill);
    return rowOf(cells, cells.length);
  });
}

/** Delete a column. Refuses to remove the last remaining column. */
export function deleteColumn(lines: string[], index: number): string[] {
  const width = tableWidth(lines);
  if (width <= 1 || index < 0 || index >= width) return lines;
  return lines.map(line => {
    const cells = cellsOf(line);
    cells.splice(index, 1);
    return rowOf(cells, cells.length);
  });
}

/** A fresh 2-column, 2-row table (header + one blank data row). */
export function makeTable(width = 2, rows = 1): string[] {
  const head = rowOf(Array.from({ length: width }, (_, i) => `列 ${i + 1}`), width);
  const delim = rowOf(Array.from({ length: width }, () => "---"), width);
  const body = Array.from({ length: rows }, () => rowOf([], width, ""));
  return [head, delim, ...body];
}
