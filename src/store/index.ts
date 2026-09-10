/**
 * Store — composition root.
 * Assembles all bounded-context slices into a single zustand store.
 * Components continue to use `useStore` unchanged.
 */
import { create } from "zustand";
import type { FileEditorState } from "../domain";

import { createEditorSlice, type EditorSlice } from "./slices/editorSlice";
import { createFileTreeSlice, createOutlineSlice, type FileTreeSlice, type OutlineSlice } from "./slices/fileTreeSlice";
import { createThemeSlice, createConfigSlice, type ThemeSlice, type ConfigSlice } from "./slices/appearanceSlice";
import { createLocaleSlice, createUpdateSlice, createUISlice, type LocaleSlice, type UpdateSlice, type UISlice } from "./slices/systemSlice";
import { affectedOpenPaths, remapPathPrefix } from "../lib/filePaths";

// Re-export domain types so existing `import { FileNode } from "../store"` still works.
export type { FileNode, Heading, ThemeMode, UpdateState } from "../domain";

// Re-export slice interfaces for consumers that need them.
export type { EditorSlice, FileTreeSlice, OutlineSlice, ThemeSlice, ConfigSlice, LocaleSlice, UpdateSlice, UISlice };

export type AppStore = EditorSlice
  & FileTreeSlice
  & OutlineSlice
  & ThemeSlice
  & ConfigSlice
  & LocaleSlice
  & UpdateSlice
  & UISlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createEditorSlice(...a),
  ...createFileTreeSlice(...a),
  ...createOutlineSlice(...a),
  ...createThemeSlice(...a),
  ...createConfigSlice(...a),
  ...createLocaleSlice(...a),
  ...createUpdateSlice(...a),
  ...createUISlice(...a),
}));

function remapPath(path: string | null, oldPrefix: string, newPrefix: string): string | null {
  if (!path) return null;
  return remapPathPrefix(path, oldPrefix, newPrefix);
}

/** Keep open documents and file-tree identity in sync after a rename/move. */
export function remapWorkspacePaths(oldPath: string, newPath: string): void {
  useStore.setState((s) => {
    const openTabs = s.openTabs.map(path => remapPath(path, oldPath, newPath) as string);
    const fileStates = new Map<string, FileEditorState>();
    for (const [path, state] of s.fileStates) {
      fileStates.set(remapPath(path, oldPath, newPath) as string, state);
    }
    const externalConflict = s.externalConflict
      ? { ...s.externalConflict, path: remapPath(s.externalConflict.path, oldPath, newPath) as string }
      : null;
    return {
      currentFilePath: remapPath(s.currentFilePath, oldPath, newPath),
      selectedFilePath: remapPath(s.selectedFilePath, oldPath, newPath),
      openTabs,
      fileStates,
      expandedFolders: s.expandedFolders.map(path => remapPath(path, oldPath, newPath) as string),
      externalConflict,
    };
  });
}

/** Remove documents and tree identity that no longer exist after a deletion. */
export function removeWorkspacePaths(path: string): void {
  useStore.setState((s) => {
    const removed = new Set(affectedOpenPaths(
      [...s.openTabs, ...(s.currentFilePath ? [s.currentFilePath] : [])],
      path,
    ));
    const fileStates = new Map(s.fileStates);
    for (const openPath of removed) fileStates.delete(openPath);
    const selectedRemoved = !!s.selectedFilePath &&
      affectedOpenPaths([s.selectedFilePath], path).length > 0;
    const removedFolders = new Set(affectedOpenPaths(s.expandedFolders, path));
    const conflictRemoved = !!s.externalConflict &&
      affectedOpenPaths([s.externalConflict.path], path).length > 0;
    return {
      openTabs: s.openTabs.filter(openPath => !removed.has(openPath)),
      fileStates,
      currentFilePath: removed.has(s.currentFilePath ?? "") ? null : s.currentFilePath,
      content: removed.has(s.currentFilePath ?? "") ? "" : s.content,
      isDirty: removed.has(s.currentFilePath ?? "") ? false : s.isDirty,
      selectedFilePath: selectedRemoved ? null : s.selectedFilePath,
      expandedFolders: s.expandedFolders.filter(folder => !removedFolders.has(folder)),
      externalConflict: conflictRemoved ? null : s.externalConflict,
      documentRequestId: s.documentRequestId + 1,
    };
  });
}
