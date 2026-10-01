import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { findMermaidBlocks } from '../components/editor/livepreview/livePreview';

// `findMermaidBlocks` drives whole-document preloading, so it has to agree with
// what the block decorations will actually render.
//
// It scans lines rather than reading the syntax tree, because the tree is parsed
// asynchronously and a freshly opened file must start preparing immediately. An
// earlier version read the tree here and therefore found nothing on open, which
// left every diagram in the file unrendered until the reader scrolled past it.
//
// Fence parsing is easy to get subtly wrong, so the rules are pinned here.

const blocks = (text: string) => findMermaidBlocks(Text.of(text.split('\n')));

describe('findMermaidBlocks', () => {
  it('finds a simple mermaid block and its source', () => {
    const found = blocks(['# t', '', '```mermaid', 'graph LR', '  A --> B', '```', ''].join('\n'));
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('graph LR\n  A --> B');
  });

  it('spans from the opening fence to the closing fence', () => {
    const text = ['```mermaid', 'graph LR', '```'].join('\n');
    const [b] = blocks(text);
    expect(text.slice(b.from, b.to)).toBe(text);
  });

  it('ignores other languages', () => {
    expect(blocks(['```typescript', 'const a = 1;', '```'].join('\n'))).toHaveLength(0);
  });

  it('ignores a mermaid fence mentioned inside another fence', () => {
    // The inner ```mermaid is content of the outer block, not a block itself.
    const found = blocks(['````', '```mermaid', 'graph LR', '```', '````'].join('\n'));
    expect(found).toHaveLength(0);
  });

  it('ignores prose and inline code that merely mention mermaid', () => {
    expect(blocks('Wrap it in ```mermaid to draw it.')).toHaveLength(0);
    expect(blocks('see `mermaid` above')).toHaveLength(0);
  });

  it('accepts tilde fences', () => {
    const found = blocks(['~~~mermaid', 'graph LR', '~~~'].join('\n'));
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('graph LR');
  });

  it('does not close a backtick fence with a tilde fence', () => {
    // CommonMark: the closing fence must use the same character.
    const found = blocks(['```mermaid', 'graph LR', '~~~', '```'].join('\n'));
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('graph LR\n~~~');
  });

  it('requires the closing fence to carry no info string', () => {
    const found = blocks(['```mermaid', 'graph LR', '```not-a-close', '```'].join('\n'));
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('graph LR\n```not-a-close');
  });

  it('accepts a longer closing fence', () => {
    const found = blocks(['```mermaid', 'graph LR', '`````'].join('\n'));
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('graph LR');
  });

  it('ignores an unclosed fence', () => {
    expect(blocks(['```mermaid', 'graph LR'].join('\n'))).toHaveLength(0);
  });

  it('accepts up to three spaces of indent', () => {
    expect(blocks(['   ```mermaid', 'graph LR', '   ```'].join('\n'))).toHaveLength(1);
    // Four spaces is an indented code block, not a fence.
    expect(blocks(['    ```mermaid', 'graph LR', '    ```'].join('\n'))).toHaveLength(0);
  });

  it('finds every block in a document', () => {
    const found = blocks(
      [
        '# one',
        '```mermaid',
        'graph LR',
        '```',
        'text',
        '```js',
        'const a = 1;',
        '```',
        '```mermaid',
        'sequenceDiagram',
        '```',
      ].join('\n'),
    );
    expect(found.map(f => f.source)).toEqual(['graph LR', 'sequenceDiagram']);
  });

  it('rejects a backtick in a backtick fence info string', () => {
    // CommonMark forbids it, so this is not a mermaid fence at all.
    expect(blocks(['```mermaid`x', 'graph LR', '```'].join('\n'))).toHaveLength(0);
  });
});
