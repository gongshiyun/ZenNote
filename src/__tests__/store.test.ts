import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('Editor Slice', () => {
  beforeEach(() => {
    // Reset store to initial state
    useStore.setState({
      currentFilePath: null,
      content: '',
      isDirty: false,
      sourceMode: false,
      cursorLine: 1,
      cursorCol: 1,
      scrollPosition: 0,
      fileStates: new Map(),
      openTabs: [],
    });
  });

  it('should initialize with default values', () => {
    const state = useStore.getState();
    expect(state.currentFilePath).toBeNull();
    expect(state.content).toBe('');
    expect(state.isDirty).toBe(false);
    expect(state.sourceMode).toBe(false);
    expect(state.cursorLine).toBe(1);
    expect(state.cursorCol).toBe(1);
  });

  it('setCurrentFile should update file path and content', () => {
    useStore.getState().setCurrentFile('/test/note.md', '# Hello');
    const state = useStore.getState();
    expect(state.currentFilePath).toBe('/test/note.md');
    expect(state.content).toBe('# Hello');
    expect(state.openTabs).toContain('/test/note.md');
  });

  it('setCurrentFile should add new tab to openTabs', () => {
    useStore.getState().setCurrentFile('/test/note1.md', 'Content 1');
    useStore.getState().setCurrentFile('/test/note2.md', 'Content 2');
    const state = useStore.getState();
    expect(state.openTabs).toEqual(['/test/note1.md', '/test/note2.md']);
  });

  it('setCurrentFile should not duplicate tabs', () => {
    useStore.getState().setCurrentFile('/test/note.md', 'Content');
    useStore.getState().setCurrentFile('/test/note.md', 'Updated');
    const state = useStore.getState();
    expect(state.openTabs).toEqual(['/test/note.md']);
  });

  it('setContent should update content and mark as dirty', () => {
    useStore.getState().setContent('New content');
    const state = useStore.getState();
    expect(state.content).toBe('New content');
    expect(state.isDirty).toBe(true);
  });

  it('setDirty should update dirty flag', () => {
    useStore.getState().setDirty(true);
    expect(useStore.getState().isDirty).toBe(true);
    useStore.getState().setDirty(false);
    expect(useStore.getState().isDirty).toBe(false);
  });

  it('setSourceMode should toggle source mode', () => {
    useStore.getState().setSourceMode(true);
    expect(useStore.getState().sourceMode).toBe(true);
    useStore.getState().setSourceMode(false);
    expect(useStore.getState().sourceMode).toBe(false);
  });

  it('setCursorPosition should update cursor position', () => {
    useStore.getState().setCursorPosition(10, 5);
    const state = useStore.getState();
    expect(state.cursorLine).toBe(10);
    expect(state.cursorCol).toBe(5);
  });

  it('setCursorPosition should not update if same position', () => {
    useStore.getState().setCursorPosition(1, 1);
    const state = useStore.getState();
    expect(state.cursorLine).toBe(1);
    expect(state.cursorCol).toBe(1);
  });

  it('setScrollPosition should update scroll position', () => {
    useStore.getState().setScrollPosition(100);
    expect(useStore.getState().scrollPosition).toBe(100);
  });

  it('cacheCurrentFileState should save file state', () => {
    useStore.getState().setCurrentFile('/test/note.md', 'Content');
    useStore.getState().setCursorPosition(5, 3);
    useStore.getState().setScrollPosition(50);
    useStore.getState().cacheCurrentFileState();
    
    const state = useStore.getState();
    const cached = state.fileStates.get('/test/note.md');
    expect(cached).toBeDefined();
    expect(cached?.content).toBe('Content');
    expect(cached?.cursorLine).toBe(5);
    expect(cached?.cursorCol).toBe(3);
    expect(cached?.scrollPos).toBe(50);
  });

  it('closeTab should remove tab and switch to adjacent', () => {
    useStore.getState().setCurrentFile('/test/note1.md', 'Content 1');
    useStore.getState().setCurrentFile('/test/note2.md', 'Content 2');
    useStore.getState().setCurrentFile('/test/note3.md', 'Content 3');
    
    useStore.getState().closeTab('/test/note2.md');
    const state = useStore.getState();
    expect(state.openTabs).toEqual(['/test/note1.md', '/test/note3.md']);
  });

  describe('bulk tab closing (tab context menu)', () => {
    beforeEach(() => {
      useStore.getState().setCurrentFile('/test/note1.md', 'Content 1');
      useStore.getState().setCurrentFile('/test/note2.md', 'Content 2');
      useStore.getState().setCurrentFile('/test/note3.md', 'Content 3');
      useStore.getState().setCurrentFile('/test/note4.md', 'Content 4');
    });

    it('closeOtherTabs keeps only the given tab', () => {
      useStore.getState().closeOtherTabs('/test/note2.md');
      const s = useStore.getState();
      expect(s.openTabs).toEqual(['/test/note2.md']);
      expect(s.fileStates.has('/test/note1.md')).toBe(false);
      expect(s.fileStates.has('/test/note3.md')).toBe(false);
    });

    it('closeTabsToLeft removes only tabs before the given one', () => {
      useStore.getState().closeTabsToLeft('/test/note3.md');
      expect(useStore.getState().openTabs).toEqual(['/test/note3.md', '/test/note4.md']);
    });

    it('closeTabsToLeft is a no-op for the first tab', () => {
      useStore.getState().closeTabsToLeft('/test/note1.md');
      expect(useStore.getState().openTabs).toHaveLength(4);
    });

    it('closeTabsToRight removes only tabs after the given one', () => {
      useStore.getState().closeTabsToRight('/test/note2.md');
      expect(useStore.getState().openTabs).toEqual(['/test/note1.md', '/test/note2.md']);
    });

    it('closeTabsToRight is a no-op for the last tab', () => {
      useStore.getState().closeTabsToRight('/test/note4.md');
      expect(useStore.getState().openTabs).toHaveLength(4);
    });

    it('closeAllTabs clears everything', () => {
      useStore.getState().closeAllTabs();
      const s = useStore.getState();
      expect(s.openTabs).toEqual([]);
      expect(s.currentFilePath).toBeNull();
      expect(s.content).toBe('');
    });

    it('closing the current tab in bulk switches to the nearest survivor', () => {
      // Current is note4 (last). Closing all others leaves note4 untouched;
      // then closing to the LEFT of note2 while note4 is current keeps focus.
      useStore.getState().closeTabsToLeft('/test/note2.md');
      const s = useStore.getState();
      expect(s.openTabs).toEqual(['/test/note2.md', '/test/note3.md', '/test/note4.md']);
      expect(s.currentFilePath).toBe('/test/note4.md');
    });

    it('bulk close that includes the current tab picks the neighbor', () => {
      // Current: note4. Close others of note1 -> current removed, switches to note1.
      useStore.getState().closeOtherTabs('/test/note1.md');
      const s = useStore.getState();
      expect(s.openTabs).toEqual(['/test/note1.md']);
      expect(s.currentFilePath).toBe('/test/note1.md');
    });
  });
});

