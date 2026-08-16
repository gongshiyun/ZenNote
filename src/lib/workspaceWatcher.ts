/**
 * Workspace file watching — the Rust side watches the current workspace
 * folder (notify crate) and emits `workspace-changed` events with the changed
 * paths. This module debounces them, refreshes the visible file tree (root
 * level + every expanded folder, so lazy subtrees survive), and reloads open
 * files that were modified EXTERNALLY.
 *
 * Self-write guard: the app's own saves are recorded by fileService.writeFile
 * (getLastWritten); a disk change whose content equals what we last wrote is
 * ignored, so autosave never triggers a refresh loop.
 */
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useStore } from "../store";
import * as fs from "../services/fileService";

/**
 * Re-list the workspace root, then re-read every expanded folder so the lazy
 * tree keeps its subtrees. Folders that disappeared on disk are dropped from
 * the expanded set.
 */
export async function refreshWorkspaceTree(): Promise<void> {
  const ws = useStore.getState().workspacePath;
  if (!ws) return;
  let root;
  try {
    root = await fs.openWorkspace(ws);
  } catch {
    return; // workspace folder gone/unreadable — keep the old tree
  }
  useStore.getState().setTree(root);
  const expanded = useStore.getState().expandedFolders;
  const alive: string[] = [];
  for (const folder of expanded) {
    try {
      const children = await fs.readDir(folder);
      useStore.getState().setFolderChildren(folder, children);
      alive.push(folder);
    } catch {
      // Folder was deleted externally — stop expanding it.
    }
  }
  if (alive.length !== expanded.length) {
    useStore.getState().setExpandedFolders(alive);
  }
}

/**
 * Reload open files that changed on disk. Rules:
 * - content identical to our last write  → our own save, ignore;
 * - current file with unsaved edits      → keep the user's work untouched;
 * - current file, clean                  → swap in the new content;
 * - background tab, clean                → update its cached content so the
 *   next activation shows the fresh text.
 */
export async function reloadExternallyChanged(paths: string[]): Promise<void> {
  const openTabs = new Set(useStore.getState().openTabs);
  const targets = paths.filter(p => openTabs.has(p));
  for (const p of targets) {
    let disk: string;
    try {
      disk = await fs.readFile(p);
    } catch {
      continue; // deleted or unreadable — leave the tab as-is
    }
    if (fs.getLastWritten(p) === disk) continue; // echo of our own write
    const s = useStore.getState();
    if (p === s.currentFilePath) {
      if (s.isDirty) continue; // never overwrite unsaved edits
      if (s.content === disk) continue;
      if (s.sourceMode) continue; // the source editor is the user's view now
      // Swap content and bump reloadTick: the editor effect re-runs and the
      // instance-reuse path replaces the document in place. (setCurrentFile
      // can't be used here — it restores the just-cached OLD content for a
      // path that is already current.)
      useStore.setState({ content: disk, isDirty: false, reloadTick: s.reloadTick + 1 });
    } else {
      const st = s.fileStates.get(p);
      if (!st || st.dirty || st.content === disk) continue;
      const next = new Map(s.fileStates);
      next.set(p, { ...st, content: disk });
      useStore.setState({ fileStates: next });
    }
  }
}

/**
 * Subscribe to `workspace-changed` and start the debounced refresh. Returns
 * the unsubscribe function (call it on workspace change / unmount).
 */
export async function startWorkspaceWatcher(): Promise<UnlistenFn> {
  const { listen } = await import("@tauri-apps/api/event");
  let timer = 0;
  let pending: Set<string> = new Set();
  return listen<{ paths: string[] }>("workspace-changed", (ev) => {
    const changed = ev.payload?.paths;
    if (!Array.isArray(changed)) return;
    for (const p of changed) pending.add(p);
    // Second debounce layer on top of the Rust-side batching: bursts of
    // events (multi-file saves, git operations) collapse into one refresh.
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      const paths = Array.from(pending);
      pending = new Set();
      void refreshWorkspaceTree();
      void reloadExternallyChanged(paths);
    }, 250);
  });
}
