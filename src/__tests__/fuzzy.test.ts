import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../lib/fuzzy";

describe("fuzzyScore", () => {
  it("matches subsequences and prefers compact matches", () => {
    expect(fuzzyScore("project-notes.md", "pnt")).toBeGreaterThan(0);
    expect(fuzzyScore("project-notes.md", "pnt")).toBeGreaterThan(
      fuzzyScore("project-notes.md", "p n t") ?? 0,
    );
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyScore("alpha.md", "zz")).toBeNull();
  });
});
