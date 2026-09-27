export function applyEditorFontSize(fontSize: number): void {
  document.documentElement.style.setProperty("--zn-editor-font-size", `${fontSize}px`);
}

export function editorContentMaxWidth(editorPadding: number): number {
  const padding = Number.isFinite(editorPadding) ? editorPadding : 80;
  return Math.max(320, 860 - (padding - 80) * 2);
}

export function applyEditorPadding(editorPadding: number): void {
  document.documentElement.style.setProperty(
    "--zn-editor-content-width",
    `${editorContentMaxWidth(editorPadding)}px`,
  );
}
