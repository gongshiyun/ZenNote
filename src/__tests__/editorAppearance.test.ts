import { describe, expect, it } from "vitest";
import { applyEditorFontSize } from "../lib/editorAppearance";

describe("editor appearance", () => {
  it("applies the configured editor font size to the document root", () => {
    applyEditorFontSize(21);
    expect(document.documentElement.style.getPropertyValue("--zn-editor-font-size")).toBe("21px");
  });
});
