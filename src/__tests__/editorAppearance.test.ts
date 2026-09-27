import { describe, expect, it } from "vitest";
import { applyEditorFontSize, applyEditorPadding, editorContentMaxWidth } from "../lib/editorAppearance";

describe("editor appearance", () => {
  it("applies the configured editor font size to the document root", () => {
    applyEditorFontSize(21);
    expect(document.documentElement.style.getPropertyValue("--zn-editor-font-size")).toBe("21px");
  });

  it("maps page padding to a continuously adjustable content width", () => {
    expect(editorContentMaxWidth(80)).toBe(860);
    expect(editorContentMaxWidth(120)).toBe(780);
    expect(editorContentMaxWidth(200)).toBe(620);
    expect(editorContentMaxWidth(500)).toBe(320);
  });

  it("applies the computed content width to the document root", () => {
    applyEditorPadding(120);
    expect(document.documentElement.style.getPropertyValue("--zn-editor-content-width")).toBe("780px");
  });
});
