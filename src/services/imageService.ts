/**
 * Image Service — persist pasted/dropped images to disk and resolve their URLs.
 *
 * Images are saved into an `assets/` folder next to the current note and
 * referenced in markdown by a *relative* path (portable across machines).
 * For rendering, the relative path is resolved to an absolute path and turned
 * into a Tauri asset-protocol URL (http://asset.localhost/...) which the
 * webview can load.
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import { parentDir } from "../domain";

/** Save an image File next to the note; returns the relative path to embed. */
export async function saveImage(file: File, notePath: string | null): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  const ext = (file.name.split(".").pop() || "png").replace(/[^a-zA-Z0-9]/g, "") || "png";
  const fileName =
    "img-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const dir = notePath ? parentDir(notePath) : "";
  const absPath = dir ? dir + "/assets/" + fileName : "assets/" + fileName;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await invoke("write_file_binary", { path: absPath, bytes });
  return "assets/" + fileName;
}

/**
 * Resolve an image `src` (as stored in markdown) to a URL the webview can load.
 * - web/data/blob URLs pass through unchanged
 * - absolute file paths are converted to asset URLs
 * - relative paths are resolved against the note's directory, then converted
 */
export function resolveImageUrl(src: string, notePath: string | null): string {
  if (!src) return src;
  // Already a loadable web URL — leave as-is.
  if (/^(https?|data|blob):/i.test(src)) return src;
  // Already an asset-protocol URL — leave as-is.
  if (src.startsWith("asset:") || src.includes("asset.localhost")) return src;

  let abs: string;
  if (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(src)) {
    // Absolute path (Windows drive, UNC, or POSIX).
    abs = src;
  } else if (notePath) {
    abs = parentDir(notePath) + "/" + src;
  } else {
    return src;
  }
  return convertFileSrc(abs.replace(/\\/g, "/"));
}
