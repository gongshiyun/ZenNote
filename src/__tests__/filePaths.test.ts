import { describe, expect, it } from "vitest";
import {
  affectedOpenPaths,
  joinPath,
  remapPathPrefix,
  replaceFileName,
} from "../lib/filePaths";

describe("file path helpers", () => {
  it("joins paths with the separator already used by the parent", () => {
    expect(joinPath("C:\\notes", "new.md")).toBe("C:\\notes\\new.md");
    expect(joinPath("/home/me/notes", "new.md")).toBe("/home/me/notes/new.md");
    expect(joinPath("C:\\notes\\", "new.md")).toBe("C:\\notes\\new.md");
  });

  it("replaces a file name without changing the parent separator", () => {
    expect(replaceFileName("C:\\notes\\old.md", "new.md")).toBe("C:\\notes\\new.md");
    expect(replaceFileName("/notes/old.md", "new.md")).toBe("/notes/new.md");
  });

  it("remaps exact paths and descendants only", () => {
    expect(remapPathPrefix("/notes/old", "/notes/old", "/notes/new")).toBe("/notes/new");
    expect(remapPathPrefix("/notes/old/a.md", "/notes/old", "/notes/new")).toBe("/notes/new/a.md");
    expect(remapPathPrefix("/notes/older/a.md", "/notes/old", "/notes/new")).toBe("/notes/older/a.md");
  });

  it("finds all open paths affected by a file or folder deletion", () => {
    expect(affectedOpenPaths(
      ["/notes/a.md", "/notes/sub/b.md", "/other/c.md"],
      "/notes",
    )).toEqual(["/notes/a.md", "/notes/sub/b.md"]);
    expect(affectedOpenPaths(
      ["/notes/a.md", "/notes/a.md.bak"],
      "/notes/a.md",
    )).toEqual(["/notes/a.md"]);
  });
});
