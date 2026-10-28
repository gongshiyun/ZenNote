import { describe, expect, it } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { GFM } from '@lezer/markdown';
import { Highlight } from '../components/editor/livepreview/markdownExtensions';
import {
  continueMarkup,
  fenceAutoClose,
  headingChanges,
  headingLevelOf,
  lineInList,
  listShiftTab,
  listTab,
  markdownAutomation,
  pairInput,
  removeMarkupBackward,
  setHeading,
  setHeadingOnLine,
  toggleMark,
  unwrapMarkAtCaret,
} from '../components/editor/livepreview/livePreviewInteractions';

// Markdown automation (ED-06), cursor-aware mark removal (ED-09) and heading
// shortcuts (ED-19). The rules are expressed as pure helpers over an
// EditorState wherever possible, and the commands are exercised on a real
// (detached) EditorView so the dispatched changes/selection are asserted.

function stateOf(text: string, anchor = text.length, head = anchor) {
  return EditorState.create({
    doc: text,
    selection: { anchor, head },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM, Highlight] }),
      EditorState.tabSize.of(2),
      indentUnit.of('  '),
    ],
  });
}

function viewOf(text: string, anchor = text.length, head = anchor) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({ state: stateOf(text, anchor, head), parent: host });
}

const docOf = (view: EditorView) => view.state.doc.toString();
const selOf = (view: EditorView) => {
  const { from, to } = view.state.selection.main;
  return [from, to] as [number, number];
};

describe('markdownAutomation — pairing (§5.1)', () => {
  it('inserts the closing half and parks the caret between', () => {
    const action = pairInput(stateOf('ab', 1), 1, 1, '(');
    expect(action).toEqual({
      kind: 'edit',
      edit: { changes: [{ from: 1, insert: '()' }], anchor: 2, head: 2 },
    });
  });

  it('wraps a selection with the pair', () => {
    const action = pairInput(stateOf('abc', 0, 3), 0, 3, '*');
    expect(action).toEqual({
      kind: 'edit',
      edit: {
        changes: [
          { from: 0, insert: '*' },
          { from: 3, insert: '*' },
        ],
        anchor: 1,
        head: 4,
      },
    });
  });

  it('skips over an auto-inserted closing delimiter', () => {
    expect(pairInput(stateOf('()', 1), 1, 1, ')')).toEqual({ kind: 'skip', anchor: 2 });
  });

  it('turns the auto-inserted emphasis pair into a four-character run', () => {
    // `*|*` + `*` -> `**|**` (MARKDOWN-RENDERING §5.1 `**` row).
    const action = pairInput(stateOf('**', 1), 1, 1, '*');
    expect(action).toEqual({
      kind: 'edit',
      edit: { changes: [{ from: 1, insert: '**' }], anchor: 2, head: 2 },
    });
  });

  it('does not pair an apostrophe inside a word', () => {
    expect(pairInput(stateOf("don't", 2), 2, 2, "'")).toBeNull();
  });

  it('does not pair an underscore inside an identifier', () => {
    expect(pairInput(stateOf('snakecase', 5), 5, 5, '_')).toBeNull();
  });

  it('lets closing characters that have no partner through literally', () => {
    expect(pairInput(stateOf('ab', 1), 1, 1, ')')).toBeNull();
  });

  it('ignores non-pairing characters', () => {
    expect(pairInput(stateOf('ab', 1), 1, 1, 'x')).toBeNull();
  });
});

describe('markdownAutomation — fence auto-close (§5.2)', () => {
  it('closes a fresh fence with an empty body line', () => {
    const edit = fenceAutoClose(stateOf('```ts'), 5);
    expect(edit).toEqual({
      changes: [{ from: 5, insert: '\n\n```' }],
      anchor: 6,
      head: 6,
    });
  });

  it('preserves the fence character and length', () => {
    const edit = fenceAutoClose(stateOf('~~~~py'), 6);
    expect(edit?.changes).toEqual([{ from: 6, insert: '\n\n~~~~' }]);
  });

  it('does nothing when the fence is not the last line', () => {
    expect(fenceAutoClose(stateOf('```ts\ncode'), 5)).toBeNull();
  });

  it('does not treat the closing fence of a closed block as a new opener', () => {
    const text = '```\ncode\n```';
    expect(fenceAutoClose(stateOf(text), text.length)).toBeNull();
  });

  it('does nothing outside a fence-position line', () => {
    expect(fenceAutoClose(stateOf('plain text'), 10)).toBeNull();
  });
});

