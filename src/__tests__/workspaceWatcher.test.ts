import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Workspace watcher logic tests (tree refresh + external-change reload).
 * The Tauri IPC layer is mocked; the real Zustand store drives the behavior.
 */
const fsMock = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  readDir: vi.fn(),
  readFile: vi.fn(),
  getLastWritten: vi.fn(),
}));
vi.mock('../services/fileService', () => fsMock);

import { refreshWorkspaceTree, reloadExternallyChanged } from '../lib/workspaceWatcher';
import { useStore } from '../store';

function resetStore() {
  useStore.setState({
    workspacePath: '/ws',
    tree: [],
    expandedFolders: [],
    openTabs: [],
    fileStates: new Map(),
    currentFilePath: null,
    content: '',
    isDirty: false,
    reloadTick: 0,
  });
}

describe('refreshWorkspaceTree', () => {
  beforeEach(() => { resetStore(); vi.clearAllMocks(); });

  it('re-lists the root and re-reads expanded folders, dropping deleted ones', async () => {
    useStore.setState({ expandedFolders: ['/ws/sub', '/ws/gone'] });
    fsMock.openWorkspace.mockResolvedValue([
      { name: 'sub', path: '/ws/sub', isDir: true, children: null },
    ]);
    fsMock.readDir.mockImplementation(async (p: string) => {
      if (p === '/ws/sub') return [{ name: 'n.md', path: '/ws/sub/n.md', isDir: false }];
      throw new Error('folder deleted externally');
    });

    await refreshWorkspaceTree();

    const s = useStore.getState();
    expect(s.tree).toHaveLength(1);
    expect(s.tree[0].path).toBe('/ws/sub');
    // The expanded folder kept its lazily-loaded children...
    expect(s.tree[0].children?.[0]?.path).toBe('/ws/sub/n.md');
    // ...while the deleted folder was dropped from the expanded set.
    expect(s.expandedFolders).toEqual(['/ws/sub']);
  });

  it('keeps the old tree when the workspace root is unreadable', async () => {
    const oldTree = [{ name: 'keep.md', path: '/ws/keep.md', isDir: false }] as never[];
    useStore.setState({ tree: oldTree });
    fsMock.openWorkspace.mockRejectedValue(new Error('missing'));

    await refreshWorkspaceTree();

    expect(useStore.getState().tree).toBe(oldTree);
  });
});

describe('reloadExternallyChanged', () => {
  beforeEach(() => { resetStore(); vi.clearAllMocks(); });

  it('reloads the current file when it changed externally (no unsaved edits)', async () => {
    useStore.getState().setCurrentFile('/ws/a.md', 'old content');
    const tickBefore = useStore.getState().reloadTick;
    fsMock.readFile.mockResolvedValue('new external content');
    fsMock.getLastWritten.mockReturnValue(undefined);

    await reloadExternallyChanged(['/ws/a.md']);

    const s = useStore.getState();
    expect(s.content).toBe('new external content');
    // reloadTick bump makes the editor effect swap the document in place.
    expect(s.reloadTick).toBe(tickBefore + 1);
    expect(s.isDirty).toBe(false);
  });

  it('ignores echoes of our own writes (same content as last save)', async () => {
    useStore.getState().setCurrentFile('/ws/a.md', 'v1');
    fsMock.readFile.mockResolvedValue('v2');
    fsMock.getLastWritten.mockReturnValue('v2'); // our autosave caused this event

    await reloadExternallyChanged(['/ws/a.md']);

    expect(useStore.getState().content).toBe('v1');
  });

  it('never overwrites unsaved edits in the current file', async () => {
    useStore.getState().setCurrentFile('/ws/a.md', 'v1');
    useStore.getState().setContent('v1 + unsaved typing'); // marks dirty
    fsMock.readFile.mockResolvedValue('external v2');
    fsMock.getLastWritten.mockReturnValue(undefined);

    await reloadExternallyChanged(['/ws/a.md']);

    const s = useStore.getState();
    expect(s.content).toBe('v1 + unsaved typing');
    expect(s.isDirty).toBe(true);
  });

  it('updates a background tab cached content when its file changed externally', async () => {
    useStore.getState().setCurrentFile('/ws/a.md', 'A');
    useStore.getState().setCurrentFile('/ws/b.md', 'B'); // caches a in fileStates
    fsMock.readFile.mockResolvedValue('A-external');
    fsMock.getLastWritten.mockReturnValue(undefined);

    await reloadExternallyChanged(['/ws/a.md']);

    const s = useStore.getState();
    expect(s.fileStates.get('/ws/a.md')?.content).toBe('A-external');
    // Current file untouched.
    expect(s.currentFilePath).toBe('/ws/b.md');
    expect(s.content).toBe('B');
  });

  it('skips files that are not open and unreadable files', async () => {
    useStore.getState().setCurrentFile('/ws/a.md', 'A');
    fsMock.readFile.mockRejectedValue(new Error('deleted'));

    await reloadExternallyChanged(['/ws/not-open.md', '/ws/a.md']);

    expect(useStore.getState().content).toBe('A');
  });
});
