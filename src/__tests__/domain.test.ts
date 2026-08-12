import { describe, it, expect } from 'vitest';
import {
  parseHeadings,
  displayableHeadings,
  computeWordCount,
  estimateReadingTime,
  parentDir,
  fileName,
  isWithinWorkspace,
  noteName,
} from '../domain';

describe('parseHeadings', () => {
  it('extracts ATX headings with level and line index', () => {
    expect(parseHeadings('# Title\nbody\n## Sub\n### Deep')).toEqual([
      { level: 1, text: 'Title', pos: 0 },
      { level: 2, text: 'Sub', pos: 2 },
      { level: 3, text: 'Deep', pos: 3 },
    ]);
  });

  it('supports up to six hash levels', () => {
    const markdown = '# a\n## b\n### c\n#### d\n##### e\n###### f';
    expect(parseHeadings(markdown).map(h => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ignores non-heading lines and malformed ATX headings', () => {
    expect(parseHeadings('#no-space\n####### seven\ntext\n')).toEqual([]);
  });

  it('uses the physical line index for CRLF input', () => {
    expect(parseHeadings('before\r\n# Heading\r\n')).toEqual([
      { level: 1, text: 'Heading', pos: 1 },
    ]);
  });
});

describe('displayableHeadings', () => {
  it('keeps only h1-h3 and preserves original indices', () => {
    const headings = parseHeadings('# A\n## B\n### C\n#### D\n##### E\n###### F');
    const displayed = displayableHeadings(headings);
    expect(displayed.map(h => h.text)).toEqual(['A', 'B', 'C']);
    expect(displayed.map(h => h.originalIdx)).toEqual([0, 1, 2]);
  });

  it('returns an empty list when there are no displayable headings', () => {
    expect(displayableHeadings(parseHeadings('#### only deep'))).toEqual([]);
  });
});

describe('computeWordCount', () => {
  it('counts CJK characters and latin words separately', () => {
    const result = computeWordCount('\u4f60\u597d world foo');
    expect(result).toMatchObject({
      chineseChars: 2,
      englishWords: 2,
      totalWords: 4,
      lineCount: 1,
    });
    expect(result.totalChars).toBe('\u4f60\u597d world foo'.length);
  });

  it('handles empty and whitespace-only content', () => {
    expect(computeWordCount('')).toMatchObject({
      chineseChars: 0,
      englishWords: 0,
      totalWords: 0,
      totalChars: 0,
      lineCount: 0,
    });
    expect(computeWordCount('   \n  ')).toMatchObject({
      chineseChars: 0,
      englishWords: 0,
      totalWords: 0,
      lineCount: 2,
    });
  });

  it('counts CJK Extension A characters', () => {
    // U+3400..U+4DBF is included by the implementation.
    expect(computeWordCount('\u3400\u4dbf').chineseChars).toBe(2);
  });
});

describe('estimateReadingTime', () => {
  it('returns 0 for empty content and at least 1 for any words', () => {
    expect(estimateReadingTime('')).toBe(0);
    expect(estimateReadingTime('a')).toBe(1);
  });

  it('rounds up to the nearest minute', () => {
    expect(estimateReadingTime('word '.repeat(401))).toBe(2);
    expect(estimateReadingTime('word '.repeat(400))).toBe(1);
  });
});

describe('filesystem helpers', () => {
  describe('parentDir', () => {
    it('extracts the parent directory from windows and posix paths', () => {
      expect(parentDir('C:\\notes\\note.md')).toBe('C:\\notes');
      expect(parentDir('/notes/note.md')).toBe('/notes');
    });

    it('returns an empty string for a bare file name', () => {
      expect(parentDir('note.md')).toBe('');
    });
  });

  describe('fileName', () => {
    it('returns the last path segment', () => {
      expect(fileName('C:\\notes\\note.md')).toBe('note.md');
      expect(fileName('/notes/note.md')).toBe('note.md');
      expect(fileName('note.md')).toBe('note.md');
    });
  });

  describe('isWithinWorkspace', () => {
    it('accepts the workspace itself and nested paths', () => {
      expect(isWithinWorkspace('C:\\ws', 'C:\\ws')).toBe(true);
      expect(isWithinWorkspace('C:\\ws\\note.md', 'C:\\ws')).toBe(true);
      expect(isWithinWorkspace('C:\\ws\\sub\\note.md', 'C:\\ws')).toBe(true);
      expect(isWithinWorkspace('/ws/note.md', '/ws')).toBe(true);
    });

    it('rejects paths outside the workspace and a null workspace', () => {
      expect(isWithinWorkspace('C:\\ws2\\note.md', 'C:\\ws')).toBe(false);
      expect(isWithinWorkspace('C:\\other', 'C:\\ws')).toBe(false);
      expect(isWithinWorkspace('C:\\ws', null)).toBe(false);
    });
  });

  describe('noteName', () => {
    it('strips the .md extension case-insensitively', () => {
      expect(noteName('C:\\notes\\README.md')).toBe('README');
      expect(noteName('C:\\notes\\README.MD')).toBe('README');
      expect(noteName('C:\\notes\\no-extension')).toBe('no-extension');
    });

    it('falls back to Note for an empty file name', () => {
      expect(noteName('')).toBe('Note');
    });
  });
});
