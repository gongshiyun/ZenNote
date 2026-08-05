/**
 * Editor Slice — document editing state (content, cursor, file switching, tabs).
 */
import type { StateCreator } from "zustand";
import type { FileEditorState } from "../../domain";
import { readFile } from "../../services";

export interface EditorSlice {
  currentFilePath: string | null;
  content: string;
  isDirty: boolean;
  sourceMode: boolean;
  cursorLine: number;
  cursorCol: number;
  scrollPosition: number;
  /** Timestamp (ms) of the last successful save; null when never saved this session */
  lastSavedAt: number | null;
  fileStates: Map<string, FileEditorState>;
  /** Paths of open tabs, in display order */
  openTabs: string[];
  setCurrentFile: (path: string | null, content: string) => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setSourceMode: (mode: boolean) => void;
  setCursorPosition: (line: number, col: number) => void;
  setScrollPosition: (pos: number) => void;
  setLastSavedAt: (ts: number | null) => void;
  cacheCurrentFileState: () => void;
  restoreFileState: (path: string) => FileEditorState | null;
  setOpenTabs: (tabs: string[]) => void;
  switchTab: (path: string) => void;
  closeTab: (path: string) => void;
  /** Close every tab except the given one. */
  closeOtherTabs: (path: string) => void;
  /** Close all tabs positioned left of the given tab. */
  closeTabsToLeft: (path: string) => void;
  /** Close all tabs positioned right of the given tab. */
  closeTabsToRight: (path: string) => void;
  /** Close every open tab. */
  closeAllTabs: () => void;
  editorRef: { current: any } | null;
  setEditorRef: (ref: { current: any } | null) => void;
}

// Shared implementation for single/bulk tab closing: removes the given paths
// from openTabs + fileStates; when the CURRENT tab is among them, clears the
// editor and switches to the nearest surviving tab (same neighbor logic as a
// single close).
function removeTabsImpl(
  get: () => EditorSlice,
  set: (partial: Partial<EditorSlice>) => void,
  removeSet: Set<string>,
): void {
  if (removeSet.size === 0) return;
  const s = get();
  const tabs = s.openTabs.filter(p => !removeSet.has(p));
  const states = new Map(s.fileStates);
  for (const p of removeSet) states.delete(p);
  if (s.currentFilePath && removeSet.has(s.currentFilePath)) {
    const idx = s.openTabs.indexOf(s.currentFilePath);
    const next = tabs[Math.min(idx, tabs.length - 1)] ?? null;
    // Clear the current file FIRST so cacheCurrentFileState (triggered by
    // editor unmount / setCurrentFile) cannot resurrect a closed file's state.
    set({ currentFilePath: null, content: "", isDirty: false, lastSavedAt: null, openTabs: tabs, fileStates: states });
    if (next) get().switchTab(next);
  } else {
    set({ openTabs: tabs, fileStates: states });
  }
}

export const createEditorSlice: StateCreator<EditorSlice, [], [], EditorSlice> = (set, get) => ({
  currentFilePath: null,
  content: "",
  isDirty: false,
  sourceMode: false,
  cursorLine: 1,
  cursorCol: 1,
  scrollPosition: 0,
  lastSavedAt: null,
  fileStates: new Map(),
  openTabs: [],

  setCurrentFile: (path, content) => {
    const prev = get().currentFilePath;
    if (prev) get().cacheCurrentFileState();
    const restored = path ? get().restoreFileState(path) : null;
    const tabs = get().openTabs;
    set({
      currentFilePath: path,
      content: restored ? restored.content : content,
      isDirty: restored ? !!restored.dirty : false,
      scrollPosition: restored ? restored.scrollPos : 0,
      cursorLine: restored ? restored.cursorLine : 1,
      cursorCol: restored ? restored.cursorCol : 1,
      lastSavedAt: null,
      openTabs: path && !tabs.includes(path) ? [...tabs, path] : tabs,
    });
  },
  setContent: (content) => set({ content, isDirty: true }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setSourceMode: (mode) => set({ sourceMode: mode }),
  setCursorPosition: (line, col) => {
    const s = get();
    if (s.cursorLine !== line || s.cursorCol !== col) set({ cursorLine: line, cursorCol: col });
  },
  setScrollPosition: (pos) => {
    // Guard: the editor saves scroll position on a 3s interval; skip no-op
    // updates so subscribers aren't re-notified while the user is idle.
    if (get().scrollPosition !== pos) set({ scrollPosition: pos });
  },
  setLastSavedAt: (ts) => set({ lastSavedAt: ts }),
  cacheCurrentFileState: () => {
    const { currentFilePath, content, scrollPosition, cursorLine, cursorCol, fileStates, isDirty } = get();
    if (currentFilePath) {
      const next = new Map(fileStates);
      next.set(currentFilePath, { content, scrollPos: scrollPosition, cursorLine, cursorCol, dirty: isDirty });
      set({ fileStates: next });
    }
  },
  restoreFileState: (path) => {
    const state = get().fileStates.get(path);
    return state ?? null;
  },
  setOpenTabs: (tabs) => set({ openTabs: tabs }),
  switchTab: (path) => {
    const s = get();
    if (!path || path === s.currentFilePath) return;
    const cached = s.fileStates.get(path);
    if (cached) {
      s.setCurrentFile(path, cached.content);
    } else {
      readFile(path)
        .then(content => get().setCurrentFile(path, content))
        .catch(() => {});
    }
  },
  closeTab: (path) => removeTabsImpl(get, set, new Set([path])),
  closeOtherTabs: (path) => {
    const others = get().openTabs.filter(p => p !== path);
    removeTabsImpl(get, set, new Set(others));
  },
  closeTabsToLeft: (path) => {
    const tabs = get().openTabs;
    const idx = tabs.indexOf(path);
    if (idx <= 0) return;
    removeTabsImpl(get, set, new Set(tabs.slice(0, idx)));
  },
  closeTabsToRight: (path) => {
    const tabs = get().openTabs;
    const idx = tabs.indexOf(path);
    if (idx < 0 || idx >= tabs.length - 1) return;
    removeTabsImpl(get, set, new Set(tabs.slice(idx + 1)));
  },
  closeAllTabs: () => {
    removeTabsImpl(get, set, new Set(get().openTabs));
  },
  editorRef: null,
  setEditorRef: (ref) => set({ editorRef: ref }),
});
