import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// The bar has one backend. Both editing surfaces — Live Preview and source mode —
// are CodeMirror, so matching runs against the document string and navigation and
// replacement dispatch CodeMirror change specs.
//
// A second, ProseMirror backend used to live here beside it and drove decorations
// through a `znFind` plugin for the Crepe editor. Live Preview was already passing
// `getPmView={() => null}`, so that branch never ran even before the editor was
// removed; these tests now cover the path that actually executes.

vi.mock('../i18n', () => ({
  t: () => ({
    find: {
      find: '查找...', replace: '替换', replaceWith: '替换为...',
      // Distinct labels in tests to disambiguate the toggle vs the action button.
      replaceOne: '替换当前', replaceAll: '全部替换', previous: '上一个', next: '下一个',
      caseSensitive: '区分大小写', wholeWord: '全词匹配', regex: '正则表达式',
      invalidRegex: '无效的正则表达式',
    },
  }),
  getLocale: () => 'zh-CN',
  setLocale: vi.fn(),
}));

import { FindReplaceBar } from '../components/editor/FindReplaceBar';

/**
 * A minimal stand-in for a CodeMirror document. `lineAt` is needed because the
 * preset "jump to result line" path resolves each match to a line number.
 */
function makeCmDoc(text: string) {
  const lines = text.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return {
    toString: () => text,
    lineAt: (pos: number) => {
      let number = 1;
      for (let i = 0; i < starts.length; i++) if (starts[i] <= pos) number = i + 1;
      return { number };
    },
  };
}

function makeCmView(doc: string) {
  return {
    state: { doc: makeCmDoc(doc), selection: { main: { head: 0 } } },
    dispatch: vi.fn(),
    focus: vi.fn(),
    hasFocus: false,
  };
}

const baseProps = () => ({
  visible: true,
  onClose: vi.fn(),
  preset: null,
  getCmView: () => null,
});

/** Type a query into the bar and wait for the match counter to settle. */
async function query(text: string, counter: string) {
  fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: text } });
  await waitFor(() => expect(screen.getByText(counter)).toBeInTheDocument(), { timeout: 1500 });
}

describe('FindReplaceBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<FindReplaceBar {...baseProps()} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the bar with option toggles when visible', () => {
    render(<FindReplaceBar {...baseProps()} />);
    expect(screen.getByPlaceholderText('查找...')).toBeInTheDocument();
    expect(screen.getByTitle('区分大小写')).toBeInTheDocument();
    expect(screen.getByTitle('全词匹配')).toBeInTheDocument();
    expect(screen.getByTitle('正则表达式')).toBeInTheDocument();
  });

  it('counts matches against the document and walks them', async () => {
    const cm = makeCmView('test x test');
    render(<FindReplaceBar {...baseProps()} getCmView={() => cm} />);
    await query('test', '1/2');

    fireEvent.click(screen.getByTitle('下一个 (Enter)'));
    await waitFor(() => {
      expect(cm.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ selection: expect.objectContaining({ anchor: 7, head: 11 }) }),
      );
    });

    fireEvent.click(screen.getByTitle('上一个 (Shift+Enter)'));
    await waitFor(() => {
      expect(cm.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ selection: expect.objectContaining({ anchor: 0, head: 4 }) }),
      );
    });
  });

  it('replace-one rewrites the current match', async () => {
    const cm = makeCmView('a-b-a');
    render(<FindReplaceBar {...baseProps()} getCmView={() => cm} />);
    await query('a', '1/2');

    fireEvent.click(screen.getByText('替换')); // open the replace row
    fireEvent.change(screen.getByPlaceholderText('替换为...'), { target: { value: 'Z' } });
    fireEvent.click(screen.getByText('替换当前'));
    await waitFor(() => {
      expect(cm.dispatch).toHaveBeenCalledWith({ changes: { from: 0, to: 1, insert: 'Z' } });
    });
  });

  it('replace-all dispatches one change per match', async () => {
    const cm = makeCmView('a-b-a');
    render(<FindReplaceBar {...baseProps()} getCmView={() => cm} />);
    await query('a', '1/2');

    fireEvent.click(screen.getByText('替换'));
    fireEvent.change(screen.getByPlaceholderText('替换为...'), { target: { value: 'Z' } });
    fireEvent.click(screen.getByText('全部替换'));
    await waitFor(() => {
      expect(cm.dispatch).toHaveBeenCalledWith({
        changes: [
          { from: 0, to: 1, insert: 'Z' },
          { from: 4, to: 5, insert: 'Z' },
        ],
      });
    });
  });

  it('regex mode: invalid pattern shows the invalid-regex hint', async () => {
    render(<FindReplaceBar {...baseProps()} />);
    fireEvent.click(screen.getByTitle('正则表达式'));
    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: '(unclosed' } });
    await waitFor(() => expect(screen.getByText('无效的正则表达式')).toBeInTheDocument(), { timeout: 1500 });
  });

  it('Esc closes the bar', () => {
    const onClose = vi.fn();
    render(<FindReplaceBar {...baseProps()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('preset query pre-fills the input', async () => {
    render(<FindReplaceBar {...baseProps()} preset={{ query: 'fromSearch', ts: 1 }} />);
    await waitFor(() => {
      expect((screen.getByPlaceholderText('查找...') as HTMLInputElement).value).toBe('fromSearch');
    });
  });

  it('preset can open directly in replace mode', async () => {
    render(
      <FindReplaceBar {...baseProps()} preset={{ query: 'replace me', showReplace: true, ts: 1 }} />,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('替换为...')).toBeInTheDocument());
  });

  it('jumps to the first match at or after the requested result line', async () => {
    // Line 2 is the second line, so the second match is the first one at or after
    // it. The document is "target\ntarget".
    const cm = makeCmView('target\ntarget');
    render(
      <FindReplaceBar
        {...baseProps()}
        getCmView={() => cm}
        preset={{ query: 'target', line: 2, ts: 1 }}
      />,
    );

    await waitFor(() => {
      expect(cm.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ selection: expect.objectContaining({ anchor: 7 }) }),
      );
    }, { timeout: 1500 });
  });

  it('re-runs an active query when the document changes', async () => {
    // The document grows between renders, so a re-run is observable as a changed
    // match count. (An initial query only counts; it does not dispatch.)
    let text = 'same';
    const view = {
      get state() {
        return { doc: makeCmDoc(text), selection: { main: { head: 0 } } };
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    const { rerender } = render(
      <FindReplaceBar
        {...baseProps()}
        documentKey="/notes/a.md"
        getCmView={() => view}
        preset={{ query: 'same', ts: 1 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument(), { timeout: 1500 });

    text = 'same same';
    rerender(
      <FindReplaceBar
        {...baseProps()}
        documentKey="/notes/b.md"
        getCmView={() => view}
        preset={{ query: 'same', ts: 1 }}
      />,
    );

    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument(), { timeout: 1500 });
  });

  it('accepts a null view without throwing', async () => {
    // Neither editor is mounted yet when the bar is first shown.
    render(<FindReplaceBar {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByPlaceholderText('查找...')).toBeInTheDocument());
  });
});
