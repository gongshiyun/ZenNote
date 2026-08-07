import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../store';

// Mock the service layer (Tauri IPC) — readDir drives the lazy-load tests.
const readDirSpy = vi.fn();
vi.mock('../services', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  createFile: vi.fn(),
  createFolder: vi.fn(),
  renameFile: vi.fn(),
  deleteFile: vi.fn(),
  openWorkspace: vi.fn(),
  readDir: (...args: unknown[]) => readDirSpy(...args),
  saveImage: vi.fn(),
  resolveImageUrl: vi.fn(),
}));

import { FileTree } from '../components/filetree/FileTree';

describe('FileTree — workspace loading UX', () => {
  beforeEach(() => {
    readDirSpy.mockReset();
    useStore.setState({
      workspacePath: '/ws',
      tree: [],
      expandedFolders: [],
      isLoading: false,
      selectedFilePath: null,
    });
  });

  it('shows the loading spinner instead of stale content while isLoading', () => {
    useStore.setState({ isLoading: true });
    render(<FileTree />);
    expect(screen.getByText('加载工作区...')).toBeInTheDocument();
    // No "暂无笔记" empty-state while loading.
    expect(screen.queryByText('暂无笔记')).toBeNull();
  });

  it('shows empty state when loaded and the workspace has no notes', () => {
    render(<FileTree />);
    expect(screen.getByText('暂无笔记')).toBeInTheDocument();
  });

  it('lazy-loads folder children on expand (spinner -> content)', async () => {
    readDirSpy.mockResolvedValue([
      { name: 'child.md', path: '/ws/folder/child.md', isDir: false },
    ]);
    useStore.setState({
      // children omitted => "not loaded yet" marker from the shallow listing
      tree: [{ name: 'folder', path: '/ws/folder', isDir: true }],
      expandedFolders: ['/ws/folder'],
    });

    render(<FileTree />);

    // While fetching, a folder-level loading row is shown.
    expect(screen.getByText('搜索中...')).toBeInTheDocument();

    // After readDir resolves, the children appear and the spinner is gone.
    await waitFor(() => expect(screen.getByText('child.md')).toBeInTheDocument());
    expect(readDirSpy).toHaveBeenCalledWith('/ws/folder');
    expect(screen.queryByText('搜索中...')).toBeNull();
  });

  it('expanding a lazy folder triggers exactly one load (dedupe guard)', async () => {
    readDirSpy.mockResolvedValue([]);
    useStore.setState({
      tree: [{ name: 'folder', path: '/ws/folder', isDir: true }],
      expandedFolders: ['/ws/folder'],
    });
    const { rerender } = render(<FileTree />);
    rerender(<FileTree />); // re-render must not double-fetch
    await waitFor(() => expect(readDirSpy).toHaveBeenCalledTimes(1));
  });

  it('a failed folder load is treated as an empty folder (spinner never sticks)', async () => {
    readDirSpy.mockRejectedValue(new Error('io error'));
    useStore.setState({
      tree: [{ name: 'broken', path: '/ws/broken', isDir: true }],
      expandedFolders: ['/ws/broken'],
    });
    render(<FileTree />);
    await waitFor(() => expect(readDirSpy).toHaveBeenCalled());
    // children = [] -> the loading row disappears
    await waitFor(() => expect(screen.queryByText('搜索中...')).toBeNull());
  });

  it('loaded children are NOT re-fetched on collapse/expand', async () => {
    readDirSpy.mockResolvedValue([{ name: 'x.md', path: '/ws/f/x.md', isDir: false }]);
    useStore.setState({
      tree: [{ name: 'f', path: '/ws/f', isDir: true }],
      expandedFolders: ['/ws/f'],
    });
    render(<FileTree />);
    await waitFor(() => expect(screen.getByText('x.md')).toBeInTheDocument());

    // Collapse then expand again via the store.
    useStore.getState().toggleFolder('/ws/f');
    useStore.getState().toggleFolder('/ws/f');
    await waitFor(() => expect(screen.getByText('x.md')).toBeInTheDocument());
    expect(readDirSpy).toHaveBeenCalledTimes(1);
  });

  it('clicking a lazy folder expands it and starts the load', async () => {
    readDirSpy.mockResolvedValue([]);
    useStore.setState({
      tree: [{ name: 'folder', path: '/ws/folder', isDir: true }],
    });
    render(<FileTree />);
    fireEvent.click(screen.getByText('folder'));
    expect(useStore.getState().expandedFolders).toContain('/ws/folder');
    await waitFor(() => expect(readDirSpy).toHaveBeenCalledWith('/ws/folder'));
  });
});
