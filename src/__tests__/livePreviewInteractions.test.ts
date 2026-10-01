import { describe, expect, it } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import {
  insertLink,
  toggleMark,
} from '../components/editor/livepreview/livePreviewInteractions';
import {
  applySlashItem,
  filterSlashItems,
  matchSlash,
  SLASH_ITEMS,
} from '../components/editor/livepreview/slashMenu';
import { Highlight } from '../components/editor/livepreview/markdownExtensions';

// Phase 4 interactions. Mark toggling is pure text surgery on the markdown, so
// it is fully testable without a real browser: build a state, run the command,
// read the resulting document and selection.

function makeView(text: string, anchor: number, head = anchor) {
  const state = EditorState.create({
    doc: text,
    selection: { anchor, head },
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM, Highlight] })],
  });
  // A detached view is enough: the commands only read state and dispatch.
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({ state, parent: host });
}

const after = (view: EditorView) => ({
  doc: view.state.doc.toString(),
  sel: [view.state.selection.main.from, view.state.selection.main.to] as [number, number],
});

describe('live preview — mark toggling', () => {
  it('wraps a selection in the delimiter', () => {
    const v = makeView('hello world', 0, 5);
    toggleMark(v, '**');
    expect(after(v)).toEqual({ doc: '**hello** world', sel: [2, 7] });
    v.destroy();
  });

  it('inserts an empty pair and parks the caret between them', () => {
    const v = makeView('ab', 1);
    toggleMark(v, '**');
    expect(after(v)).toEqual({ doc: 'a****b', sel: [3, 3] });
    v.destroy();
  });

  it('unwraps when the selection is delimited from outside', () => {
    const v = makeView('**hello**', 2, 7);
    toggleMark(v, '**');
    expect(after(v)).toEqual({ doc: 'hello', sel: [0, 5] });
    v.destroy();
  });

  it('unwraps when the delimiters are inside the selection', () => {
    const v = makeView('**hello**', 0, 9);
    toggleMark(v, '**');
    expect(after(v)).toEqual({ doc: 'hello', sel: [0, 5] });
    v.destroy();
  });

  it('round-trips: wrapping then unwrapping restores the original', () => {
    const v = makeView('hello world', 0, 5);
    toggleMark(v, '**');
    toggleMark(v, '**');
    expect(after(v)).toEqual({ doc: 'hello world', sel: [0, 5] });
    v.destroy();
  });

  it('handles a one-character delimiter', () => {
    const v = makeView('code', 0, 4);
    toggleMark(v, '`');
    expect(after(v)).toEqual({ doc: '`code`', sel: [1, 5] });
    v.destroy();
  });

  it('handles a two-character delimiter that repeats', () => {
    const v = makeView('x', 0, 1);
    toggleMark(v, '~~');
    expect(after(v)).toEqual({ doc: '~~x~~', sel: [2, 3] });
    toggleMark(v, '~~');
    expect(after(v)).toEqual({ doc: 'x', sel: [0, 1] });
    v.destroy();
  });

  it('does not treat a shorter run as already wrapped', () => {
    // `*a*` is emphasis, not bold: Ctrl+B must add a second pair, not strip one.
    const v = makeView('*a*', 1, 2);
    toggleMark(v, '**');
    expect(after(v).doc).toBe('***a***');
    v.destroy();
  });

  it('does not unwrap across a line boundary', () => {
    const v = makeView('a\nb', 1, 2);
    toggleMark(v, '**');
    expect(after(v).doc).toBe('a**\n**b');
    v.destroy();
  });
});

describe('live preview — link insertion', () => {
  it('wraps the selection and selects the placeholder url', () => {
    const v = makeView('click here', 0, 10);
    insertLink(v);
    expect(after(v).doc).toBe('[click here](url)');
    // The `url` placeholder is selected so typing replaces it.
    const { from, to } = v.state.selection.main;
    expect(v.state.doc.sliceString(from, to)).toBe('url');
    v.destroy();
  });

  it('uses a placeholder label for an empty selection', () => {
    const v = makeView('', 0);
    insertLink(v);
    expect(after(v).doc).toBe('[text](url)');
    v.destroy();
  });

  it('jumps to the url when the selection is already a link', () => {
    const v = makeView('see [docs](https://x.dev) now', 5, 10);
    insertLink(v);
    const { from, to } = v.state.selection.main;
    expect(v.state.doc.sliceString(from, to)).toBe('https://x.dev');
    // The document is untouched: this call only moved the selection.
    expect(after(v).doc).toBe('see [docs](https://x.dev) now');
    v.destroy();
  });
});

