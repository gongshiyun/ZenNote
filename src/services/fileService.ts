/**
 * File Service — encapsulates all Tauri file-system IPC calls.
 * Components should use this instead of calling invoke() directly.
 */
import type { FileNode } from "../domain";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// ---- File operations ----

export function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/** path -> content last written by THIS app (self-change detection for the
 * workspace watcher: an external-change event whose content equals this was
 * caused by our own save and must be ignored). */
const lastWritten = new Map<string, string>();

export function getLastWritten(path: string): string | undefined {
  return lastWritten.get(path);
}

export function writeFile(path: string, content: string): Promise<void> {
  const p = invoke<void>("write_file", { path, content });
  p.then(() => { lastWritten.set(path, content); }).catch(() => { /* failed write: nothing recorded */ });
  return p;
}

export function createFile(path: string): Promise<void> {
  return invoke("create_file", { path });
}

export function createFolder(path: string): Promise<void> {
  return invoke("create_folder", { path });
}

export function renameFile(oldPath: string, newPath: string): Promise<void> {
  return invoke("rename_file", { oldPath, newPath });
}

export function deleteFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

// ---- Workspace operations ----

export function openWorkspace(path: string): Promise<FileNode[]> {
  return invoke<FileNode[]>("open_workspace", { path });
}

/**
 * Load ONE folder level on demand (lazy tree loading). The workspace listing
 * is shallow; sub-folder children arrive through this call when expanded.
 */
export function readDir(path: string): Promise<FileNode[]> {
  return invoke<FileNode[]>("read_dir", { path });
}

// ---- Workspace watching (external-change auto-refresh) ----

/** Start watching a folder recursively; changes arrive as `workspace-changed` events. */
export function watchWorkspace(path: string): Promise<void> {
  return invoke("watch_workspace", { path });
}

/** Stop the active workspace watcher. */
export function unwatchWorkspace(): Promise<void> {
  return invoke("unwatch_workspace");
}
