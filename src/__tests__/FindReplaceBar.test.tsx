import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../store';

// ---- Mocks ----

// Controlled znFind plugin state (what the bar reads after dispatching).
const mocks = vi.hoisted(() => ({
  getFindState: vi.fn(() => null as any),
}));

vi.mock('../components/editor/findState', () => ({
  znFindKey: { getState: () => mocks.getFindState() },
  emptyFindState: () => ({
    query: '', opts: { caseSensitive: false, wholeWord: false, regex: false },
    matches: [], current: -1, deco: null,
  }),
}));

vi.mock('@milkdown/kit/prose/state', () => ({
  TextSelection: { create: vi.fn(() => ({})) },
  PluginKey: class { name: string; constructor(name?: string) { this.name = name ?? ''; } },
}));

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

// ---- Fakes ----

function makePmView() {
  const tr = {
    setMeta: vi.fn().mockReturnThis(),
    setSelection: vi.fn().mockReturnThis(),
    scrollIntoView: vi.fn().mockReturnThis(),
    replaceWith: vi.fn().mockReturnThis(),
  };
  return { tr, view: { state: { tr, doc: {}, selection: {} }, dispatch: vi.fn() } };
}

function makeCmView(doc: string) {
  return {
    state: { doc: { toString: () => doc }, selection: { main: { head: 0 } } },
    dispatch: vi.fn(),
    focus: vi.fn(),
    hasFocus: false,
  };
}

const baseProps = () => ({
  visible: true,
  onClose: vi.fn(),
  preset: null,
  getPmView: () => null,
  getCmView: () => null,
});

describe('FindReplaceBar', () => {
  beforeEach(() => {
    useStore.setState({ sourceMode: false, content: '' });
    mocks.getFindState.mockReturnValue(null);
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

  it('WYSIWYG: typing dispatches the query meta and shows the match count', async () => {
    const { view } = makePmView();
    mocks.getFindState.mockReturnValue({
      query: 'test', opts: {}, matches: [{ from: 0, to: 4 }, { from: 10, to: 14 }], current: 0, deco: null,
    });
    render(<FindReplaceBar {...baseProps()} getPmView={() => view} />);

    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: 'test' } });

    await waitFor(() => {
      expect(view.dispatch).toHaveBeenCalled();
      expect(screen.getByText('1/2')).toBeInTheDocument();
    }, { timeout: 1500 });

    // The dispatched transaction carries the znFind query meta.
    const tr = view.state.tr;
    expect(tr.setMeta).toHaveBeenCalled();
    const metaCall = (tr.setMeta as any).mock.calls.find((c: any[]) => c[1]?.type === 'query');
    expect(metaCall?.[1].query).toBe('test');
  });

  it('WYSIWYG: next/prev navigation dispatches goto metas', async () => {
    const { view } = makePmView();
    mocks.getFindState.mockReturnValue({
      query: 'a', opts: {}, matches: [{ from: 0, to: 1 }, { from: 5, to: 6 }], current: 0, deco: null,
    });
    render(<FindReplaceBar {...baseProps()} getPmView={() => view} />);
    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument(), { timeout: 1500 });

    fireEvent.click(screen.getByTitle('下一个 (Enter)'));
    await waitFor(() => expect(screen.getByText('2/2')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('上一个 (Shift+Enter)'));
    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument());
  });

  it('WYSIWYG: replace-one dispatches a replaceWith transaction at the current match', async () => {
    const { view, tr } = makePmView();
    mocks.getFindState.mockReturnValue({
      query: 'test', opts: {}, matches: [{ from: 3, to: 7 }, { from: 20, to: 24 }], current: 0, deco: null,
    });
    render(<FindReplaceBar {...baseProps()} getPmView={() => view} />);
    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: 'test' } });
    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument(), { timeout: 1500 });

    fireEvent.click(screen.getByText('替换')); // expand the replace row
    fireEvent.change(screen.getByPlaceholderText('替换为...'), { target: { value: 'XYZ' } });
    fireEvent.click(screen.getByText('替换当前'));

    // Replacement goes through a real ProseMirror transaction (not DOM mutation).
    expect(tr.replaceWith).toHaveBeenCalledWith(3, 7, 'XYZ');
    expect(view.dispatch).toHaveBeenCalledWith(tr);
  });

  it('WYSIWYG: replace-all replaces every match back-to-front in one transaction', async () => {
    const { view, tr } = makePmView();
    mocks.getFindState.mockReturnValue({
      query: 'a', opts: {}, matches: [{ from: 1, to: 2 }, { from: 9, to: 10 }, { from: 15, to: 16 }], current: 0, deco: null,
    });
    render(<FindReplaceBar {...baseProps()} getPmView={() => view} />);
    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.getByText('1/3')).toBeInTheDocument(), { timeout: 1500 });

    fireEvent.click(screen.getByText('替换'));
    fireEvent.change(screen.getByPlaceholderText('替换为...'), { target: { value: 'B' } });
    fireEvent.click(screen.getByText('全部替换'));

    // Back-to-front keeps earlier ranges valid within a single transaction.
    expect(tr.replaceWith).toHaveBeenNthCalledWith(1, 15, 16, 'B');
    expect(tr.replaceWith).toHaveBeenNthCalledWith(2, 9, 10, 'B');
    expect(tr.replaceWith).toHaveBeenNthCalledWith(3, 1, 2, 'B');
    expect(view.dispatch).toHaveBeenCalledWith(tr);
  });

  it('closing the bar clears highlights via the clear meta', async () => {
    const { view, tr } = makePmView();
    const onClose = vi.fn();
    // Controlled wrapper: Esc -> onClose -> visible=false -> clear dispatch.
    function Host() {
      const [visible, setVisible] = useState(true);
      return (
        <FindReplaceBar
          {...baseProps()}
          visible={visible}
          getPmView={() => view}
          onClose={() => { setVisible(false); onClose(); }}
        />
      );
    }
    render(<Host />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      const clearCall = (tr.setMeta as any).mock.calls.find((c: any[]) => c[1]?.type === 'clear');
      expect(clearCall).toBeTruthy();
    });
  });

  it('source mode: counts matches against the CodeMirror document', async () => {
    useStore.setState({ sourceMode: true });
    const cm = makeCmView('test x test');
    render(<FindReplaceBar {...baseProps()} getCmView={() => cm} />);

    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: 'test' } });
    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument(), { timeout: 1500 });

    fireEvent.click(screen.getByTitle('下一个 (Enter)'));
    await waitFor(() => {
      // "next" moves from the first match (1/2) to the second (2/2).
      expect(cm.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ selection: expect.objectContaining({ anchor: 7, head: 11 }) }),
      );
    });
  });

  it('source mode: replace-all dispatches one change per match', async () => {
    useStore.setState({ sourceMode: true });
    const cm = makeCmView('a-b-a');
    render(<FindReplaceBar {...baseProps()} getCmView={() => cm} />);

    fireEvent.change(screen.getByPlaceholderText('查找...'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument(), { timeout: 1500 });

    fireEvent.click(screen.getByText('替换')); // open replace row
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

  it('Esc closes the bar', async () => {
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
});