describe('live preview — slash menu', () => {
  const stateAt = (text: string, pos = text.length) =>
    EditorState.create({
      doc: text,
      selection: { anchor: pos },
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM, Highlight] })],
    });

  const viewAt = (text: string, pos = text.length) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return new EditorView({ state: stateAt(text, pos), parent: host });
  };

  describe('trigger detection', () => {
    it('opens on a bare slash at the start of a line', () => {
      const m = matchSlash(stateAt('/'), 1);
      expect(m).not.toBeNull();
      expect(m!.query).toBe('');
    });

    it('opens while the query is being typed', () => {
      expect(matchSlash(stateAt('/表'), 2)?.query).toBe('表');
    });

    it('stays closed mid-sentence', () => {
      // `/` in prose is far more likely a date or a path than a command.
      expect(matchSlash(stateAt('http://x'), 8)).toBeNull();
    });

    it('stays closed when the slash is not first', () => {
      expect(matchSlash(stateAt('a /'), 3)).toBeNull();
    });

    it('allows indentation before the slash', () => {
      expect(matchSlash(stateAt('    /'), 5)).not.toBeNull();
    });

    it('points `from` at the slash, not at the indent', () => {
      // Regression: pointing at the indent made acceptance delete it and break
      // the nesting of the item being edited.
      const m = matchSlash(stateAt('   /hea'), 7);
      expect(m!.from).toBe(3);
      expect(m!.to).toBe(7);
    });
  });

  describe('filtering', () => {
    it('shows everything for an empty query', () => {
      expect(filterSlashItems('')).toHaveLength(SLASH_ITEMS.length);
    });

    it('matches the localised label', () => {
      expect(filterSlashItems('引用').map(i => i.label)).toContain('引用');
    });

    it('matches the syntax', () => {
      expect(filterSlashItems('###').map(i => i.label)).toContain('标题 3');
    });

    it('matches English keywords', () => {
      expect(filterSlashItems('table').map(i => i.label)).toContain('表格');
    });

    it('returns nothing for a query that matches nothing', () => {
      expect(filterSlashItems('zzzz')).toHaveLength(0);
    });
  });

  describe('acceptance', () => {
    it('replaces the query and leaves the caret at the end', () => {
      const view = viewAt('/引用', 3);
      const m = matchSlash(view.state, 3)!;
      applySlashItem(view, m, SLASH_ITEMS.find(i => i.label === '引用')!);
      expect(view.state.doc.toString()).toBe('> ');
      expect(view.state.selection.main.head).toBe(2);
      view.destroy();
    });

    it('spots the url placeholder when inserting a link', () => {
      const view = viewAt('/link', 5);
      const m = matchSlash(view.state, 5)!;
      applySlashItem(view, m, SLASH_ITEMS.find(i => i.label === '链接')!);
      const doc = view.state.doc.toString();
      expect(doc).toBe('[text](url)');
      // Caret sits on `url`, so the next keystroke replaces the placeholder.
      expect(view.state.selection.main.head).toBe(doc.indexOf('url'));
      view.destroy();
    });

    it('keeps the indent on continuation lines of a multi-line insert', () => {
      const view = viewAt('  /code', 7);
      const m = matchSlash(view.state, 7)!;
      const code = SLASH_ITEMS.find(i => i.label === '代码块')!;
      applySlashItem(view, m, code);
      // The two leading spaces survive and the inner blank line is indented.
      expect(view.state.doc.toString()).toBe('  ```\n  \n  ```');
      view.destroy();
    });

    it('places the caret inside an empty code fence, not after it', () => {
      const view = viewAt('/code', 5);
      const m = matchSlash(view.state, 5)!;
      applySlashItem(view, m, SLASH_ITEMS.find(i => i.label === '代码块')!);
      const doc = view.state.doc.toString();
      // Caret sits on the blank line between the fences.
      expect(view.state.selection.main.head).toBe(doc.indexOf('\n\n') + 1);
      view.destroy();
    });

    it('replaces a partially typed query without leaving it behind', () => {
      const view = viewAt('/表格', 3);
      const m = matchSlash(view.state, 3)!;
      applySlashItem(view, m, SLASH_ITEMS.find(i => i.label === '分隔线')!);
      expect(view.state.doc.toString()).toBe('---\n');
      view.destroy();
    });
  });
});
