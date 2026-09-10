import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";

const { listFilesMock, readFileMock, writeFileMock } = vi.hoisted(() => ({
  listFilesMock: vi.fn(),
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("../services", () => ({
  listMarkdownFiles: (...args: unknown[]) => listFilesMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

import { QuickOpen } from "../components/dialogs/QuickOpen";

describe("QuickOpen", () => {
  beforeEach(() => {
    useStore.setState({
      workspacePath: "/ws",
      currentFilePath: null,
      content: "",
      openTabs: [],
      fileStates: new Map(),
      defaultSourceMode: false,
      showHiddenFiles: false,
    });
    listFilesMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
  });

  it("filters notes by name and opens the selected file", async () => {
    listFilesMock.mockResolvedValue([
      { name: "alpha.md", path: "/ws/alpha.md", isDir: false },
      { name: "beta.md", path: "/ws/sub/beta.md", isDir: false },
    ]);
    readFileMock.mockResolvedValue("# beta");
    const onClose = vi.fn();

    render(<QuickOpen onClose={onClose} />);
    await waitFor(() => expect(screen.getAllByText("alpha.md").length).toBeGreaterThan(0));

    fireEvent.change(screen.getByPlaceholderText("按文件名快速打开..."), {
      target: { value: "beta" },
    });
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => {
      expect(useStore.getState().currentFilePath).toBe("/ws/sub/beta.md");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
