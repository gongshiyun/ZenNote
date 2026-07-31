/**
 * ZenNote Domain Types — Single Source of Truth
 *
 * Organized by bounded context:
 *   - FileSystem: workspace, file tree, file nodes
 *   - Document:   editor content, headings, cursor
 *   - Appearance: theme, font, display mode
 *   - System:     app config, updater, locale
 */

// ═══════════════════════════════════════════
// FileSystem Context
// ═══════════════════════════════════════════

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

// ═══════════════════════════════════════════
// Document Context
// ═══════════════════════════════════════════

export interface Heading {
  level: number;
  text: string;
  /** Character offset of the heading line within the markdown source */
  pos: number;
}

/** Cached per-file editor state for fast tab switching */
export interface FileEditorState {
  content: string;
  scrollPos: number;
  cursorLine: number;
  cursorCol: number;
}

// ═══════════════════════════════════════════
// Appearance Context
// ═══════════════════════════════════════════

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

// ═══════════════════════════════════════════
// System Context
// ═══════════════════════════════════════════

export interface AppConfig {
  fontSize: number;
  tabSize: number;
  autoSaveDelay: number;
  showHiddenFiles: boolean;
  showFileExtensions: boolean;
  defaultSourceMode: boolean;
}

export type UpdateState = "idle" | "checking" | "downloading" | "ready" | "error";
