import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";

const { writeFileMock } = vi.hoisted(() => ({
  writeFileMock: vi.fn(),
}));

vi.mock("../services", () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

import {
  flushDirtyDocuments,
  saveCurrentDocument,
  saveDocumentSnapshot,
} from "../lib/saveCoordinator";

function resetStore() {
  useStore.setState({
    currentFilePath: null,
    content: "",
    isDirty: false,
    fileStates: new Map(),
    openTabs: [],
    lastSavedAt: null,
    saveError: null,
  });
}

describe("saveCoordinator", () => {
  beforeEach(() => {
    resetStore();
    writeFileMock.mockReset();
  });

  it("keeps the document dirty when content changes while a save is in flight", async () => {
    let resolveWrite!: () => void;
    writeFileMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveWrite = resolve; }),
    );

    useStore.getState().setCurrentFile("/notes/a.md", "v1");
    useStore.getState().setContent("v2");
    const saving = saveCurrentDocument();
    useStore.getState().setContent("v3");
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    resolveWrite();

    await saving;

    expect(writeFileMock).toHaveBeenCalledWith("/notes/a.md", "v2");
    expect(useStore.getState().content).toBe("v3");
    expect(useStore.getState().isDirty).toBe(true);
  });

  it("does not clear a different active document when a prior save finishes", async () => {
    let resolveWrite!: () => void;
    writeFileMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveWrite = resolve; }),
    );

    useStore.getState().setCurrentFile("/notes/a.md", "A");
    useStore.getState().setContent("A edited");
    const saving = saveCurrentDocument();

    useStore.getState().setCurrentFile("/notes/b.md", "B");
    useStore.getState().setContent("B edited");
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    resolveWrite();
    await saving;

    expect(useStore.getState().currentFilePath).toBe("/notes/b.md");
    expect(useStore.getState().isDirty).toBe(true);
  });

  it("serializes writes to the same path so older content cannot land last", async () => {
    let resolveFirst!: () => void;
    const order: string[] = [];
    writeFileMock
      .mockImplementationOnce((_path: string, content: string) => {
        order.push("start:" + content);
        return new Promise<void>((resolve) => {
          resolveFirst = () => {
            order.push("end:" + content);
            resolve();
          };
        });
      })
      .mockImplementationOnce(async (_path: string, content: string) => {
        order.push("start:" + content);
        order.push("end:" + content);
      });

    const first = saveDocumentSnapshot("/notes/a.md", "v1");
    const second = saveDocumentSnapshot("/notes/a.md", "v2");
    await vi.waitFor(() => expect(order).toEqual(["start:v1"]));

    resolveFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["start:v1", "end:v1", "start:v2", "end:v2"]);
  });

  it("flushes both the active document and dirty background tabs", async () => {
    writeFileMock.mockResolvedValue(undefined);

    useStore.getState().setCurrentFile("/notes/a.md", "A");
    useStore.getState().setContent("A edited");
    useStore.getState().setCurrentFile("/notes/b.md", "B");
    useStore.getState().setContent("B edited");

    const result = await flushDirtyDocuments();

    expect(result.ok).toBe(true);
    expect(writeFileMock).toHaveBeenCalledWith("/notes/a.md", "A edited");
    expect(writeFileMock).toHaveBeenCalledWith("/notes/b.md", "B edited");
    expect(useStore.getState().isDirty).toBe(false);
    expect(useStore.getState().fileStates.get("/notes/a.md")?.dirty).toBe(false);
  });

  it("retries a failed write once before reporting an error", async () => {
    writeFileMock
      .mockRejectedValueOnce(new Error("locked"))
      .mockResolvedValueOnce(undefined);

    await saveDocumentSnapshot("/notes/retry.md", "content");

    expect(writeFileMock).toHaveBeenCalledTimes(2);
  });

  it("does not overwrite an external conflict before the user resolves it", async () => {
    useStore.getState().setCurrentFile("/notes/conflict.md", "local");
    useStore.getState().setContent("local edited");
    useStore.getState().setExternalConflict({
      path: "/notes/conflict.md",
      diskContent: "external",
      reason: "modified",
    });

    const saved = await saveCurrentDocument();

    expect(saved).toBe(false);
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
