import { describe, expect, it } from 'vitest';
import { livePreviewThemeSpec } from '../components/editor/livepreview/livePreviewTheme';

// Style invariants for the Live Preview editor.
//
// Every block widget CodeMirror places (table, Mermaid, image, math, TOC,
// frontmatter) must NOT carry a vertical margin. CodeMirror measures a block
// widget's height with getBoundingClientRect(), which excludes margins, so a
// vertical margin makes the recorded height smaller than the space actually
// consumed. The error accumulates: every line below the widget then hit-tests
// one line off, so clicks land on the wrong line and text below a diagram
// cannot be selected.
//
// This shipped once and took a long time to diagnose, so it is pinned here.

const BLOCK_WIDGET_ROOTS = [
  '.cm-zn-table-wrap',
  '.cm-zn-mermaid',
  '.cm-zn-image',
  '.cm-zn-math-display',
  '.cm-zn-html-block',
  '.cm-zn-frontmatter',
  '.cm-zn-toc',
];

/** Anything that consumes vertical space outside the element's own box. */
function verticalMargins(style: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ['margin', 'marginTop', 'marginBottom']) {
    const value = style[key];
    if (typeof value !== 'string') continue;
    if (value === '0' || value === '0px' || value === '0 0') continue;
    out.push(`${key}: ${value}`);
  }
  return out;
}

describe('live preview theme — block widget geometry', () => {
  it('exposes the block-widget roots the rule applies to', () => {
    // If a root is renamed or removed, this catches the drift in the test
    // itself rather than silently stopping to guard anything.
    for (const sel of BLOCK_WIDGET_ROOTS) {
      expect(livePreviewThemeSpec, `missing selector ${sel}`).toHaveProperty(sel);
    }
  });

  it.each(BLOCK_WIDGET_ROOTS)('%s carries no vertical margin', sel => {
    const style = livePreviewThemeSpec[sel] as Record<string, unknown>;
    expect(verticalMargins(style)).toEqual([]);
  });

  it('proves the assertion can fail (control)', () => {
    // Guards against verticalMargins() silently always returning [].
    expect(verticalMargins({ margin: '0.5em 0' })).toEqual(['margin: 0.5em 0']);
    expect(verticalMargins({ marginTop: '8px' })).toEqual(['marginTop: 8px']);
    expect(verticalMargins({ margin: '0' })).toEqual([]);
    expect(verticalMargins({ padding: '0.5em 0' })).toEqual([]);
  });
});

describe('live preview theme — line class contract', () => {
  it('defines the three fence line classes the code box needs', () => {
    // The box is drawn from open/body/close line classes because fence lines are
    // siblings of every other line, so :first-child cannot identify them.
    for (const cls of ['.cm-zn-fence-open', '.cm-zn-fence-body', '.cm-zn-fence-close']) {
      expect(livePreviewThemeSpec, `missing ${cls}`).toHaveProperty(cls);
    }
  });

  it('defines full-contrast variants for selected text', () => {
    // Without these, dim colours sit at ~2-3:1 against a selection background.
    for (const cls of [
      '.cm-zn-mark-on',
      '.cm-zn-inline-link-on',
      '.cm-zn-inline-code-on',
      '.cm-zn-quote-on',
      '.cm-zn-footnote-def-on',
    ]) {
      expect(livePreviewThemeSpec, `missing ${cls}`).toHaveProperty(cls);
    }
  });
});
