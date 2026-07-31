/**
 * Editor Slice — document editing state (content, cursor, file switching).
 */
import type { StateCreator } from "zustand";
import type { FileEditorState } from "../../domain";

export interface EditorSlice {
  currentFilePath: string | null;
  content: string;
  isDirty: boolean;
  sourceMode: boolean;
  cursorLine: number;
  cursorCol: number;
  scrollPosition: number;
  fileStates: Map<string, FileEditorState>;
  setCurrentFile: (path: string | null, content: string) => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setSourceMode: (mode: boolean) => void;
  setCursorPosition: (line: number, col: number) => void;
  setScrollPosition: (pos: number) => void;
  cacheCurrentFileState: () => void;
  restoreFileState: (path: string) => FileEditorState | null;
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
  editorRef: null,
  setEditorRef: (ref) => set({ editorRef: ref }),
});
