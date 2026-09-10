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
  /** Unsaved-changes flag at the time the state was cached */
  dirty?: boolean;
  /** Last selection in the WYSIWYG editor, valid only for `content`. */
  pmSelection?: EditorSelectionSnapshot | null;
  /** Last selection in the source editor, valid only for `content`. */
  cmSelection?: EditorSelectionSnapshot | null;
}

export interface EditorSelectionSnapshot {
  anchor: number;
  head: number;
  /** Snapshot is only restored when it belongs to the current content. */
  content: string;
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

export type UpdateState = "idle" | "checking" | "downloading" | "ready" | "error" | "installing" | "uptodate";
