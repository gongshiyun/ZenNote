/**
 * Editor Slice — document editing state (content, cursor, file switching, tabs).
 */
import type { StateCreator } from "zustand";
import type { EditorSelectionSnapshot, FileEditorState } from "../../domain";
import { readFile } from "../../services";

export interface ExternalDocumentConflict {
  path: string;
  diskContent: string | null;
  reason: "modified" | "deleted";
}

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
  /** Monotonic token used to discard stale asynchronous document opens. */
  documentRequestId: number;
  externalConflict: ExternalDocumentConflict | null;
  pmSelection: EditorSelectionSnapshot | null;
  cmSelection: EditorSelectionSnapshot | null;
  selectionCharCount: number;
  selectionWordCount: number;
  setCurrentFile: (path: string | null, content: string) => void;
  openDocument: (
    path: string,
    content?: string,
    options?: { sourceMode?: boolean },
  ) => Promise<boolean>;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setSourceMode: (mode: boolean) => void;
  setCursorPosition: (line: number, col: number) => void;
  setScrollPosition: (pos: number) => void;
  setLastSavedAt: (ts: number | null) => void;
  /** Marks a successful disk snapshot without clobbering newer in-memory edits. */
  markSavedSnapshot: (path: string, content: string) => void;
  cacheCurrentFileState: () => void;
  restoreFileState: (path: string) => FileEditorState | null;
  setOpenTabs: (tabs: string[]) => void;
  switchTab: (path: string) => void;
  closeTab: (path: string) => void;
  /** Bumped when the CURRENT file is reloaded from disk (external change).
   * The editor effect includes it in its deps so the document is swapped in
   * place via the instance-reuse path. */
  reloadTick: number;
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
  setExternalConflict: (conflict: ExternalDocumentConflict | null) => void;
  setPmSelection: (selection: EditorSelectionSnapshot | null) => void;
  setCmSelection: (selection: EditorSelectionSnapshot | null) => void;
  setSelectionStats: (charCount: number, wordCount: number) => void;
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
  const nextRequestId = s.documentRequestId + 1;
  const tabs = s.openTabs.filter(p => !removeSet.has(p));
  const states = new Map(s.fileStates);
  for (const p of removeSet) states.delete(p);
  if (s.currentFilePath && removeSet.has(s.currentFilePath)) {
    const idx = s.openTabs.indexOf(s.currentFilePath);
    const next = tabs[Math.min(idx, tabs.length - 1)] ?? null;
    // Clear the current file FIRST so cacheCurrentFileState (triggered by
    // editor unmount / setCurrentFile) cannot resurrect a closed file's state.
    set({
      currentFilePath: null,
      content: "",
      isDirty: false,
      lastSavedAt: null,
      openTabs: tabs,
      fileStates: states,
      documentRequestId: nextRequestId,
      externalConflict: null,
      pmSelection: null,
      cmSelection: null,
      selectionCharCount: 0,
      selectionWordCount: 0,
    });
    if (next) get().switchTab(next);
  } else {
    set({
      openTabs: tabs,
      fileStates: states,
      documentRequestId: nextRequestId,
      externalConflict: s.externalConflict && removeSet.has(s.externalConflict.path)
        ? null
        : s.externalConflict,
    });
  }
}

/** 干净（已保存）文件状态的缓存上限：超出后逐出最旧的干净条目，控制内存
 * 占用不随标签页数无限增长。脏条目永不逐出（承载未保存内容）；被逐出的
 * 干净文件切回时由 switchTab 从磁盘重读（既有路径）。 */
const MAX_CACHED_CLEAN_FILES = 16;

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
  reloadTick: 0,
  documentRequestId: 0,
  externalConflict: null,
  pmSelection: null,
  cmSelection: null,
  selectionCharCount: 0,
  selectionWordCount: 0,

  setCurrentFile: (path, content) => {
    const prev = get().currentFilePath;
    const previousPmSelection = get().pmSelection;
    const previousCmSelection = get().cmSelection;
    if (prev) get().cacheCurrentFileState();
    const restored = path && path !== prev ? get().restoreFileState(path) : null;
    const tabs = get().openTabs;
    set({
      currentFilePath: path,
      content: restored ? restored.content : content,
      isDirty: restored ? !!restored.dirty : false,
      scrollPosition: restored ? restored.scrollPos : 0,
      cursorLine: restored ? restored.cursorLine : 1,
      cursorCol: restored ? restored.cursorCol : 1,
      lastSavedAt: null,
      pmSelection: path === prev ? previousPmSelection : restored?.pmSelection ?? null,
      cmSelection: path === prev ? previousCmSelection : restored?.cmSelection ?? null,
      selectionCharCount: 0,
      selectionWordCount: 0,
      openTabs: path && !tabs.includes(path) ? [...tabs, path] : tabs,
    });
  },
  openDocument: async (path, content, options) => {
    const requestId = get().documentRequestId + 1;
    const previousPath = get().currentFilePath;
    set({ documentRequestId: requestId });

    let nextContent = content;
    if (nextContent === undefined) {
      try {
        nextContent = await readFile(path);
      } catch {
        return false;
      }
    }
    if (get().documentRequestId !== requestId) return false;

    get().setCurrentFile(path, nextContent);
    if (options?.sourceMode !== undefined && previousPath !== path) {
      set({ sourceMode: options.sourceMode });
    }
    return true;
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
  markSavedSnapshot: (path, content) => {
    const s = get();
    if (s.currentFilePath === path) {
      if (s.content !== content) return;
      set({ isDirty: false, lastSavedAt: Date.now() });
      return;
    }
    const cached = s.fileStates.get(path);
    if (!cached || cached.content !== content || !cached.dirty) return;
    const next = new Map(s.fileStates);
    next.set(path, { ...cached, dirty: false });
    set({ fileStates: next });
  },
  cacheCurrentFileState: () => {
    const {
      currentFilePath,
      content,
      scrollPosition,
      cursorLine,
      cursorCol,
      fileStates,
      isDirty,
      pmSelection,
      cmSelection,
    } = get();
    if (currentFilePath) {
      const next = new Map(fileStates);
      next.set(currentFilePath, {
        content,
        scrollPos: scrollPosition,
        cursorLine,
        cursorCol,
        dirty: isDirty,
        pmSelection,
        cmSelection,
      });
      // Map 迭代顺序 = 插入顺序，从最旧的干净条目开始逐出（当前文件除外）。
      for (const [p, st] of next) {
        if (next.size <= MAX_CACHED_CLEAN_FILES) break;
        if (p !== currentFilePath && !st.dirty) next.delete(p);
      }
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
      set({ documentRequestId: s.documentRequestId + 1 });
      s.setCurrentFile(path, cached.content);
    } else {
      void s.openDocument(path);
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
  setExternalConflict: (conflict) => set({ externalConflict: conflict }),
  setPmSelection: (selection) => set({ pmSelection: selection }),
  setCmSelection: (selection) => set({ cmSelection: selection }),
  setSelectionStats: (charCount, wordCount) => set({
    selectionCharCount: charCount,
    selectionWordCount: wordCount,
  }),
});
