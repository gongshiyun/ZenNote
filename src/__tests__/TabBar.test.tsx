import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../store';
import { TabBar } from '../components/layout/TabBar';

// Uses the REAL store and REAL i18n (zh-CN). confirm/clipboard are stubbed.

function openThreeTabs() {
  const s = useStore.getState();
  s.setCurrentFile('/notes/alpha.md', 'A');
  s.setCurrentFile('/notes/beta.md', 'B');
  s.setCurrentFile('/notes/gamma.md', 'C');
}

describe('TabBar context menu', () => {
  let confirmSpy: ReturnType<typeof vi.fn>;
  let writeTextSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useStore.setState({
      currentFilePath: null, content: '', isDirty: false, lastSavedAt: null,
      fileStates: new Map(), openTabs: [],
    });
    confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: writeTextSpy }, configurable: true,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing without tabs', () => {
    const { container } = render(<TabBar />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the context menu on right-click with all standard entries', () => {
    openThreeTabs();
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('beta'));
    expect(screen.getByText('关闭标签页')).toBeInTheDocument();
    expect(screen.getByText('关闭其他标签页')).toBeInTheDocument();
    expect(screen.getByText('关闭左侧标签页')).toBeInTheDocument();
    expect(screen.getByText('关闭右侧标签页')).toBeInTheDocument();
    expect(screen.getByText('关闭全部标签页')).toBeInTheDocument();
    expect(screen.getByText('复制文件路径')).toBeInTheDocument();
  });

  it('"close others" keeps only the clicked tab', () => {
    openThreeTabs();
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('beta'));
    fireEvent.click(screen.getByText('关闭其他标签页'));
    expect(useStore.getState().openTabs).toEqual(['/notes/beta.md']);
  });

  it('"close to the right" removes only trailing tabs', () => {
    openThreeTabs();
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('beta'));
    fireEvent.click(screen.getByText('关闭右侧标签页'));
    expect(useStore.getState().openTabs).toEqual(['/notes/alpha.md', '/notes/beta.md']);
  });

  it('"close to the left" removes only leading tabs', () => {
    openThreeTabs();
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('beta'));
    fireEvent.click(screen.getByText('关闭左侧标签页'));
    expect(useStore.getState().openTabs).toEqual(['/notes/beta.md', '/notes/gamma.md']);
  });

  it('"close all" empties the tab bar', () => {
    openThreeTabs();
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('alpha'));
    fireEvent.click(screen.getByText('关闭全部标签页'));
    expect(useStore.getState().openTabs).toEqual([]);
  });

  it('copies the full file path to the clipboard', () => {
    openThreeTabs();
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('gamma'));
    fireEvent.click(screen.getByText('复制文件路径'));
    expect(writeTextSpy).toHaveBeenCalledWith('/notes/gamma.md');
  });

  it('asks for confirmation when closing dirty tabs in bulk', () => {
    openThreeTabs();
    useStore.getState().setContent('edited'); // marks the CURRENT tab dirty
    render(<TabBar />);
    // Right-click a DIFFERENT tab; "close others" includes the dirty current tab.
    fireEvent.contextMenu(screen.getByText('alpha'));

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByText('关闭其他标签页'));
    expect(confirmSpy).toHaveBeenCalled();
    // Denied -> nothing closed.
    expect(useStore.getState().openTabs).toHaveLength(3);
  });

  it('closes the menu on Escape', async () => {
    openThreeTabs();
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByText('beta'));
    expect(screen.getByText('关闭全部标签页')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('关闭全部标签页')).toBeNull());
  });
});
