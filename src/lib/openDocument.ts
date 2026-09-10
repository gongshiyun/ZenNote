import { useStore } from "../store";
import { saveCurrentDocument } from "./saveCoordinator";

export async function openDocumentWithSave(
  path: string,
  content?: string,
  options?: { sourceMode?: boolean },
): Promise<boolean> {
  const s = useStore.getState();
  if (s.currentFilePath && s.currentFilePath !== path && s.isDirty) {
    try {
      await saveCurrentDocument();
    } catch {
      // The dirty snapshot remains cached and will be retried later.
    }
  }
  return useStore.getState().openDocument(path, content, options);
}
