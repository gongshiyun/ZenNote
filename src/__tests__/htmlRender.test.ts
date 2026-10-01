import { describe, expect, it } from 'vitest';
import { isBlockHtml, renderHtmlValue, renderInnerMarkdown } from '../lib/htmlRender';

// Shared by the Crepe editor and the Live Preview editor. The `<cite>` case is
// the one a user reported as not rendering at all in Live Preview, so it is
// pinned here to keep both editors honest.

describe('html rendering — block detection', () => {
  it('treats multiline HTML as a block', () => {
    expect(isBlockHtml('<cite>\nx\n</cite>')).toBe(true);
  });

  it('recognises block tag names', () => {
    for (const tag of ['div', 'p', 'h1', 'ul', 'table', 'cite', 'details', 'blockquote']) {
      expect(isBlockHtml(`<${tag}>x</${tag}>`)).toBe(true);
    }
  });

  it('treats a bare inline tag as inline', () => {
    expect(isBlockHtml('<kbd>x</kbd>')).toBe(false);
    expect(isBlockHtml('<mark>x</mark>')).toBe(false);
  });
});

describe('html rendering — inner markdown', () => {
  it('renders a list', () => {
    const html = renderInnerMarkdown('- 一\n- 二');
    expect(html).toBe('<ul><li>一</li><li>二</li></ul>');
  });

  it('renders links, bold, italic and code', () => {
    const html = renderInnerMarkdown('[a](b) **c** *d* `e`');
    expect(html).toContain('<a href="b">a</a>');
    expect(html).toContain('<strong>c</strong>');
    expect(html).toContain('<em>d</em>');
    expect(html).toContain('<code>e</code>');
  });

  it('escapes HTML in the source text', () => {
    // The inner pass escapes first, so a literal `<` cannot inject markup.
    expect(renderInnerMarkdown('a < b')).toContain('&lt;');
  });

  it('wraps loose lines in paragraphs', () => {
    expect(renderInnerMarkdown('x\ny')).toBe('<p>x</p><p>y</p>');
  });

  it('closes a list before a following paragraph', () => {
    expect(renderInnerMarkdown('- a\ntext')).toBe('<ul><li>a</li></ul><p>text</p>');
  });
});

describe('html rendering — the reported <cite> case', () => {
  const CITE = `<cite>
**本文档引用的文件**
- [index.ts](file://src/i18n/index.ts)
- [en-US.ts](file://src/i18n/en-US.ts)
- [zh-CN.ts](file://src/i18n/zh-CN.ts)
</cite>`;

  it('detects it as a block', () => {
    expect(isBlockHtml(CITE)).toBe(true);
  });

  it('keeps the <cite> wrapper and renders the inner markdown', () => {
    const html = renderHtmlValue(CITE);
    expect(html).toContain('<cite>');
    expect(html).toContain('</cite>');
    // The inner list must become real markup, not stay as literal dashes.
    expect(html).toContain('<ul>');
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it('renders the bold heading line', () => {
    expect(renderHtmlValue(CITE)).toContain('<strong>本文档引用的文件</strong>');
  });

  it('keeps the link text but strips file:// hrefs (DOMPurify default policy)', () => {
    // NOT a Live Preview regression: the sanitizer is shared with the Crepe
    // editor and DOMPurify's default ALLOWED_URI_REGEXP excludes `file:`. The
    // anchors survive with their text, so the line still reads correctly.
    const html = renderHtmlValue(CITE);
    expect(html.match(/<a[ >]/g)).toHaveLength(3);
    expect(html).toContain('>index.ts</a>');
    expect(html).not.toContain('file://src/i18n/index.ts');
  });

  it('keeps http links intact', () => {
    const html = renderHtmlValue('<cite>- [site](https://example.com)</cite>');
    expect(html).toContain('href="https://example.com"');
  });

  it('leaves nested HTML alone rather than double-processing it', () => {
    // A block containing real markup is sanitized, not markdown-rendered.
    const html = renderHtmlValue('<div class="n">a <b>c</b></div>');
    expect(html).toContain('<b>c</b>');
    expect(html).not.toContain('<strong>');
  });

  it('strips dangerous markup', () => {
    const html = renderHtmlValue('<div><script>alert(1)</script>x</div>');
    expect(html).not.toContain('<script');
  });

  it('drops event-handler attributes', () => {
    const html = renderHtmlValue('<div onclick="alert(1)">x</div>');
    expect(html).not.toContain('onclick');
  });
});
