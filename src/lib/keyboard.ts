export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) return true;
  return !!element.closest?.(".ProseMirror, .cm-editor, [contenteditable='true']");
}
