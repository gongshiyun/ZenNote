/**
 * Create an untitled note in the workspace root and open it.
 *
 * Used by the global Ctrl+N shortcut (FileTree has its own inline name prompt
 * for the sidebar button). The name is made unique against the visible tree so
 * a burst of Ctrl+N never overwrites an existing note.
 */
import { t } from "../i18n";
import { joinPath } from "./filePaths";
import { invalidateWorkspaceSearchCache } from "./workspaceSearch";
import { openDocumentWithSave } from "./openDocument";
import * as fs from "../services";
import { useStore } from "../store";

export async function createUntitledNote(): Promise<string | null> {
  const s = useStore.getState();
  const workspace = s.workspacePath;
  if (!workspace) return null;

  const existing = new Set(
    s.tree.filter(node => !node.isDir).map(node => node.name.toLowerCase()),
  );
  const base = t().filetree.untitled || "Untitled";
  let name = `${base}.md`;
  for (let i = 2; existing.has(name.toLowerCase()); i++) {
    name = `${base} ${i}.md`;
  }

  const path = joinPath(workspace, name);
  try {
    await fs.createFile(path);
  } catch (error) {
    console.warn("create-untitled-note-failed", error);
    useStore.getState().setSaveError(error instanceof Error ? error.message : String(error));
    return null;
  }
  invalidateWorkspaceSearchCache(path);

  // Refresh the tree so the new row is visible immediately.
  try {
    const tree = await fs.openWorkspace(workspace, useStore.getState().showHiddenFiles);
    useStore.getState().setTree(tree);
  } catch { /* keep the existing tree */ }

  const opened = await openDocumentWithSave(path, "", {
    sourceMode: useStore.getState().sourceMode,
  });
  if (!opened) return null;
  useStore.getState().setSelectedFile(path);
  return path;
}
