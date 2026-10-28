import { describe, expect, it } from 'vitest';
import { displayableHeadings, parseHeadings } from '../domain';

// parseHeadings must agree with what the Live Preview editor actually renders
// (the lezer markdown grammar), because the outline and the `[TOC]` export both
// derive from it. These cases pin the parity rules: indentation, closing hash
// runs, block-quote headings, setext headings, and the code/frontmatter skips.

const levels = (md: string) => parseHeadings(md).map(h => [h.level, h.text, h.pos]);

describe('parseHeadings — ATX parity', () => {
  it('accepts up to three spaces of indentation (CommonMark)', () => {
    expect(levels('  # Indented')).toEqual([[1, 'Indented', 0]]);
    expect(levels('   ## Three')).toEqual([[2, 'Three', 0]]);
  });

  it('rejects four-space-indented lines (indented code block)', () => {
    expect(parseHeadings('    # code')).toEqual([]);
  });

  it('strips a closing hash run from the visible text', () => {
    expect(levels('## Closed ##')).toEqual([[2, 'Closed', 0]]);
    expect(levels('# Title ###  ')).toEqual([[1, 'Title', 0]]);
  });

  it('lists headings inside block quotes', () => {
    expect(levels('> # Quoted')).toEqual([[1, 'Quoted', 0]]);
    expect(levels('>> ## Nested')).toEqual([[2, 'Nested', 0]]);
    expect(levels('> text\n> ### In quote')).toEqual([[3, 'In quote', 1]]);
  });

  it('does not treat a hash after a list marker as a heading', () => {
    expect(parseHeadings('- # not a heading')).toEqual([]);
  });
});

describe('parseHeadings — setext parity', () => {
  it('reads a `===` underline as an H1 on the line above', () => {
    expect(levels('Title\n=====')).toEqual([[1, 'Title', 0]]);
    expect(levels('intro\n\nSub\n---')).toEqual([[2, 'Sub', 2]]);
  });

  it('does not turn a horizontal rule after a blank line into a heading', () => {
    expect(parseHeadings('text\n\n---')).toEqual([]);
    expect(parseHeadings('---')).toEqual([]);
  });

  it('does not turn a list underline into a heading', () => {
    expect(parseHeadings('- item\n---')).toEqual([]);
  });
});

describe('parseHeadings — skips', () => {
  it('skips YAML frontmatter and keeps physical line indices', () => {
    const md = '---\ntitle: x\n---\n# Real';
    expect(levels(md)).toEqual([[1, 'Real', 3]]);
  });

  it('treats a leading `---` followed by a blank line as a rule, not frontmatter', () => {
    expect(levels('---\n\n# Real')).toEqual([[1, 'Real', 2]]);
  });

  it('ignores heading-looking lines inside fenced code blocks', () => {
    const md = ['# Real', '```', '# no', '```', '## Real 2'].join('\n');
    expect(levels(md)).toEqual([
      [1, 'Real', 0],
      [2, 'Real 2', 4],
    ]);
  });

  it('keeps the physical line index for CRLF input', () => {
    expect(levels('before\r\n# Heading\r\n')).toEqual([[1, 'Heading', 1]]);
  });
});

describe('displayableHeadings', () => {
  it('keeps only h1-h3 while preserving source order', () => {
    const headings = parseHeadings('# A\n## B\n### C\n#### D\n##### E\n###### F');
    expect(displayableHeadings(headings).map(h => [h.level, h.text])).toEqual([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
  });

  it('returns nothing when only deep headings exist', () => {
    expect(displayableHeadings(parseHeadings('#### only deep'))).toEqual([]);
  });
});
