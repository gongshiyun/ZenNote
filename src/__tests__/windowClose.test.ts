import { describe, expect, it, vi } from "vitest";
import { createCloseRequestHandler } from "../lib/windowClose";

describe("window close request", () => {
  it("lets Tauri close normally when there are no dirty documents", async () => {
    const preventDefault = vi.fn();
    const destroy = vi.fn();
    const flush = vi.fn();
    const handler = createCloseRequestHandler({
      hasDirtyDocuments: () => false,
      flushDirtyDocuments: flush,
      confirmExit: () => true,
      destroy,
      close: vi.fn(),
    });

    await handler({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("flushes dirty documents and destroys the window after a successful save", async () => {
    const preventDefault = vi.fn();
    const flush = vi.fn().mockResolvedValue({ ok: true, failures: [] });
    const destroy = vi.fn().mockResolvedValue(undefined);
    const handler = createCloseRequestHandler({
      hasDirtyDocuments: () => true,
      flushDirtyDocuments: flush,
      confirmExit: () => true,
      destroy,
      close: vi.fn(),
    });

    await handler({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(flush).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it("stays open when saving fails and the user cancels exit", async () => {
    const preventDefault = vi.fn();
    const destroy = vi.fn();
    const handler = createCloseRequestHandler({
      hasDirtyDocuments: () => true,
      flushDirtyDocuments: vi.fn().mockResolvedValue({ ok: false, failures: [] }),
      confirmExit: () => false,
      destroy,
      close: vi.fn(),
    });

    await handler({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
