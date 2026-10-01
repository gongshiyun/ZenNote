import { describe, expect, it } from "vitest";
import { lineColAtText, offsetAtLineCol } from "../lib/textPosition";

describe("text position", () => {
  it("computes one-based line and column positions", () => {
    expect(lineColAtText("a\nbc", 0)).toEqual({ line: 1, col: 1 });
    expect(lineColAtText("a\nbc", 3)).toEqual({ line: 2, col: 2 });
  });

  it("converts a one-based line/column back to a text offset", () => {
    expect(offsetAtLineCol("a\nbc", 2, 2)).toBe(3);
    expect(offsetAtLineCol("a\nbc", 99, 99)).toBe(4);
  });
});
