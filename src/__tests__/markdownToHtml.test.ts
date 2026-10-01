import { describe, it, expect } from 'vitest';
import { renderMarkdownToHtml } from '../lib/markdownToHtml';

// The export renders from the markdown source rather than from the editor's DOM.
//
// That is not a preference. CodeMirror renders only its viewport — the visible
// area plus a hard-coded 1000px, which cannot be widened — so the editor's DOM
// holds about one screenful of the note. Cloning it exported the visible part and
// silently dropped everything below. Rendering from the source covers the whole
// document and, being a pure function of the markdown, is testable here.
//
// Anything async is injected, so these tests need neither a browser nor KaTeX.

const F = '```';

const mathStub = (source: string) => `<span class="katex">${source}</span>`;
const render = (md: string, extra = {}) =>
  renderMarkdownToHtml(md, { renderMath: mathStub, ...extra });

describe('export rendering — block structure', () => {
  it('renders ATX headings with a linkable id', async () => {
    const html = await render('# 标题\n\n## 第二节');
    expect(html).toContain('<h1 id="h-1-标题">标题</h1>');
    expect(html).toContain('<h2 id="h-2-第二节">第二节</h2>');
  });

  it('renders setext headings', async () => {
    const html = await render('标题\n====\n\n副标题\n----');
    expect(html).toContain('<h1 id="h-1-标题">标题</h1>');
    expect(html).toContain('<h2 id="h-2-副标题">副标题</h2>');
  });

  it('renders paragraphs and horizontal rules', async () => {
    const html = await render('一段话\n\n---\n\n另一段');
    expect(html).toContain('<p>一段话</p>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<p>另一段</p>');
  });

  it('renders nested blockquotes', async () => {
    const html = await render('> 外层\n>\n> > 内层');
    expect(html).toContain('<blockquote>');
    expect((html.match(/<blockquote>/g) ?? []).length).toBe(2);
    expect(html).toContain('内层');
  });

  it('renders bullet, ordered and nested lists', async () => {
    const html = await render('- 一\n- 二\n  - 嵌套\n\n3. 三');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><p>一</p></li>');
    expect(html).toContain('嵌套');
    // A list that does not start at 1 keeps its number.
    expect(html).toContain('<ol start="3">');
  });

  it('renders task list items with their state', async () => {
    const html = await render('- [x] 完成\n- [ ] 未完');
    expect(html).toContain('<li class="zn-task"><input type="checkbox" disabled checked> 完成</li>');
    expect(html).toContain('<li class="zn-task"><input type="checkbox" disabled> 未完</li>');
    // A Task lives INSIDE a ListItem; emitting both produced `<li><li`, which is
    // invalid and renders as two entries — a stray bullet above the checkbox.
    expect(html).not.toContain('<li><li');
    expect(html).not.toContain('</li></li>');
  });

  it('renders a table with per-column alignment and inline marks', async () => {
    const html = await render('| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| a | **b** | 1 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th style="text-align:left">左</th>');
    expect(html).toContain('<th style="text-align:center">中</th>');
    expect(html).toContain('<th style="text-align:right">右</th>');
    expect(html).toContain('<td style="text-align:center"><strong>b</strong></td>');
  });

  it('renders fenced code with its language, and without one', async () => {
    const html = await render([F + 'typescript', 'const a = 1;', F].join('\n'));
    expect(html).toContain('<pre><code class="language-typescript">const a = 1;</code></pre>');
    const plain = await render([F, '纯文本', F].join('\n'));
    expect(plain).toContain('<pre><code>纯文本</code></pre>');
  });

  it('escapes code instead of interpreting it', async () => {
    const html = await render([F + 'html', '<div> & </div>', F].join('\n'));
    expect(html).toContain('&lt;div&gt; &amp; &lt;/div&gt;');
  });

  it('keeps a four-space-indented line as text, matching the editor', async () => {
    // `@lezer/markdown` produces no indented-code node, so the editor renders such
    // a line as an ordinary paragraph. The export follows the editor rather than
    // inventing a code block the preview does not show.
    const html = await render('    缩进代码');
    expect(html).not.toContain('<pre>');
    expect(html).toContain('缩进代码');
  });

  it('sanitizes raw HTML blocks and drops comments', async () => {
    const html = await render('<div>块 <kbd>html</kbd></div>\n\n<!-- 注释 -->');
    expect(html).toContain('zn-html-render');
    expect(html).toContain('<kbd>html</kbd>');
    expect(html).not.toContain('注释');
  });
});

describe('export rendering — inline', () => {
  it('renders every inline mark', async () => {
    const html = await render('**粗** *斜* ~~删~~ ==高== `码`');
    expect(html).toContain('<strong>粗</strong>');
    expect(html).toContain('<em>斜</em>');
    expect(html).toContain('<del>删</del>');
    expect(html).toContain('<mark>高</mark>');
    expect(html).toContain('<code>码</code>');
  });

  it('renders links and resolves images through the injected resolver', async () => {
    const html = await renderMarkdownToHtml('[链](https://e.com "标题") ![图](a.png)', {
      renderMath: mathStub,
      resolveImage: src => `asset://${src}`,
    });
    expect(html).toContain('<a href="https://e.com" title="标题">链</a>');
    expect(html).toContain('<img src="asset://a.png" alt="图">');
  });

  it('shows escaped characters literally', async () => {
    const html = await render('\\*不是斜体\\*');
    expect(html).toContain('*不是斜体*');
    expect(html).not.toContain('<em>');
  });

  it('turns a hard break into <br>', async () => {
    const html = await render('上一行  \n下一行');
    expect(html).toContain('<br>');
  });

  it('renders inline maths through the injected renderer', async () => {
    const html = await render('公式 $a^2 + b^2$ 在句中');
    expect(html).toContain('<span class="zn-export-latex-inline"><span class="katex">a^2 + b^2</span></span>');
    expect(html).toContain('在句中');
  });

  it('keeps the source when maths cannot be rendered', async () => {
    const html = await renderMarkdownToHtml('公式 $a^2$ 在句中');
    expect(html).toContain('$a^2$');
  });

  it('does not emit a live javascript: link in an exported file', async () => {
    // The export is a file someone opens and clicks, so an unrestricted target
    // would execute on click.
    const html = await render('[点我](javascript:alert(1))');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('点我');

    const data = await render('[看](data:text/html;base64,PHN2Zz4=)');
    expect(data).not.toContain('href="data:');
  });

  it('keeps ordinary links live', async () => {
    const html = await render('[站点](https://example.com) [邮件](mailto:a@b.c) [本地](./a.md)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="mailto:a@b.c"');
    expect(html).toContain('href="./a.md"');
  });
});

