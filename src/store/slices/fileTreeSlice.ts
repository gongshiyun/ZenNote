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
  toggleFolder: (path: string) => void;
  setExpandedFolders: (paths: string[]) => void;
  setLoading: (loading: boolean) => void;
  setSelectedFile: (path: string | null) => void;
}

export interface OutlineSlice {
  headings: Heading[];
  activeHeadingId: string | null;
  setHeadings: (headings: Heading[]) => void;
  setActiveHeading: (id: string | null) => void;
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
  setHeadings: (headings) => set({ headings }),
  setActiveHeading: (id) => set({ activeHeadingId: id }),
});
