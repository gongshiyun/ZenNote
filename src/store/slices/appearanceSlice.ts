/**
 * Appearance Slice — display mode, font, and editor configuration.
 *
 * The product has ONE design language (Claude Code desktop): warm canvas, clay
 * accent, serif structure titles. Only light / dark / system differ, so there is
 * no colour-theme catalogue any more — that abstraction forced every component
 * to be theme-agnostic and produced six half-finished palettes.
 */
import type { StateCreator } from "zustand";
import type { ThemeMode } from "../../domain";

export interface AppearanceSlice {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  fontFamily: string;
  setMode: (mode: ThemeMode) => void;
  setResolvedMode: (mode: "light" | "dark") => void;
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

export const DEFAULT_AUTO_SAVE_DELAY = 500;

export const createAppearanceSlice: StateCreator<AppearanceSlice, [], [], AppearanceSlice> = (set) => ({
  mode: "system",
  resolvedMode: "light",
  fontFamily: "claude",
  setMode: (mode) => set({ mode }),
  setResolvedMode: (mode) => set({ resolvedMode: mode }),
  setFontFamily: (f) => set({ fontFamily: f }),
});

export const createConfigSlice: StateCreator<ConfigSlice, [], [], ConfigSlice> = (set) => ({
  fontSize: 16,
  tabSize: 2,
  editorPadding: 80,
  autoSaveDelay: DEFAULT_AUTO_SAVE_DELAY,
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
