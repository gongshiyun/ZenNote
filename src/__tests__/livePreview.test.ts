import { describe, expect, it } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { GFM } from '@lezer/markdown';
import {
  findMath,
  frontmatterRange,
  inlineSegments,
  parseAlign,
  parseTable,
  splitTableRow,
} from '../components/editor/livepreview/livePreview';
import { Highlight } from '../components/editor/livepreview/markdownExtensions';

// These are the pure decision functions behind Live Preview. Getting a range
// boundary wrong either eats the user's text or leaves stray syntax on the
// page, so every construct is pinned here rather than eyeballed in the browser.

const doc = (text: string) =>
  EditorState.create({
    doc: text,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM, Highlight] })],
  }).doc;

// ---------------------------------------------------------------------------
// frontmatter
// ---------------------------------------------------------------------------

describe('live preview — frontmatter detection', () => {
  it('detects a document-leading block', () => {
    expect(frontmatterRange(doc('---\ntitle: x\n---\n\nbody'))).toEqual({ from: 0, to: 16 });
  });

  it('accepts the "..." terminator', () => {
    expect(frontmatterRange(doc('---\ntitle: x\n...\n\nbody'))?.to).toBe(16);
  });

  it('ignores a leading rule followed by prose', () => {
    // The critical case: treating this as frontmatter would hide real content.
    expect(frontmatterRange(doc('---\n\njust prose'))).toBeNull();
  });

  it('ignores a document that does not start with ---', () => {
    expect(frontmatterRange(doc('hello\n---\nx\n---'))).toBeNull();
  });

  it('requires a closing delimiter', () => {
    expect(frontmatterRange(doc('---\ntitle: x\nstill open'))).toBeNull();
  });

  it('requires at least three lines', () => {
    expect(frontmatterRange(doc('---\n---'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// math
// ---------------------------------------------------------------------------

describe('live preview — math scanning', () => {
  const math = (text: string) => findMath(doc(text));

  it('finds display math spanning lines', () => {
    const found = math('before\n\n$$\nx^2 + y^2\n$$\n\nafter');
    expect(found).toHaveLength(1);
    expect(found[0].display).toBe(true);
    expect(found[0].source).toBe('x^2 + y^2');
  });

  it('finds inline math', () => {
    const found = math('energy is $E = mc^2$ roughly');
    expect(found).toHaveLength(1);
    expect(found[0].display).toBe(false);
    expect(found[0].source).toBe('E = mc^2');
  });

  it('finds several inline formulas on one line', () => {
    const found = math('$a$ and $b$ and $c$');
    expect(found.map((f) => f.source)).toEqual(['a', 'b', 'c']);
  });

  it('ignores an unclosed dollar', () => {
    expect(math('costs $5 and up')).toEqual([]);
  });

  it('ignores currency with a space after the dollar', () => {
    expect(math('pay $ 5 now')).toEqual([]);
  });

  it('ignores an empty pair', () => {
    expect(math('a $$ b')).toEqual([]);
  });

  it('does not treat a display block as inline math', () => {
    const found = math('$$\nz\n$$');
    expect(found).toHaveLength(1);
    expect(found[0].display).toBe(true);
  });

  it('leaves display math open when never closed', () => {
    expect(math('$$\nnever closed')).toEqual([]);
  });

  it('handles escaped dollars', () => {
    expect(math('price \\$5 and \\$6')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// tables
// ---------------------------------------------------------------------------

describe('live preview — table parsing', () => {
  it('splits a row on pipes and trims cells', () => {
    expect(splitTableRow('| a | b |')).toEqual(['a', 'b']);
    expect(splitTableRow('a | b')).toEqual(['a', 'b']);
    expect(splitTableRow('| a | b')).toEqual(['a', 'b']);
  });

  it('keeps an escaped pipe inside a cell', () => {
    expect(splitTableRow('| a \\| b | c |')).toEqual(['a | b', 'c']);
  });

  it('reads alignment from the delimiter row', () => {
    expect(parseAlign('---')).toBeNull();
    expect(parseAlign(':---')).toBe('left');
    expect(parseAlign('---:')).toBe('right');
    expect(parseAlign(':---:')).toBe('center');
  });

  it('parses a full table', () => {
    const parsed = parseTable(['| a | b |', '| --- | ---: |', '| 1 | 2 |', '| 3 | 4 |']);
    expect(parsed).not.toBeNull();
    expect(parsed!.header.flat().map((s) => s.text)).toEqual(['a', 'b']);
    expect(parsed!.rows).toHaveLength(2);
    expect(parsed!.aligns).toEqual([null, 'right']);
  });

  it('rejects a pipe block whose second row is not a delimiter', () => {
    expect(parseTable(['| a | b |', '| 1 | 2 |'])).toBeNull();
  });

  it('rejects a single-line block', () => {
    expect(parseTable(['| a | b |'])).toBeNull();
  });
});

describe('live preview — table cell inline marks', () => {
  it('passes plain text through as one segment', () => {
    expect(inlineSegments('plain')).toEqual([{ text: 'plain', mark: null }]);
  });

  it('extracts bold', () => {
    expect(inlineSegments('a **b** c')).toEqual([
      { text: 'a ', mark: null },
      { text: 'b', mark: 'strong' },
      { text: ' c', mark: null },
    ]);
  });

  it('extracts italic, code, strike and highlight', () => {
    expect(inlineSegments('*i*')[0]).toEqual({ text: 'i', mark: 'em' });
    expect(inlineSegments('`c`')[0]).toEqual({ text: 'c', mark: 'code' });
    expect(inlineSegments('~~s~~')[0]).toEqual({ text: 's', mark: 'strike' });
    expect(inlineSegments('==h==')[0]).toEqual({ text: 'h', mark: 'mark' });
  });

  it('prefers strong over emphasis for a double marker', () => {
    const segs = inlineSegments('**bold**');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ text: 'bold', mark: 'strong' });
  });
});

// ---------------------------------------------------------------------------
// grammar integration
//
// These pin the parser behaviour the decoration layer relies on. They are the
// regression guard for the bug that motivated moving off regexes: a `#` inside
// a fenced code block must never be treated as a heading.
// ---------------------------------------------------------------------------

describe('live preview — grammar guarantees the decorator depends on', () => {
  const nodeNamesAt = (text: string, lineNumber: number): string[] => {
    const state = EditorState.create({
      doc: text,
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM, Highlight] })],
    });
    const line = state.doc.line(lineNumber);
    const names: string[] = [];
    syntaxTree(state).iterate({
      from: line.from,
      to: line.to,
      enter: (n) => { names.push(n.name); },
    });
    return names;
  };

  it('parses headings as ATXHeading with a HeaderMark', () => {
    const names = nodeNamesAt('# H1', 1);
    expect(names).toContain('ATXHeading1');
    expect(names).toContain('HeaderMark');
  });

  it('does NOT parse a hash inside a fenced block as a heading', () => {
    // Regression: the first regex-based cut hid the `#` of this code comment.
    const names = nodeNamesAt('```ts\n# not a heading\n```', 2);
    expect(names).toContain('CodeText');
    expect(names).not.toContain('ATXHeading1');
    expect(names).not.toContain('HeaderMark');
  });

  it('parses inline code, strong and emphasis with their mark nodes', () => {
    expect(nodeNamesAt('`c` **b** *i*', 1)).toEqual(
      expect.arrayContaining(['InlineCode', 'CodeMark', 'StrongEmphasis', 'EmphasisMark']),
    );
  });

  it('parses the custom Highlight extension', () => {
    const names = nodeNamesAt('==hi==', 1);
    expect(names).toContain('Highlight');
    expect(names).toContain('HighlightMark');
  });

  it('does not parse === as a highlight', () => {
    const names = nodeNamesAt('===x===', 1);
    expect(names).not.toContain('HighlightMark');
  });

  it('parses GFM tables', () => {
    expect(nodeNamesAt('| a |\n| --- |\n| 1 |', 1)).toContain('Table');
  });

  it('parses images and links with LinkMark children', () => {
    expect(nodeNamesAt('![alt](a.png)', 1)).toEqual(
      expect.arrayContaining(['Image', 'LinkMark', 'URL']),
    );
    expect(nodeNamesAt('[t](u)', 1)).toEqual(
      expect.arrayContaining(['Link', 'LinkMark', 'URL']),
    );
  });

  it('parses task list markers', () => {
    expect(nodeNamesAt('- [x] done', 1)).toEqual(
      expect.arrayContaining(['Task', 'TaskMarker']),
    );
  });
});
