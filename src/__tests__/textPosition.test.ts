import { describe, expect, it } from "vitest";
import {
  lineColAtText,
  lineColAtProseMirrorDoc,
  offsetAtLineCol,
  posAtLineColProseMirrorDoc,
} from "../lib/textPosition";

describe("text position", () => {
  it("computes one-based line and column positions", () => {
    expect(lineColAtText("a\nbc", 0)).toEqual({ line: 1, col: 1 });
    expect(lineColAtText("a\nbc", 3)).toEqual({ line: 2, col: 2 });
  });

  it("uses block separators from the ProseMirror document", () => {
    const doc = {
      textBetween: (_from: number, to: number) => "first\nsecond".slice(0, to),
    };
    expect(lineColAtProseMirrorDoc(doc, 8)).toEqual({ line: 2, col: 3 });
  });

  it("converts a one-based line/column back to a text offset", () => {
    expect(offsetAtLineCol("a\nbc", 2, 2)).toBe(3);
    expect(offsetAtLineCol("a\nbc", 99, 99)).toBe(4);
  });

  it("maps a line/column to a top-level ProseMirror position", () => {
    const doc = {
      content: { size: 30 },
      forEach: (cb: (node: { nodeSize: number }, offset: number) => void) => {
        cb({ nodeSize: 5 }, 0);
        cb({ nodeSize: 8 }, 5);
        cb({ nodeSize: 6 }, 13);
      },
    };
    expect(posAtLineColProseMirrorDoc(doc, 2, 4)).toBe(9);
  });
});
