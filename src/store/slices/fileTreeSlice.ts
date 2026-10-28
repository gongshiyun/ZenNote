/**
 * FileTree Slice — workspace and file tree state.
 */
import type { StateCreator } from "zustand";
import type { FileNode, Heading } from "../../domain";

export interface FileTreeSlice {
  workspacePath: string | null;
  recentWorkspaces: string[];
  tree: FileNode[];
  expandedFolders: string[];
  isLoading: boolean;
  selectedFilePath: string | null;
  setWorkspace: (path: string) => void;
  setRecentWorkspaces: (paths: string[]) => void;
  removeRecentWorkspace: (path: string) => void;
  setTree: (tree: FileNode[]) => void;
  /** Merge lazily-loaded children into the folder at `path` (lazy tree). */
  setFolderChildren: (path: string, children: FileNode[]) => void;
  toggleFolder: (path: string) => void;
  setExpandedFolders: (paths: string[]) => void;
  setLoading: (loading: boolean) => void;
  setSelectedFile: (path: string | null) => void;
}

export interface OutlineSlice {
  headings: Heading[];
  activeHeadingId: string | null;
  /**
   * One-shot request from the outline panel to move the editor caret to a
   * heading. CodeMirror owns the document offsets, so the panel cannot scroll
   * the (virtualised) rendered DOM by itself; the editor consumes this request
   * and maps the heading's source line to a real position.
   */
  headingJumpRequest: { pos: number; ts: number } | null;
  setHeadings: (headings: Heading[]) => void;
  setActiveHeading: (id: string | null) => void;
  requestHeadingJump: (pos: number) => void;
}

// Immutably attach `children` to the folder node whose path matches, at any
// depth. Reference-stable: subtrees that don't contain the target path are
// returned as-is (keeps memoized tree nodes from re-rendering needlessly).
function mergeChildren(nodes: FileNode[], path: string, children: FileNode[]): FileNode[] {
  let changed = false;
  const out = nodes.map(n => {
    if (n.path === path) { changed = true; return { ...n, children }; }
    if (n.isDir && n.children) {
      const merged = mergeChildren(n.children, path, children);
      if (merged !== n.children) { changed = true; return { ...n, children: merged }; }
    }
    return n;
  });
  return changed ? out : nodes;
}

export const createFileTreeSlice: StateCreator<FileTreeSlice, [], [], FileTreeSlice> = (set, get) => ({
  workspacePath: null,
  recentWorkspaces: [],
  tree: [],
  expandedFolders: [],
  isLoading: false,
  selectedFilePath: null,

  setWorkspace: (path) => {
    const recents = get().recentWorkspaces.filter(p => p !== path);
    recents.unshift(path);
    set({ workspacePath: path, recentWorkspaces: recents.slice(0, 5) });
  },
  setRecentWorkspaces: (paths) => set({ recentWorkspaces: paths }),
  removeRecentWorkspace: (path) => set({ recentWorkspaces: get().recentWorkspaces.filter(p => p !== path) }),
  setTree: (tree) => set({ tree }),
  setFolderChildren: (path, children) => set({ tree: mergeChildren(get().tree, path, children) }),
  toggleFolder: (path) => {
    const expanded = [...get().expandedFolders];
    const idx = expanded.indexOf(path);
    if (idx >= 0) expanded.splice(idx, 1);
    else expanded.push(path);
    set({ expandedFolders: expanded });
  },
  setExpandedFolders: (paths) => set({ expandedFolders: paths }),
  setLoading: (loading) => set({ isLoading: loading }),
  setSelectedFile: (path) => set({ selectedFilePath: path }),
});

export const createOutlineSlice: StateCreator<OutlineSlice, [], [], OutlineSlice> = (set) => ({
  headings: [],
  activeHeadingId: null,
  headingJumpRequest: null,
  setHeadings: (headings) => set({ headings }),
  setActiveHeading: (id) => set({ activeHeadingId: id }),
  requestHeadingJump: (pos) => set({ headingJumpRequest: { pos, ts: Date.now() } }),
});
