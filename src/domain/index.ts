/**
 * Domain Layer — barrel export.
 * All domain types and logic are accessed through this entry point.
 */
export type {
  FileNode,
  Heading,
  FileEditorState,
  ThemeMode,
  ResolvedTheme,
  AppConfig,
  UpdateState,
} from "./types";

export { parseHeadings, displayableHeadings, computeWordCount, estimateReadingTime } from "./document";
export type { WordCount } from "./document";

export { parentDir, fileName, isWithinWorkspace, noteName } from "./filesystem";
