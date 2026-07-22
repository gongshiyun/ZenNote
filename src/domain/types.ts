/**
 * Domain types for ZenNote
 */

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface Heading {
  level: number;
  text: string;
  pos: number;
}

export type ThemeMode = "light" | "dark" | "system";

export interface AppConfig {
  fontSize: number;
  tabSize: number;
  autoSaveDelay: number;
  showHiddenFiles: boolean;
  showFileExtensions: boolean;
  defaultSourceMode: boolean;
}
