import { describe, it, expect } from 'vitest';
import {
  escapeRegExp,
  buildFindRegex,
  findAllMatches,
  wrapIndex,
  isHttpUrl,
  defaultFindOptions,
} from '../lib/findQuery';

const ci = { ...defaultFindOptions }; // case-insensitive, literal
const cs = { ...defaultFindOptions, caseSensitive: true };
const ww = { ...defaultFindOptions, wholeWord: true };
const rx = { ...defaultFindOptions, regex: true };

describe('escapeRegExp', () => {
  it('escapes all regex metacharacters', () => {
    expect(escapeRegExp('a.b*c+d?e^f$g(h)i|j[k]l\\')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\(h\\)i\\|j\\[k\\]l\\\\',
    );
  });
});

describe('buildFindRegex', () => {
  it('returns null for empty query', () => {
    expect(buildFindRegex('', ci)).toBeNull();
  });

  it('is case-insensitive by default', () => {
    const re = buildFindRegex('hello', ci)!;
    expect(re.test('HELLO world')).toBe(true);
  });

  it('respects caseSensitive', () => {
    const re = buildFindRegex('hello', cs)!;
    expect(re.test('HELLO world')).toBe(false);
    expect(buildFindRegex('Hello', cs)!.test('say Hello')).toBe(true);
  });

  it('treats metacharacters literally in non-regex mode', () => {
    const matches = findAllMatches('a.b and aXb', 'a.b', ci);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 0, to: 3 });
  });

  it('returns null for invalid regex in regex mode', () => {
    expect(buildFindRegex('(unclosed', rx)).toBeNull();
    expect(buildFindRegex('[a-', rx)).toBeNull();
  });

  it('accepts valid regex in regex mode', () => {
    const matches = findAllMatches('foo123 bar45', '\\d+', rx);
    expect(matches).toEqual([
      { from: 3, to: 6 },
      { from: 10, to: 12 },
    ]);
  });
});

describe('findAllMatches — whole word', () => {
  it('matches isolated words only', () => {
    const matches = findAllMatches('cat concat acat a cat', 'cat', ww);
    expect(matches.map(m => [m.from, m.to])).toEqual([
      [0, 3],
      [18, 21],
    ]);
  });

  it('does not match inside identifiers (underscore counts as word char)', () => {
    expect(findAllMatches('my_cat_x cat', 'cat', ww)).toHaveLength(1);
  });

  it('handles CJK boundaries (adjacent CJK chars block whole-word matches)', () => {
    // "猫" surrounded by CJK letters is not a whole word; standalone is.
    expect(findAllMatches('黑猫警长', '猫', ww)).toHaveLength(0);
    expect(findAllMatches('这只 猫 很可爱', '猫', ww)).toHaveLength(1);
  });
});

describe('findAllMatches — general behavior', () => {
  it('returns [] for empty text or query', () => {
    expect(findAllMatches('', 'x', ci)).toEqual([]);
    expect(findAllMatches('text', '', ci)).toEqual([]);
  });

  it('finds overlapping-free consecutive matches', () => {
    const matches = findAllMatches('aaa', 'aa', ci);
    expect(matches).toEqual([{ from: 0, to: 2 }]);
  });

  it('skips zero-length regex matches without looping', () => {
    const matches = findAllMatches('abc', 'x*', rx);
    // x* matches empty between chars; all zero-length → skipped
    expect(matches).toEqual([]);
  });

  it('is case-insensitive for latin mixes', () => {
    const matches = findAllMatches('TypeScript X typescript', 'typescript', ci);
    expect(matches).toHaveLength(2);
  });
});

describe('wrapIndex', () => {
  it('wraps around both directions', () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-4, 3)).toBe(2);
  });

  it('returns 0 for empty ranges', () => {
    expect(wrapIndex(5, 0)).toBe(0);
  });
});

describe('isHttpUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isHttpUrl('https://example.com/a?b=1')).toBe(true);
    expect(isHttpUrl('http://x.y')).toBe(true);
  });

  it('rejects non-URL text', () => {
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('https://a b')).toBe(false);
  });
});
