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

export function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
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
