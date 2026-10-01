export function applyEditorFontSize(fontSize: number): void {
  document.documentElement.style.setProperty("--zn-editor-font-size", `${fontSize}px`);
}

/**
 * Map the "page side margins" setting to the editor's content width.
 *
 * The old slope was 2px of width per 1px of margin, which meant the slider ran
 * out of travel long before the page filled the window: at the minimum padding
 * the content still capped at 988px, leaving ~200px of dead space on each side
 * of a 1440px window. The slope is now 3.25 so the low end actually reaches a
 * full-width page, and the floor is 360px so a narrow page stays readable.
 *
 * Anchored so the default (padding 80) is still exactly 860px — existing users
 * see no change until they move the slider.
 */
export function editorContentMaxWidth(editorPadding: number): number {
  const padding = Number.isFinite(editorPadding) ? editorPadding : 80;
  return Math.max(360, Math.round(860 + (80 - padding) * 3.25));
}

export function applyEditorPadding(editorPadding: number): void {
  document.documentElement.style.setProperty(
    "--zn-editor-content-width",
    `${editorContentMaxWidth(editorPadding)}px`,
  );
}