describe('FileTree Slice', () => {
  beforeEach(() => {
    useStore.setState({
      workspacePath: null,
      recentWorkspaces: [],
      tree: [],
      expandedFolders: [],
      isLoading: false,
      selectedFilePath: null,
    });
  });

  it('should initialize with default values', () => {
    const state = useStore.getState();
    expect(state.workspacePath).toBeNull();
    expect(state.recentWorkspaces).toEqual([]);
    expect(state.tree).toEqual([]);
    expect(state.expandedFolders).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.selectedFilePath).toBeNull();
  });

  it('setWorkspace should update workspace and add to recents', () => {
    useStore.getState().setWorkspace('/workspace/project1');
    const state = useStore.getState();
    expect(state.workspacePath).toBe('/workspace/project1');
    expect(state.recentWorkspaces).toContain('/workspace/project1');
  });

  it('setWorkspace should limit recent workspaces to 5', () => {
    for (let i = 1; i <= 6; i++) {
      useStore.getState().setWorkspace(`/workspace/project${i}`);
    }
    const state = useStore.getState();
    expect(state.recentWorkspaces).toHaveLength(5);
    expect(state.recentWorkspaces[0]).toBe('/workspace/project6');
  });

  it('setWorkspace should not duplicate recent workspaces', () => {
    useStore.getState().setWorkspace('/workspace/project1');
    useStore.getState().setWorkspace('/workspace/project2');
    useStore.getState().setWorkspace('/workspace/project1');
    const state = useStore.getState();
    expect(state.recentWorkspaces).toEqual(['/workspace/project1', '/workspace/project2']);
  });

  it('removeRecentWorkspace should remove from recents', () => {
    useStore.getState().setWorkspace('/workspace/project1');
    useStore.getState().setWorkspace('/workspace/project2');
    useStore.getState().removeRecentWorkspace('/workspace/project1');
    const state = useStore.getState();
    expect(state.recentWorkspaces).toEqual(['/workspace/project2']);
  });

  it('setTree should update file tree', () => {
    const tree = [
      { name: 'file1.md', path: '/file1.md', isDir: false },
      { name: 'folder1', path: '/folder1', isDir: true, children: [] },
    ];
    useStore.getState().setTree(tree);
    expect(useStore.getState().tree).toEqual(tree);
  });

  it('toggleFolder should expand folder', () => {
    useStore.getState().toggleFolder('/folder1');
    expect(useStore.getState().expandedFolders).toContain('/folder1');
  });

  it('toggleFolder should collapse expanded folder', () => {
    useStore.getState().toggleFolder('/folder1');
    useStore.getState().toggleFolder('/folder1');
    expect(useStore.getState().expandedFolders).not.toContain('/folder1');
  });

  it('setExpandedFolders should replace expanded folders', () => {
    useStore.getState().setExpandedFolders(['/folder1', '/folder2']);
    expect(useStore.getState().expandedFolders).toEqual(['/folder1', '/folder2']);
  });

  it('setLoading should update loading state', () => {
    useStore.getState().setLoading(true);
    expect(useStore.getState().isLoading).toBe(true);
    useStore.getState().setLoading(false);
    expect(useStore.getState().isLoading).toBe(false);
  });

  describe('setFolderChildren (lazy tree merge)', () => {
    beforeEach(() => {
      useStore.setState({
        tree: [
          { name: 'a.md', path: '/ws/a.md', isDir: false },
          {
            name: 'dir', path: '/ws/dir', isDir: true,
            children: [
              { name: 'sub', path: '/ws/dir/sub', isDir: true }, // not loaded yet (no children key)
            ],
          },
          { name: 'lazy', path: '/ws/lazy', isDir: true }, // children: undefined = not loaded
        ],
      });
    });

    it('attaches children to a top-level folder', () => {
      useStore.getState().setFolderChildren('/ws/lazy', [{ name: 'note.md', path: '/ws/lazy/note.md', isDir: false }]);
      const node = useStore.getState().tree.find(n => n.path === '/ws/lazy');
      expect(node?.children).toHaveLength(1);
      expect(node?.children?.[0].name).toBe('note.md');
    });

    it('attaches children to a NESTED folder', () => {
      useStore.getState().setFolderChildren('/ws/dir/sub', [{ name: 'deep.md', path: '/ws/dir/sub/deep.md', isDir: false }]);
      const dir = useStore.getState().tree.find(n => n.path === '/ws/dir');
      const sub = dir?.children?.find(n => n.path === '/ws/dir/sub');
      expect(sub?.children?.[0].name).toBe('deep.md');
    });

    it('leaves unrelated nodes untouched (same reference)', () => {
      const before = useStore.getState().tree;
      useStore.getState().setFolderChildren('/ws/lazy', []);
      const after = useStore.getState().tree;
      expect(after.find(n => n.path === '/ws/a.md')).toBe(before.find(n => n.path === '/ws/a.md'));
      expect(after.find(n => n.path === '/ws/dir')).toBe(before.find(n => n.path === '/ws/dir'));
    });

    it('marks an empty folder as loaded (children = [])', () => {
      useStore.getState().setFolderChildren('/ws/lazy', []);
      const node = useStore.getState().tree.find(n => n.path === '/ws/lazy');
      expect(node?.children).toEqual([]); // NOT undefined — spinner must stop
    });
  });

  it('setSelectedFile should update selected file', () => {
    useStore.getState().setSelectedFile('/test/note.md');
    expect(useStore.getState().selectedFilePath).toBe('/test/note.md');
  });
});
