import { describe, expect, it } from "vitest";
import { applyEditorFontSize, applyEditorPadding, editorContentMaxWidth } from "../lib/editorAppearance";

describe("editor appearance", () => {
  it("applies the configured editor font size to the document root", () => {
    applyEditorFontSize(21);
    expect(document.documentElement.style.getPropertyValue("--zn-editor-font-size")).toBe("21px");
  });

  it("maps page padding to a continuously adjustable content width", () => {
    // Default stays 860px so existing users see no change.
    expect(editorContentMaxWidth(80)).toBe(860);
    expect(editorContentMaxWidth(120)).toBe(730);
    expect(editorContentMaxWidth(200)).toBe(470);
    expect(editorContentMaxWidth(500)).toBe(360);
  });

  it("lets a zero margin reach a genuinely full-width page", () => {
    // Regression guard: the old slope capped at 988px, so dragging the slider
    // to the minimum still left ~200px of dead space on each side.
    expect(editorContentMaxWidth(0)).toBe(1120);
    expect(editorContentMaxWidth(16)).toBe(1068);
  });

  it("never returns a content width too narrow to read", () => {
    for (const p of [0, 50, 200, 400, 500, 900, -100]) {
      expect(editorContentMaxWidth(p)).toBeGreaterThanOrEqual(360);
    }
  });

  it("applies the computed content width to the document root", () => {
    applyEditorPadding(120);
    expect(document.documentElement.style.getPropertyValue("--zn-editor-content-width")).toBe("730px");
  });
});
