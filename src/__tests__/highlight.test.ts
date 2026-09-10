import { describe, expect, it } from "vitest";
import { splitHighlight } from "../lib/highlight";

describe("splitHighlight", () => {
  it("marks every case-insensitive occurrence", () => {
    expect(splitHighlight("Hello hello", "hello")).toEqual([
      { text: "Hello", match: true },
      { text: " ", match: false },
      { text: "hello", match: true },
    ]);
  });

  it("returns the original text when there is no query or match", () => {
    expect(splitHighlight("text", "")).toEqual([{ text: "text", match: false }]);
    expect(splitHighlight("text", "missing")).toEqual([{ text: "text", match: false }]);
  });
});
