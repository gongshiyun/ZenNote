import { describe, expect, it } from "vitest";
import { isEditableTarget } from "../lib/keyboard";

describe("keyboard routing", () => {
  it("recognizes form controls and contenteditable elements", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("select"))).toBe(true);
    expect(isEditableTarget(document.createElement("div"))).toBe(false);

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isEditableTarget(editable)).toBe(true);
  });

  it("recognizes editor surfaces so editor formatting wins over global shortcuts", () => {
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    const child = document.createElement("span");
    editor.appendChild(child);
    expect(isEditableTarget(child)).toBe(true);
  });
});
