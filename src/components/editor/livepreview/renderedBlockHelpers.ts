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

/* -------------------------------------------------------------- table selection */

/** A cell address. Data rows are 0-based; the header row is -1. */
export interface CellPos {
  row: number;
  col: number;
}

/** A rectangular cell range, normalised so r1 <= r2 and c1 <= c2. */
export interface CellRect {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** The rectangle two drag corners span. */
export function cellRectOf(a: CellPos, b: CellPos): CellRect {
  return {
    r1: Math.min(a.row, b.row),
    c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row),
    c2: Math.max(a.col, b.col),
  };
}

/** Whether a cell lies inside a rectangle. */
export function rectContains(rect: CellRect, row: number, col: number): boolean {
  return row >= rect.r1 && row <= rect.r2 && col >= rect.c1 && col <= rect.c2;
}

/**
 * Delete every data row in `[from, to]`. The header is never removable, so the
 * range is clamped to data rows; deletion runs bottom-up so the earlier indices
 * stay valid.
 */
export function deleteRowRange(lines: string[], from: number, to: number): string[] {
  let out = lines;
  for (let i = Math.min(to, lines.length - 3); i >= Math.max(from, 0); i--) {
    out = deleteRow(out, i);
  }
  return out;
}

/**
 * Delete every column in `[from, to]`, right to left so the remaining indices
 * stay valid. `deleteColumn` refuses the last column, so a range covering the
 * whole table keeps one — the same rule as the single-column gesture.
 */
export function deleteColumnRange(lines: string[], from: number, to: number): string[] {
  let out = lines;
  for (let i = Math.min(to, tableWidth(lines) - 1); i >= Math.max(from, 0); i--) {
    out = deleteColumn(out, i);
  }
  return out;
}

/**
 * The selected cells as TSV — the format a spreadsheet reads from the
 * clipboard. The header row is included when the selection covers it.
 */
export function cellsToTsv(lines: string[], rect: CellRect): string {
  const width = tableWidth(lines);
  if (width === 0) return "";
  const c1 = Math.max(rect.c1, 0);
  const c2 = Math.min(rect.c2, width - 1);
  const r1 = Math.max(rect.r1, -1);
  const r2 = Math.min(rect.r2, lines.length - 3);
  if (c1 > c2 || r1 > r2) return "";
  const rows: string[] = [];
  for (let r = r1; r <= r2; r++) {
    rows.push(cellsOf(lines[r < 0 ? 0 : r + 2]).slice(c1, c2 + 1).join("\t"));
  }
  return rows.join("\n");
}