describe('markdownAutomation — list continuation / Tab nesting (§5.3, §3.3)', () => {
  it('continues an unordered list on Enter', () => {
    const view = viewOf('- a', 3);
    expect(continueMarkup(view)).toBe(true);
    expect(docOf(view)).toBe('- a\n- ');
    expect(selOf(view)).toEqual([6, 6]);
    view.destroy();
  });

  it('exits a list when Enter is pressed on an empty item', () => {
    const view = viewOf('- ', 2);
    expect(continueMarkup(view)).toBe(true);
    expect(docOf(view)).toBe('');
    view.destroy();
  });

  it('closes a fence through the shared Enter command', () => {
    const view = viewOf('```ts', 5);
    expect(continueMarkup(view)).toBe(true);
    expect(docOf(view)).toBe('```ts\n\n```');
    expect(selOf(view)).toEqual([6, 6]);
    view.destroy();
  });

  it('falls through on a plain paragraph so the default Enter still runs', () => {
    const view = viewOf('hello', 5);
    expect(continueMarkup(view)).toBe(false);
    expect(docOf(view)).toBe('hello');
    view.destroy();
  });

  it('Backspace removes the markup of an empty list item', () => {
    const view = viewOf('- a\n- ', 6);
    expect(removeMarkupBackward(view)).toBe(true);
    // The library keeps alignment whitespace where a marker was; what matters
    // is that the marker itself is gone (the list is exited).
    expect(docOf(view).replace(/\s+$/, '')).toBe('- a');
    view.destroy();
  });

  it('Tab nests a list item instead of inserting spaces', () => {
    const view = viewOf('- item', 4);
    expect(listTab(view)).toBe(true);
    expect(docOf(view)).toBe('  - item');
    view.destroy();
  });

  it('Shift+Tab un-nests a list item', () => {
    const view = viewOf('  - item', 6);
    expect(listShiftTab(view)).toBe(true);
    expect(docOf(view)).toBe('- item');
    view.destroy();
  });

  it('leaves Tab alone outside a list', () => {
    const view = viewOf('plain', 2);
    expect(listTab(view)).toBe(false);
    expect(docOf(view)).toBe('plain');
    view.destroy();
  });

  it('detects list context from the syntax tree', () => {
    expect(lineInList(stateOf('- a', 2), 2)).toBe(true);
    expect(lineInList(stateOf('> - a', 4), 4)).toBe(true);
    expect(lineInList(stateOf('plain', 2), 2)).toBe(false);
    expect(lineInList(stateOf('```\ncode\n```', 6), 6)).toBe(false);
  });
});

describe('markdownAutomation — heading shortcuts (ED-19)', () => {
  it('reads and rewrites heading levels', () => {
    expect(headingLevelOf('## x')).toBe(2);
    expect(headingLevelOf('x')).toBe(0);
    expect(headingLevelOf('  ### x')).toBe(3);
    expect(setHeadingOnLine('x', 2)).toBe('## x');
    expect(setHeadingOnLine('## x', 0)).toBe('x');
    expect(setHeadingOnLine('  ## x', 1)).toBe('  # x');
    expect(setHeadingOnLine('### old', 3)).toBe('### old');
  });

  it('sets the level for every selected line', () => {
    const state = stateOf('a\nb', 0, 3);
    expect(headingChanges(state, 1, false)).toEqual([
      { from: 0, to: 1, insert: '# a' },
      { from: 2, to: 3, insert: '# b' },
    ]);
  });

  it('toggles an existing level back to a paragraph', () => {
    const view = viewOf('hello', 2);
    expect(setHeading(view, 2)).toBe(true);
    expect(docOf(view)).toBe('## hello');
    expect(setHeading(view, 2)).toBe(true);
    expect(docOf(view)).toBe('hello');
    view.destroy();
  });

  it('Ctrl+0 removes the heading marker', () => {
    const view = viewOf('### title', 4);
    expect(setHeading(view, 0)).toBe(true);
    expect(docOf(view)).toBe('title');
    view.destroy();
  });
});

describe('markdownAutomation — cursor-aware mark removal (ED-09)', () => {
  const cases: Array<{ text: string; caret: number; delimiter: string; expected: string; expectedCaret: number }> = [
    { text: '**bold**', caret: 4, delimiter: '**', expected: 'bold', expectedCaret: 2 },
    { text: '*it*', caret: 2, delimiter: '*', expected: 'it', expectedCaret: 1 },
    { text: '~~s~~', caret: 2, delimiter: '~~', expected: 's', expectedCaret: 0 },
    { text: '`code`', caret: 3, delimiter: '`', expected: 'code', expectedCaret: 2 },
    { text: '==hi==', caret: 3, delimiter: '==', expected: 'hi', expectedCaret: 1 },
  ];

  for (const c of cases) {
    it(`removes the ${c.delimiter} pair when the caret is inside`, () => {
      const view = viewOf(c.text, c.caret);
      expect(toggleMark(view, c.delimiter)).toBe(true);
      expect(docOf(view)).toBe(c.expected);
      expect(selOf(view)).toEqual([c.expectedCaret, c.expectedCaret]);
      view.destroy();
    });
  }

  it('only strips the matching pair of a nested bold-italic run', () => {
    const bold = viewOf('***bi***', 4);
    toggleMark(bold, '**');
    expect(docOf(bold)).toBe('*bi*');
    bold.destroy();

    const italic = viewOf('***bi***', 4);
    toggleMark(italic, '*');
    expect(docOf(italic)).toBe('**bi**');
    italic.destroy();
  });

  it('exposes the pure decision as unwrapMarkAtCaret', () => {
    const edit = unwrapMarkAtCaret(stateOf('**bold**', 4), 4, '**');
    expect(edit?.changes).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 },
    ]);
    expect(edit?.anchor).toBe(2);
  });

  it('does not strip when the caret merely touches the mark boundary', () => {
    // Caret after the closing `**` is outside the bold run: normal toggle path.
    expect(unwrapMarkAtCaret(stateOf('**bold**', 8), 8, '**')).toBeNull();
    expect(unwrapMarkAtCaret(stateOf('**bold**', 2), 2, '**')).not.toBeNull();
  });

  it('keeps the existing selection-based toggles intact', () => {
    const view = viewOf('hello world', 0, 5);
    toggleMark(view, '**');
    expect(docOf(view)).toBe('**hello** world');
    toggleMark(view, '**');
    expect(docOf(view)).toBe('hello world');
    view.destroy();
  });
});

describe('markdownAutomation — extension shape', () => {
  it('is a single, non-empty extension bundle', () => {
    expect(Array.isArray(markdownAutomation)).toBe(true);
    expect((markdownAutomation as unknown[]).length).toBeGreaterThan(0);
  });
});
