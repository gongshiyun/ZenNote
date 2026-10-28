import { useStore } from "../store";
import { writeFile } from "../services";
import { invalidateWorkspaceSearchCache } from "./workspaceSearch";

interface DirtySnapshot {
  path: string;
  content: string;
}

export interface FlushResult {
  ok: boolean;
  failures: Array<{ path: string; error: unknown }>;
}

const writeQueues = new Map<string, Promise<void>>();
const SAVE_RETRY_DELAY_MS = 500;

function enqueueWrite(path: string, task: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  writeQueues.set(path, next);
  return next.finally(() => {
    if (writeQueues.get(path) === next) writeQueues.delete(path);
  });
}

export function saveDocumentSnapshot(path: string, content: string): Promise<void> {
  return enqueueWrite(path, async () => {
    try {
      try {
        await writeFile(path, content);
      } catch {
        await new Promise(resolve => setTimeout(resolve, SAVE_RETRY_DELAY_MS));
        await writeFile(path, content);
      }
      invalidateWorkspaceSearchCache(path);
      useStore.getState().markSavedSnapshot(path, content);
      useStore.getState().setSaveError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useStore.getState().setSaveError(message);
      throw error;
    }
  });
}

export async function saveCurrentDocument(): Promise<boolean> {
  const s = useStore.getState();
  if (!s.currentFilePath || !s.isDirty) return true;
  if (s.externalConflict?.path === s.currentFilePath) return false;
  const path = s.currentFilePath;
  const content = s.content;
  await saveDocumentSnapshot(path, content);
  return !useStore.getState().isDirty;
}

function collectDirtySnapshots(): DirtySnapshot[] {
  const s = useStore.getState();
  const docs = new Map<string, string>();
  // A document with an UNRESOLVED external conflict is never written: the disk
  // version is the one the banner is protecting, and silently overwriting it
  // would destroy the external edit. It still counts as unsaved work (see
  // hasDirtyDocuments) so the close guard prompts instead of exiting silently.
  const conflicted = s.externalConflict?.path ?? null;
  if (
    s.currentFilePath &&
    s.isDirty &&
    s.currentFilePath !== conflicted
  ) {
    docs.set(s.currentFilePath, s.content);
  }
  for (const [path, state] of s.fileStates) {
    if (state.dirty && path !== conflicted) docs.set(path, state.content);
  }
  return Array.from(docs, ([path, content]) => ({ path, content }));
}

export function hasDirtyDocuments(): boolean {
  const s = useStore.getState();
  // Any dirty document counts — including one parked behind an unresolved
  // external conflict. Excluding the conflicted document here used to make the
  // close handler believe there was nothing to lose and exit without prompting.
  if (s.currentFilePath && s.isDirty) return true;
  for (const state of s.fileStates.values()) {
    if (state.dirty) return true;
  }
  return false;
}

export async function flushDirtyDocuments(): Promise<FlushResult> {
  const docs = collectDirtySnapshots();
  const settled = await Promise.allSettled(
    docs.map(doc => saveDocumentSnapshot(doc.path, doc.content)),
  );
  const failures = settled.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ path: docs[index].path, error: result.reason }]
      : [],
  );
  const ok = failures.length === 0 && !hasDirtyDocuments();
  if (failures.length > 0) {
    console.error("flush-dirty-documents-failed", failures);
  }
  return { ok, failures };
}
