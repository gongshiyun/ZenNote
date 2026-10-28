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

export function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

/** path -> content last written by THIS app (self-change detection for the
 * workspace watcher: an external-change event whose content equals this was
 * caused by our own save and must be ignored).
 *
 * Bounded so a long session touching many notes does not leak memory: the map
 * order doubles as recency order (delete + set moves an entry to the end). An
 * evicted path is still safe — the watcher falls back to comparing disk content
 * with the editor content before treating an event as external. */
export const MAX_LAST_WRITTEN_ENTRIES = 128;
const lastWritten = new Map<string, string>();

function rememberLastWritten(path: string, content: string): void {
  lastWritten.delete(path);
  lastWritten.set(path, content);
  while (lastWritten.size > MAX_LAST_WRITTEN_ENTRIES) {
    const oldest = lastWritten.keys().next().value;
    if (oldest === undefined) break;
    lastWritten.delete(oldest);
  }
}

export function getLastWritten(path: string): string | undefined {
  return lastWritten.get(path);
}

export function writeFile(path: string, content: string): Promise<void> {
  const previous = lastWritten.get(path);
  rememberLastWritten(path, content);
  return invoke<void>("write_file", { path, content }).catch((error) => {
    if (previous === undefined) lastWritten.delete(path);
    else rememberLastWritten(path, previous);
    throw error;
  });
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

export function openWorkspace(path: string, includeHidden = false): Promise<FileNode[]> {
  return invoke<FileNode[]>("open_workspace", { path, includeHidden });
}

/**
 * Load ONE folder level on demand (lazy tree loading). The workspace listing
 * is shallow; sub-folder children arrive through this call when expanded.
 */
export function readDir(path: string, includeHidden = false): Promise<FileNode[]> {
  return invoke<FileNode[]>("read_dir", { path, includeHidden });
}

export function listMarkdownFiles(path: string, includeHidden = false): Promise<FileNode[]> {
  return invoke<FileNode[]>("list_markdown_files", { path, includeHidden });
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

// ---- OS "Open with" support ----

/** Raw OS launch arguments (argv). argv[0] is the exe path; on Windows an
 * "Open with" launch passes the file path as a following argument. */
export function getLaunchArgs(): Promise<string[]> {
  return invoke<string[]>("get_launch_args");
}
