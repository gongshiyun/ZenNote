/**
 * Service Layer — barrel export.
 * Application services encapsulate all side-effects (Tauri IPC, dialogs).
 */
export {
  readFile,
  writeFile,
  getLastWritten,
  createFile,
  createFolder,
  renameFile,
  deleteFile,
  openWorkspace,
  readDir,
  listMarkdownFiles,
  pathExists,
  watchWorkspace,
  unwatchWorkspace,
  getLaunchArgs,
} from "./fileService";

export { saveImage, resolveImageUrl } from "./imageService";
