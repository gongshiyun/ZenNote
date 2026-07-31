/**
 * Store — composition root.
 * Assembles all bounded-context slices into a single zustand store.
 * Components continue to use `useStore` unchanged.
 */
import { create } from "zustand";

import { createEditorSlice, type EditorSlice } from "./slices/editorSlice";
import { createFileTreeSlice, createOutlineSlice, type FileTreeSlice, type OutlineSlice } from "./slices/fileTreeSlice";
import { createThemeSlice, createConfigSlice, type ThemeSlice, type ConfigSlice } from "./slices/appearanceSlice";
import { createLocaleSlice, createUpdateSlice, createUISlice, type LocaleSlice, type UpdateSlice, type UISlice } from "./slices/systemSlice";

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
