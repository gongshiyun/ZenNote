export function applyEditorFontSize(fontSize: number): void {
  document.documentElement.style.setProperty("--zn-editor-font-size", `${fontSize}px`);
}
