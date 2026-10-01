import { describe, expect, it } from 'vitest';
import {
  findFootnoteRefs,
  footnoteNumbers,
  parseFootnoteDefLine,
  scanFootnotes,
  type FootnoteScan,
} from '../components/editor/livepreview/footnotes';

// Footnote scanning is the whole feature's correctness surface: a wrong range
// either hides part of the user's sentence or leaves a stray `[^1]` on screen.

const docOf = (text: string) => {
  const lines = text.split('\n');
  let offset = 0;
  const starts = lines.map(l => {
    const s = offset;
    offset += l.length + 1;
    return s;
  });
  return {
    lines: lines.length,
    line: (n: number) => ({
      number: n,
      from: starts[n - 1],
      to: starts[n - 1] + lines[n - 1].length,
      text: lines[n - 1],
    }),
  };
};

describe('live preview — footnote definition lines', () => {
  it('parses a definition and locates the body', () => {
    const d = parseFootnoteDefLine('[^1]: the body', 0);
    // The marker includes its trailing space, so hiding it does not leave a gap
    // before the body — the same rule the heading marker uses.
    expect(d).toEqual({ id: '1', markFrom: 0, markTo: 6, bodyFrom: 6, bodyTo: 14 });
  });

  it('accepts indentation and keeps it out of the marker', () => {
    const d = parseFootnoteDefLine('   [^a]: b', 100);
    expect(d?.markFrom).toBe(103);
    expect(d?.id).toBe('a');
  });

  it('accepts a named id', () => {
    expect(parseFootnoteDefLine('[^note-1]: x', 0)?.id).toBe('note-1');
  });

  it('rejects a reference (no colon)', () => {
    expect(parseFootnoteDefLine('[^1] text', 0)).toBeNull();
  });

  it('rejects a definition that is not at the line start', () => {
    expect(parseFootnoteDefLine('see [^1]: no', 0)).toBeNull();
  });

  it('rejects an id containing whitespace', () => {
    expect(parseFootnoteDefLine('[^a b]: x', 0)).toBeNull();
  });

  it('handles an empty body', () => {
    const d = parseFootnoteDefLine('[^1]:', 0);
    expect(d?.bodyFrom).toBe(d?.bodyTo);
  });
});

describe('live preview — footnote references', () => {
  it('finds a reference', () => {
    expect(findFootnoteRefs('text[^1] more')).toEqual([{ id: '1', from: 4, to: 8 }]);
  });

  it('finds several', () => {
    const refs = findFootnoteRefs('a[^1] b[^two]');
    expect(refs.map(r => r.id)).toEqual(['1', 'two']);
  });

  it('skips a definition marker', () => {
    // The trailing colon is what distinguishes the two forms.
    expect(findFootnoteRefs('[^1]: body')).toEqual([]);
  });

  it('ignores an empty id', () => {
    expect(findFootnoteRefs('a[^] b')).toEqual([]);
  });

  it('ignores a plain link', () => {
    expect(findFootnoteRefs('[text](url)')).toEqual([]);
  });

  it('ignores an ordinary bracket', () => {
    expect(findFootnoteRefs('[note]')).toEqual([]);
  });
});

describe('live preview — document scan', () => {
  const DOC = [
    'Intro[^1] and again[^1].',   // 0
    '',                            // 1
    '[^1]: first body',            // 2
    '[^b]: second body',           // 3
    '',                            // 4
    'Tail[^b] end.',               // 5
  ].join('\n');

  it('collects definitions and references with absolute offsets', () => {
    const scan = scanFootnotes(docOf(DOC));
    expect(scan.defs.map(d => d.id)).toEqual(['1', 'b']);
    expect(scan.refs.map(r => r.id)).toEqual(['1', '1', 'b']);
    // Offsets must land on the real text.
    expect(DOC.slice(scan.refs[0].from, scan.refs[0].to)).toBe('[^1]');
    expect(DOC.slice(scan.defs[0].markFrom, scan.defs[0].markTo)).toBe('[^1]: ');
  });

  it('skips ranges inside fenced code', () => {
    // A `[^1]` in a code sample is data, not a footnote.
    const codeStart = DOC.indexOf('Intro');
    const scan = scanFootnotes(docOf(DOC), [{ from: 0, to: codeStart + 5 }]);
    expect(scan.refs.some(r => r.from < codeStart + 5)).toBe(false);
  });

  it('indexes definitions by id, first one winning', () => {
    const dup = '[^1]: a\n[^1]: b\n';
    const scan = scanFootnotes(docOf(dup));
    expect(scan.byId.get('1')?.markFrom).toBe(0);
  });
});

describe('live preview — footnote numbering', () => {
  const make = (defs: string[], refs: string[]): FootnoteScan => ({
    defs: defs.map((id, i) => ({
      id, markFrom: i, markTo: i + 1, bodyFrom: i + 1, bodyTo: i + 2,
    })),
    refs: refs.map((id, i) => ({ id, from: i, to: i + 1 })),
    byId: new Map(),
  });

  it('numbers by definition order, not by id', () => {
    // `[^note]` defined first must render as 1 even though its id is not "1".
    const nums = footnoteNumbers(make(['note', '1'], ['1', 'note']));
    expect(nums.get('note')).toBe(1);
    expect(nums.get('1')).toBe(2);
  });

  it('gives a dangling reference a number instead of a blank', () => {
    const nums = footnoteNumbers(make(['a'], ['a', 'missing']));
    expect(nums.get('missing')).toBe(2);
  });

  it('starts at 1', () => {
    expect(footnoteNumbers(make(['x'], ['x'])).get('x')).toBe(1);
  });
});
