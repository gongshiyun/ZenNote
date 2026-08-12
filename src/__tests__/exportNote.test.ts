import { describe, it, expect, afterEach } from 'vitest';
import { generateExportHtml } from '../lib/exportNote';

describe('generateExportHtml', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('produces a standalone HTML document and escapes fallback markdown content', async () => {
    const html = await generateExportHtml('a<b&c\nline2');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>export</title>');
    expect(html).toContain('a&lt;b&amp;c<br>line2');
  });

  it('serializes a rendered CodeMirror code block as a plain pre/code block', async () => {
    document.body.innerHTML = `
      <div class="ProseMirror">
        <div class="milkdown-code-block">
          <div class="cm-content">const x = 1;</div>
        </div>
      </div>
    `;

    const html = await generateExportHtml('');
    expect(html).toContain('<pre><code>const x = 1;</code></pre>');
  });

  it('sanitizes raw HTML blocks that were being edited during export', async () => {
    document.body.innerHTML = `
      <div class="ProseMirror">
        <span data-type="html" class="zn-html-block">
          <textarea class="zn-html-textarea"><img src="x" onerror="alert(1)"><script>bad()</script></textarea>
        </span>
      </div>
    `;

    const html = await generateExportHtml('');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script>');
  });
});
