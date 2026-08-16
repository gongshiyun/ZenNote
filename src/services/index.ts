/**
 * Service Layer — barrel export.
 * Application services encapsulate all side-effects (Tauri IPC, dialogs).
 */
export {
  readFile,
  writeFile,
  createFile,
  createFolder,
  renameFile,
  deleteFile,
  openWorkspace,
  readDir,
  watchWorkspace,
  unwatchWorkspace,
  getLaunchArgs,
} from "./fileService";

export { saveImage, resolveImageUrl } from "./imageService";
