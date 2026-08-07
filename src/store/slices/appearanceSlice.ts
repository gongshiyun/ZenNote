/**
 * Appearance Slice — theme, font, and editor configuration.
 */
import type { StateCreator } from "zustand";
import type { ThemeMode } from "../../domain";

export interface ThemeSlice {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  themeId: string;
  fontFamily: string;
  setMode: (mode: ThemeMode) => void;
  setResolvedMode: (mode: "light" | "dark") => void;
  setThemeId: (id: string) => void;
  setFontFamily: (f: string) => void;
}

export interface ConfigSlice {
  fontSize: number;
  tabSize: number;
  editorPadding: number; // left/right padding (px) of the editor page
  autoSaveDelay: number;
  showHiddenFiles: boolean;
  showFileExtensions: boolean;
  defaultSourceMode: boolean;
  setFontSize: (n: number) => void;
  setTabSize: (n: number) => void;
  setEditorPadding: (n: number) => void;
  setAutoSaveDelay: (n: number) => void;
  setShowHiddenFiles: (v: boolean) => void;
  setShowFileExtensions: (v: boolean) => void;
  setDefaultSourceMode: (v: boolean) => void;
}

export const createThemeSlice: StateCreator<ThemeSlice, [], [], ThemeSlice> = (set) => ({
  mode: "system",
  resolvedMode: "light",
  themeId: "zen",
  fontFamily: "sans",
  setMode: (mode) => set({ mode }),
  setResolvedMode: (mode) => set({ resolvedMode: mode }),
  setThemeId: (id) => set({ themeId: id }),
  setFontFamily: (f) => set({ fontFamily: f }),
});

export const createConfigSlice: StateCreator<ConfigSlice, [], [], ConfigSlice> = (set) => ({
  fontSize: 16,
  tabSize: 2,
  editorPadding: 80,
  autoSaveDelay: 0,
  showHiddenFiles: false,
  showFileExtensions: true,
  defaultSourceMode: false,
  setFontSize: (n) => set({ fontSize: n }),
  setTabSize: (n) => set({ tabSize: n }),
  setEditorPadding: (n) => set({ editorPadding: n }),
  setAutoSaveDelay: (n) => set({ autoSaveDelay: n }),
  setShowHiddenFiles: (v) => set({ showHiddenFiles: v }),
  setShowFileExtensions: (v) => set({ showFileExtensions: v }),
  setDefaultSourceMode: (v) => set({ defaultSourceMode: v }),
});
