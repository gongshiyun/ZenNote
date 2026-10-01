import { describe, expect, it } from 'vitest';
import {
  cellsOf,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  makeTable,
  parseImageAlt,
  rowOf,
  tableWidth,
  withImageAlign,
} from '../components/editor/livepreview/renderedBlockHelpers';

// Pure index arithmetic for the parity features. Every off-by-one here shows up
// as a corrupted table in the user's note, so each boundary is pinned.

describe('live preview — image alt encoding', () => {
  it('parses the "ratio|align" form', () => {
    expect(parseImageAlt('1.00|left')).toEqual({ ratio: '1.00', align: 'left' });
    expect(parseImageAlt('0.50|right')).toEqual({ ratio: '0.50', align: 'right' });
  });

  it('treats a bare ratio as legacy centre', () => {
    expect(parseImageAlt('1.00')).toEqual({ ratio: '1.00', align: 'center' });
  });

  it('falls back to centre for an empty or unknown align', () => {
    expect(parseImageAlt('').align).toBe('center');
    expect(parseImageAlt('1.00|sideways').align).toBe('center');
  });

  it('never throws on arbitrary author alt text', () => {
    expect(parseImageAlt('a photo of my cat').align).toBe('center');
    expect(parseImageAlt('a photo of my cat').ratio).toBe('1.00');
  });

  it('round-trips an alignment while preserving the ratio', () => {
    expect(withImageAlign('0.75|center', 'left')).toBe('0.75|left');
    expect(withImageAlign('1.00', 'right')).toBe('1.00|right');
  });

  it('resets a zero or NaN ratio to 1.00', () => {
    expect(parseImageAlt('0|left').ratio).toBe('1.00');
    expect(parseImageAlt('abc|left').ratio).toBe('1.00');
  });
});

describe('live preview — table cell splitting', () => {
  it('splits a padded row', () => {
    expect(cellsOf('| a | b |')).toEqual(['a', 'b']);
  });

  it('accepts unpadded rows', () => {
    expect(cellsOf('a | b')).toEqual(['a', 'b']);
  });

  it('keeps an escaped pipe', () => {
    expect(cellsOf('| a \\| b | c |')).toEqual(['a | b', 'c']);
  });

  it('preserves empty cells', () => {
    expect(cellsOf('|  |  |')).toEqual(['', '']);
  });

  it('rebuilds a row to an exact width', () => {
    expect(rowOf(['a'], 2)).toBe('| a |  |');
    expect(rowOf(['a', 'b', 'c'], 2)).toBe('| a | b |');
    expect(rowOf([], 2, '---')).toBe('| --- | --- |');
  });

  it('round-trips through cellsOf/rowOf', () => {
    const line = '| a | b |';
    expect(rowOf(cellsOf(line), 2)).toBe(line);
  });
});

describe('live preview — table row editing', () => {
  const table = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'];

  it('inserts a row below the given data row', () => {
    const out = insertRow(table, 0);
    expect(out).toHaveLength(5);
    expect(cellsOf(out[3])).toEqual(['', '']);
    // The original rows are shifted, not overwritten.
    expect(cellsOf(out[4])).toEqual(['3', '4']);
  });

  it('inserts the first row when after = -1', () => {
    expect(cellsOf(insertRow(table, -1)[2])).toEqual(['', '']);
  });

  it('never inserts above the header', () => {
    const out = insertRow(table, -99);
    expect(out[0]).toBe('| a | b |');
    expect(out[1]).toBe('| --- | --- |');
  });

  it('appends when the index is past the end', () => {
    expect(insertRow(table, 99)).toHaveLength(5);
  });

  it('deletes a data row', () => {
    expect(deleteRow(table, 0)).toEqual(['| a | b |', '| --- | --- |', '| 3 | 4 |']);
  });

  it('refuses to delete past the end', () => {
    expect(deleteRow(table, 9)).toEqual(table);
    expect(deleteRow(table, -1)).toEqual(table);
  });
});

describe('live preview — table column editing', () => {
  const table = ['| a | b |', '| --- | --- |', '| 1 | 2 |'];

  it('reports the column count', () => {
    expect(tableWidth(table)).toBe(2);
    expect(tableWidth(['| a |'])).toBe(0);
  });

  it('inserts a column with a valid delimiter cell', () => {
    const out = insertColumn(table, 0);
    expect(cellsOf(out[0])).toHaveLength(3);
    // The delimiter must stay a delimiter, or the table stops parsing.
    expect(cellsOf(out[1])).toEqual(['---', '---', '---']);
    expect(cellsOf(out[2])).toEqual(['1', '', '2']);
  });

  it('inserts the first column when after = -1', () => {
    expect(cellsOf(insertColumn(table, -1)[0])).toEqual(['', 'a', 'b']);
  });

  it('deletes a column from every row', () => {
    const out = deleteColumn(table, 0);
    expect(cellsOf(out[0])).toEqual(['b']);
    expect(cellsOf(out[1])).toEqual(['---']);
    expect(cellsOf(out[2])).toEqual(['2']);
  });

  it('refuses to delete the last remaining column', () => {
    const single = ['| a |', '| --- |', '| 1 |'];
    expect(deleteColumn(single, 0)).toEqual(single);
  });

  it('refuses an out-of-range column', () => {
    expect(deleteColumn(table, 5)).toEqual(table);
    expect(deleteColumn(table, -1)).toEqual(table);
  });

  it('produces a table that still parses after any edit', () => {
    // The delimiter row is what makes a pipe block a table; if an edit breaks
    // it the whole block degrades to plain text.
    const variants = [
      insertRow(table, 0),
      insertColumn(table, 1),
      deleteColumn(table, 1),
    ];
    for (const v of variants) {
      expect(v[1]).toMatch(/^\|(\s*:?-{1,}:?\s*\|)+$/);
      expect(new Set(v.map(r => cellsOf(r).length)).size).toBe(1);
    }
  });
});

describe('live preview — new table generation', () => {
  it('emits a valid, parseable table', () => {
    const t = makeTable(2, 1);
    expect(t).toHaveLength(3);
    expect(tableWidth(t)).toBe(2);
    expect(t[1]).toMatch(/^\|(\s*:?-{1,}:?\s*\|)+$/);
  });

  it('supports other widths', () => {
    const t = makeTable(4, 2);
    expect(tableWidth(t)).toBe(4);
    expect(t).toHaveLength(4);
  });
});
