import { create } from "zustand";
import { getLocale } from "../i18n";

// ---- Types ----
export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface Heading {
  level: number;
  text: string;
  pos: number;
}

export type ThemeMode = "light" | "dark" | "system";

// ---- Slices ----

interface EditorSlice {
  currentFilePath: string | null;
  content: string;
  isDirty: boolean;
  sourceMode: boolean;
  cursorLine: number;
  cursorCol: number;
  scrollPosition: number;
  fileStates: Map<string, { content: string; scrollPos: number; cursorLine: number; cursorCol: number }>;
  setCurrentFile: (path: string | null, content: string) => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setSourceMode: (mode: boolean) => void;
  setCursorPosition: (line: number, col: number) => void;
  setScrollPosition: (pos: number) => void;
  cacheCurrentFileState: () => void;
  restoreFileState: (path: string) => { content: string; scrollPos: number; cursorLine: number; cursorCol: number } | null;
  editorRef: { current: any } | null;
  setEditorRef: (ref: { current: any } | null) => void;
}

interface FileTreeSlice {
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

interface OutlineSlice {
  headings: Heading[];
  activeHeadingId: string | null;
  setHeadings: (headings: Heading[]) => void;
  setActiveHeading: (id: string | null) => void;
}

interface ThemeSlice {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  themeId: string;
  fontFamily: string;
  setMode: (mode: ThemeMode) => void;
  setResolvedMode: (mode: "light" | "dark") => void;
  setThemeId: (id: string) => void;
  setFontFamily: (f: string) => void;
}

interface ConfigSlice {
  fontSize: number;
  tabSize: number;
  autoSaveDelay: number;
  showHiddenFiles: boolean;
  showFileExtensions: boolean;
  defaultSourceMode: boolean;
  setFontSize: (n: number) => void;
  setTabSize: (n: number) => void;
  setAutoSaveDelay: (n: number) => void;
  setShowHiddenFiles: (v: boolean) => void;
  setShowFileExtensions: (v: boolean) => void;
  setDefaultSourceMode: (v: boolean) => void;
}

interface LocaleSlice {
  locale: string;
  setLocale: (locale: string) => void;
}

export type UpdateState = "idle" | "checking" | "downloading" | "ready" | "error";

interface UpdateSlice {
  autoCheckUpdate: boolean;
  updateCheckInterval: number; // minutes
  updateState: UpdateState;
  updateVersion: string | null;
  setAutoCheckUpdate: (v: boolean) => void;
  setUpdateCheckInterval: (n: number) => void;
  setUpdateState: (s: UpdateState) => void;
  setUpdateVersion: (v: string | null) => void;
}

interface UIState {
  sidebarVisible: boolean;
  outlineVisible: boolean;
  searchVisible: boolean;
  settingsVisible: boolean;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  setSearchVisible: (visible: boolean) => void;
  setSettingsVisible: (visible: boolean) => void;
}

// ---- Store ----

export const useStore = create<EditorSlice & FileTreeSlice & OutlineSlice & ThemeSlice & ConfigSlice & UIState & LocaleSlice & UpdateSlice>((set, get) => ({
  // Editor
  currentFilePath: null,
  content: "",
  isDirty: false,
  sourceMode: false,
  cursorLine: 1,
  cursorCol: 1,
  scrollPosition: 0,
  fileStates: new Map(),

  setCurrentFile: (path, content) => {
    const prev = get().currentFilePath;
    if (prev) get().cacheCurrentFileState();
    const restored = path ? get().restoreFileState(path) : null;
    set({
      currentFilePath: path,
      content: restored ? restored.content : content,
      isDirty: false,
      scrollPosition: restored ? restored.scrollPos : 0,
      cursorLine: restored ? restored.cursorLine : 1,
      cursorCol: restored ? restored.cursorCol : 1,
    });
  },
  setContent: (content) => set({ content, isDirty: true }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setSourceMode: (mode) => set({ sourceMode: mode }),
  setCursorPosition: (line, col) => {
    const s = get();
    if (s.cursorLine !== line || s.cursorCol !== col) set({ cursorLine: line, cursorCol: col });
  },
  setScrollPosition: (pos) => set({ scrollPosition: pos }),
  cacheCurrentFileState: () => {
    const { currentFilePath, content, scrollPosition, cursorLine, cursorCol, fileStates } = get();
    if (currentFilePath) {
      const next = new Map(fileStates);
      next.set(currentFilePath, { content, scrollPos: scrollPosition, cursorLine, cursorCol });
      set({ fileStates: next });
    }
  },
  restoreFileState: (path) => {
    const state = get().fileStates.get(path);
    return state ?? null;
  },
  // Editor ref (for mermaid rendering and other ProseMirror access)
  editorRef: null,
  setEditorRef: (ref) => set({ editorRef: ref }),


  // FileTree
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

  // Outline
  headings: [],
  activeHeadingId: null,
  setHeadings: (headings) => set({ headings }),
  setActiveHeading: (id) => set({ activeHeadingId: id }),

  // Theme
  mode: "system",
  resolvedMode: "light",
  themeId: "zen",
  fontFamily: "sans",
  setMode: (mode) => set({ mode }),
  setResolvedMode: (mode) => set({ resolvedMode: mode }),
  setThemeId: (id) => set({ themeId: id }),
  setFontFamily: (f) => set({ fontFamily: f }),

  // Config
  fontSize: 16,
  tabSize: 2,
  autoSaveDelay: 0,  // 0 = disabled
  showHiddenFiles: false,
  showFileExtensions: true,
  defaultSourceMode: false,
  setFontSize: (n) => set({ fontSize: n }),
  setTabSize: (n) => set({ tabSize: n }),
  setAutoSaveDelay: (n) => set({ autoSaveDelay: n }),
  setShowHiddenFiles: (v) => set({ showHiddenFiles: v }),
  setShowFileExtensions: (v) => set({ showFileExtensions: v }),
  setDefaultSourceMode: (v) => set({ defaultSourceMode: v }),

  // Locale (init from persisted i18n module value to avoid mismatch on restart)
  locale: getLocale(),
  setLocale: (locale) => set({ locale }),

  // Updater
  autoCheckUpdate: true,
  updateCheckInterval: 60, // minutes (default: 1 hour)
  updateState: "idle",
  updateVersion: null,
  setAutoCheckUpdate: (v) => set({ autoCheckUpdate: v }),
  setUpdateCheckInterval: (n) => set({ updateCheckInterval: n }),
  setUpdateState: (s) => set({ updateState: s }),
  setUpdateVersion: (v) => set({ updateVersion: v }),

  // UI
  sidebarVisible: true,
  outlineVisible: true,
  searchVisible: false,
  settingsVisible: false,
  toggleSidebar: () => set(s => ({ sidebarVisible: !s.sidebarVisible })),
  toggleOutline: () => set(s => ({ outlineVisible: !s.outlineVisible })),
  setSearchVisible: (visible) => set({ searchVisible: visible }),
  setSettingsVisible: (visible) => set({ settingsVisible: visible }),
}));
