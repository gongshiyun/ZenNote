import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";

const { saveImageMock } = vi.hoisted(() => ({
  saveImageMock: vi.fn(),
}));

vi.mock("../services", () => ({
  saveImage: (...args: unknown[]) => saveImageMock(...args),
}));

import { MAX_IMAGE_BYTES, prepareImageUpload } from "../lib/imageUpload";

describe("prepareImageUpload", () => {
  beforeEach(() => {
    saveImageMock.mockReset();
    useStore.setState({ imageUploadCount: 0, saveError: null });
  });

  it("saves supported images and tracks the in-flight upload", async () => {
    let resolveSave!: (value: string) => void;
    saveImageMock.mockImplementationOnce(
      () => new Promise<string>((resolve) => { resolveSave = resolve; }),
    );
    const file = new File(["x"], "photo.png", { type: "image/png" });

    const uploading = prepareImageUpload(file, "/notes/a.md", () => true);
    expect(useStore.getState().imageUploadCount).toBe(1);
    resolveSave("assets/photo.png");
    await expect(uploading).resolves.toBe("assets/photo.png");
    expect(useStore.getState().imageUploadCount).toBe(0);
  });

  it("rejects unsupported formats without calling the service", async () => {
    const file = new File(["x"], "photo.tiff", { type: "image/tiff" });
    await expect(prepareImageUpload(file, null, () => true)).rejects.toThrow(
      "不支持的图片格式",
    );
    expect(saveImageMock).not.toHaveBeenCalled();
  });

  it("requires confirmation before saving an image larger than 10MB", async () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.png", {
      type: "image/png",
    });
    await expect(prepareImageUpload(file, null, () => false)).resolves.toBeNull();
    expect(saveImageMock).not.toHaveBeenCalled();
  });
});
