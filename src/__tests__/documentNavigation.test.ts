import { beforeEach, describe, expect, it, vi } from "vitest";
import { remapWorkspacePaths, removeWorkspacePaths, useStore } from "../store";

const { readFileMock, writeFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("../services", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

import { openDocumentWithSave } from "../lib/openDocument";

function resetStore() {
  useStore.setState({
    currentFilePath: null,
    content: "",
    isDirty: false,
    sourceMode: false,
    fileStates: new Map(),
    openTabs: [],
    selectedFilePath: null,
    expandedFolders: [],
    externalConflict: null,
  });
}

describe("document navigation", () => {
  beforeEach(() => {
    resetStore();
    readFileMock.mockReset();
    writeFileMock.mockReset();
  });

  it("ignores a slow earlier open when a newer open finishes first", async () => {
    let resolveA!: (value: string) => void;
    readFileMock
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce("B");

    const openingA = useStore.getState().openDocument("/notes/a.md");
    const openingB = useStore.getState().openDocument("/notes/b.md");
    await openingB;
    resolveA("A");
    await openingA;

    const s = useStore.getState();
    expect(s.currentFilePath).toBe("/notes/b.md");
    expect(s.content).toBe("B");
    expect(s.openTabs).toEqual(["/notes/b.md"]);
  });

  it("does not resurrect a document when its pending open is superseded by close", async () => {
    let resolveA!: (value: string) => void;
    readFileMock.mockImplementationOnce(
      () => new Promise<string>((resolve) => { resolveA = resolve; }),
    );

    const opening = useStore.getState().openDocument("/notes/a.md");
    useStore.getState().closeTab("/notes/a.md");
    resolveA("A");
    await opening;

    const s = useStore.getState();
    expect(s.currentFilePath).toBeNull();
    expect(s.openTabs).toEqual([]);
  });

  it("saves the current dirty document before switching to another file", async () => {
    writeFileMock.mockResolvedValue(undefined);
    useStore.getState().setCurrentFile("/notes/a.md", "A");
    useStore.getState().setContent("A edited");

    await openDocumentWithSave("/notes/b.md", "B");

    expect(writeFileMock).toHaveBeenCalledWith("/notes/a.md", "A edited");
    expect(useStore.getState().currentFilePath).toBe("/notes/b.md");
  });

  it("remaps an open file when its containing folder is renamed", () => {
    useStore.getState().openDocument("/notes/old/a.md", "A");
    useStore.getState().setContent("A edited");
    useStore.getState().cacheCurrentFileState();
    useStore.getState().openDocument("/notes/old/b.md", "B");
    useStore.getState().setSelectedFile("/notes/old/a.md");
    useStore.getState().setExpandedFolders(["/notes/old", "/notes/old/sub"]);

    remapWorkspacePaths("/notes/old", "/notes/new");

    const s = useStore.getState();
    expect(s.currentFilePath).toBe("/notes/new/b.md");
    expect(s.openTabs).toEqual(["/notes/new/a.md", "/notes/new/b.md"]);
    expect(s.fileStates.has("/notes/new/a.md")).toBe(true);
    expect(s.fileStates.get("/notes/new/a.md")?.dirty).toBe(true);
    expect(s.selectedFilePath).toBe("/notes/new/a.md");
    expect(s.expandedFolders).toEqual(["/notes/new", "/notes/new/sub"]);
  });

  it("removes open documents and tree selection after a confirmed deletion", () => {
    useStore.getState().openDocument("/notes/old/a.md", "A");
    useStore.getState().openDocument("/notes/old/b.md", "B");
    useStore.getState().setSelectedFile("/notes/old/a.md");
    useStore.getState().setExpandedFolders(["/notes/old/sub", "/other"]);

    removeWorkspacePaths("/notes/old");

    const s = useStore.getState();
    expect(s.openTabs).toEqual([]);
    expect(s.fileStates.size).toBe(0);
    expect(s.currentFilePath).toBeNull();
    expect(s.selectedFilePath).toBeNull();
    expect(s.expandedFolders).toEqual(["/other"]);
  });
});
