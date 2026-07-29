// Auto-update service built on @tauri-apps/plugin-updater.
//
// Flow (matches the product requirement):
//   1. check() periodically (interval from settings, default 1h)
//   2. if an update is available -> download() it automatically in the background
//   3. when the download finishes, the store's updateState becomes "ready" and the
//      titlebar shows an "install update" button
//   4. clicking the button calls installUpdate() which installs and relaunches.

import { useStore } from "../store";

// Holds the downloaded Update resource between check and install.
let pendingUpdate: { download: () => Promise<void>; install: () => Promise<void>; version: string } | null = null;

// Check for an update and, if one is available, download it in the background.
export async function checkAndDownloadUpdate(): Promise<void> {
  const store = useStore.getState();
  // Don't interrupt an in-flight download or an already-ready update.
  if (store.updateState === "downloading" || store.updateState === "ready") return;
  try {
    store.setUpdateState("checking");
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      useStore.getState().setUpdateState("idle");
      return;
    }
    pendingUpdate = update as unknown as typeof pendingUpdate;
    useStore.getState().setUpdateVersion(update.version);
    useStore.getState().setUpdateState("downloading");
    await update.download();
    useStore.getState().setUpdateState("ready");
  } catch {
    // Network errors / running in browser dev / no endpoint — fail quietly.
    pendingUpdate = null;
    useStore.getState().setUpdateState("error");
    window.setTimeout(() => {
      if (useStore.getState().updateState === "error") useStore.getState().setUpdateState("idle");
    }, 6000);
  }
}

// Install the downloaded update and relaunch into the new version.
export async function installUpdate(): Promise<void> {
  if (!pendingUpdate) return;
  try {
    await pendingUpdate.install();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    useStore.getState().setUpdateState("error");
  }
}