describe('export rendering — app-specific blocks', () => {
  it('renders display maths as its own block', async () => {
    const html = await render(['$$', 'E = mc^2', '$$'].join('\n'));
    expect(html).toContain('<div class="zn-export-latex"><span class="katex">E = mc^2</span></div>');
    expect(html).not.toContain('$$');
  });

  it('keeps both display formulas when they share one block', async () => {
    // Swallowing the enclosing block would have dropped the first.
    const html = await render(['$$', 'a = 1', '$$', '$$', 'b = 2', '$$'].join('\n'));
    expect(html).toContain('>a = 1<');
    expect(html).toContain('>b = 2<');
    expect((html.match(/class="zn-export-latex"/g) ?? []).length).toBe(2);
  });

  it('renders a mermaid fence as a diagram', async () => {
    const html = await renderMarkdownToHtml([F + 'mermaid', 'graph LR', '  A --> B', F].join('\n'), {
      renderMermaid: async () => '<svg id="diagram"></svg>',
    });
    expect(html).toContain('<div class="zn-export-mermaid"><svg id="diagram"></svg></div>');
  });

  it('falls back to the source when a diagram cannot be rendered', async () => {
    const md = [F + 'mermaid', 'graph LR', '  A --> B', F].join('\n');
    const html = await renderMarkdownToHtml(md, { renderMermaid: async () => null });
    expect(html).toContain('language-mermaid');
    expect(html).toContain('A --&gt; B');
  });

  it('numbers footnotes by definition order and lists them at the end', async () => {
    const html = await render('第一处[^b]，第二处[^a]。\n\n[^b]: 乙的定义\n[^a]: 甲的定义');
    // Definitions are numbered in the order they are defined, not used.
    expect((html.match(/class="zn-fn-ref"/g) ?? []).length).toBe(2);
    expect(html).toContain('<sup class="zn-fn-ref" id="fnref-1">');
    expect(html).toContain('<li id="fn-1">乙的定义');
    expect(html).toContain('<li id="fn-2">甲的定义');
    // The definition lines must not also appear as body text.
    expect(html).not.toContain('[^b]:');
    expect(html).not.toContain('^b');
  });

  it('renders [TOC] as a linked outline', async () => {
    const html = await render('# 甲\n\n## 乙\n\n[TOC]');
    expect(html).toContain('<nav class="zn-toc">');
    expect(html).toContain('href="#h-1-甲"');
    expect(html).toContain('href="#h-2-乙"');
  });

  it('links the outline to the headings themselves, ids and all', async () => {
    // A `[TOC]` sits ABOVE the headings it names, so ids assigned during the walk
    // would reach the outline first and every heading would then take the `-2`
    // suffix — leaving each outline link dead.
    const html = await render('# 甲\n\n[TOC]\n\n## 乙');
    expect(html).toContain('<h1 id="h-1-甲">');
    expect(html).toContain('<h2 id="h-2-乙">');
    expect(html).not.toContain('h-1-甲-2');
    expect(html).not.toContain('h-2-乙-2');
    // Every outline target must exist as a heading.
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('keeps repeated headings separately linkable', async () => {
    const html = await render('# Notes\n\n# Notes');
    expect(html).toContain('id="h-1-notes"');
    expect(html).toContain('id="h-1-notes-2"');
  });

  it('uses the outline title it is given', async () => {
    const html = await renderMarkdownToHtml('# 甲\n\n[TOC]', { tocTitle: 'Table of Contents' });
    expect(html).toContain('>Table of Contents</div>');
  });

  it('keeps frontmatter as its own block instead of dropping it', async () => {
    const html = await render('---\ntitle: 标题\n---\n\n# 正文');
    expect(html).toContain('<pre class="zn-fm-block">title: 标题</pre>');
    expect(html).toContain('<h1 id="h-1-正文">正文</h1>');
  });
});

describe('export rendering — the whole document', () => {
  it('renders content at the very end of a long note', async () => {
    // The regression this module exists for: the editor's DOM held only the
    // visible screenful, so an export taken from it lost everything below.
    const filler = Array.from({ length: 60 }, (_, i) => `## 段落 ${i}\n\n第 ${i} 段。`).join('\n\n');
    const html = await render(`${filler}\n\n## 末尾小标题\n\n最后的文字。`);
    expect(html).toContain('段落 0');
    expect(html).toContain('段落 59');
    expect(html).toContain('末尾小标题');
    expect(html).toContain('最后的文字。');
  });

  it('emits no editor markup', async () => {
    const html = await render('# 标题\n\n| a |\n| --- |\n| 1 |\n\n' + F + 'js\nlet a;\n' + F);
    expect(html).not.toMatch(/cm-line|cm-zn-|ProseMirror|milkdown|contenteditable/);
  });
});
