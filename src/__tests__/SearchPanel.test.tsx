import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../store';

const { readFileMock, searchWorkspaceMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  searchWorkspaceMock: vi.fn(),
}));

vi.mock('../services', () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
}));

vi.mock('../lib/workspaceSearch', () => ({
  searchWorkspace: (...args: unknown[]) => searchWorkspaceMock(...args),
  clearWorkspaceSearchCache: vi.fn(),
}));

import { SearchPanel } from '../components/search/SearchPanel';

describe('SearchPanel', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    searchWorkspaceMock.mockReset();
    useStore.setState({
      workspacePath: '/ws',
      currentFilePath: null,
      content: '',
      openTabs: [],
      fileStates: new Map(),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the no-results state for a query with no matches', async () => {
    searchWorkspaceMock.mockResolvedValue([]);
    render(<SearchPanel onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('在工作区中搜索...'), { target: { value: 'nothing' } });

    await waitFor(() => expect(searchWorkspaceMock).toHaveBeenCalledWith('/ws', 'nothing'));
    expect(searchWorkspaceMock).toHaveBeenCalledWith('/ws', 'nothing');
    await waitFor(() => expect(screen.getByText('没有找到结果')).toBeInTheDocument());
  });

  it('renders results and opens the selected file', async () => {
    searchWorkspaceMock.mockResolvedValue([
      { filePath: '/ws/a.md', fileName: 'a.md', line: 2, content: 'hello world' },
    ]);
    readFileMock.mockResolvedValue('# a content');
    const onClose = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<SearchPanel onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('在工作区中搜索...'), { target: { value: 'hello' } });

    await waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument());
    expect(screen.getByText('hello world')).toBeInTheDocument();

    fireEvent.click(screen.getByText('a.md'));

    await waitFor(() => {
      expect(readFileMock).toHaveBeenCalledWith('/ws/a.md');
      expect(useStore.getState().currentFilePath).toBe('/ws/a.md');
      expect(onClose).toHaveBeenCalled();
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'zn-find-open' }),
    );
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SearchPanel onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus and opens the focused result with Enter', async () => {
    searchWorkspaceMock.mockResolvedValue([
      { filePath: '/ws/a.md', fileName: 'a.md', line: 1, content: 'a' },
      { filePath: '/ws/b.md', fileName: 'b.md', line: 1, content: 'b' },
    ]);
    readFileMock.mockResolvedValue('content');
    const onClose = vi.fn();

    render(<SearchPanel onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('在工作区中搜索...'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(readFileMock).toHaveBeenCalledWith('/ws/b.md');
      expect(onClose).toHaveBeenCalled();
    });
  });
});
