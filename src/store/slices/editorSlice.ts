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
  fileStates: Map<string, FileEditorState>;
  /** Paths of open tabs, in display order */
  openTabs: string[];
  setCurrentFile: (path: string | null, content: string) => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setSourceMode: (mode: boolean) => void;
  setCursorPosition: (line: number, col: number) => void;
  setScrollPosition: (pos: number) => void;
  cacheCurrentFileState: () => void;
  restoreFileState: (path: string) => FileEditorState | null;
  setOpenTabs: (tabs: string[]) => void;
  switchTab: (path: string) => void;
  closeTab: (path: string) => void;
  editorRef: { current: any } | null;
  setEditorRef: (ref: { current: any } | null) => void;
}

export const createEditorSlice: StateCreator<EditorSlice, [], [], EditorSlice> = (set, get) => ({
  currentFilePath: null,
  content: "",
  isDirty: false,
  sourceMode: false,
  cursorLine: 1,
  cursorCol: 1,
  scrollPosition: 0,
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
  closeTab: (path) => {
    const s = get();
    const tabs = s.openTabs.filter(p => p !== path);
    const states = new Map(s.fileStates);
    states.delete(path);
    if (s.currentFilePath === path) {
      const idx = s.openTabs.indexOf(path);
      const next = tabs[Math.min(idx, tabs.length - 1)] ?? null;
      // Clear the current file FIRST so cacheCurrentFileState (triggered by
      // editor unmount / setCurrentFile) cannot resurrect the closed file's state.
      set({ currentFilePath: null, content: "", isDirty: false, openTabs: tabs, fileStates: states });
      if (next) get().switchTab(next);
    } else {
      set({ openTabs: tabs, fileStates: states });
    }
  },
  editorRef: null,
  setEditorRef: (ref) => set({ editorRef: ref }),
});
