import { describe, it, expect } from 'vitest';
import { generateExportHtml } from '../lib/exportNote';

// The export body is rendered from the markdown, not taken from the editor.
//
// CodeMirror renders only its viewport, so the editor's DOM holds about one
// screenful of the note; an export taken from it lost everything below the fold.
// These tests exercise the document assembly around the renderer; the renderer's
// own behaviour (which needs neither a browser nor KaTeX) is covered in
// markdownToHtml.test.ts.

describe('generateExportHtml', () => {
  it('produces a standalone document with the note rendered', async () => {
    const html = await generateExportHtml('# 标题\n\n一段话');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>export</title>');
    expect(html).toContain('<h1 id="h-1-标题">标题</h1>');
    expect(html).toContain('<p>一段话</p>');
    // Rendered, not escaped: the old fallback turned markdown into plain text.
    expect(html).not.toContain('&lt;h1');
  });

  it('embeds the export stylesheet and the theme variables', async () => {
    const html = await generateExportHtml('# 标题');
    expect(html).toContain('<style>');
    expect(html).toContain(':root{');
    // The stylesheet is written for the export rather than copied from the app.
    expect(html).toContain('blockquote{');
    expect(html).not.toContain('ProseMirror');
    expect(html).not.toContain('milkdown');
  });

  it('renders a code fence as a plain pre/code block', async () => {
    const html = await generateExportHtml('```typescript\nconst x = 1;\n```');
    expect(html).toContain('<pre><code class="language-typescript">const x = 1;</code></pre>');
  });

  it('sanitizes raw HTML blocks', async () => {
    const html = await generateExportHtml('<div><img src="x" onerror="alert(1)"><script>bad()</script></div>');
    expect(html).toContain('zn-html-render');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script>');
  });

  it('includes the end of a long note', async () => {
    // The regression the renderer exists for: the editor's DOM held only the
    // visible screenful, so everything below it was dropped.
    const filler = Array.from({ length: 80 }, (_, i) => `## 段落 ${i}\n\n第 ${i} 段。`).join('\n\n');
    const html = await generateExportHtml(`${filler}\n\n## 末尾\n\n最后的文字。`);
    expect(html).toContain('段落 0');
    expect(html).toContain('段落 79');
    expect(html).toContain('最后的文字。');
  });
});
