import { t } from "../i18n";
import { saveImage } from "../services";
import { useStore } from "../store";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/avif",
]);

export async function prepareImageUpload(
  file: File,
  notePath: string | null,
  confirmLarge: (message: string) => boolean = message => window.confirm(message),
): Promise<string | null> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    const error = new Error(t().editor.imageUnsupported);
    useStore.getState().setSaveError(error.message);
    throw error;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const size = (file.size / 1024 / 1024).toFixed(1);
    const allowed = confirmLarge(t().editor.imageTooLarge.replace("{size}", size));
    if (!allowed) return null;
  }

  useStore.getState().beginImageUpload();
  try {
    return await saveImage(file, notePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useStore.getState().setSaveError(message || t().editor.imageUploadFailed);
    throw error;
  } finally {
    useStore.getState().endImageUpload();
  }
}
