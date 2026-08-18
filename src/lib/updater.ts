// Auto-update service built on @tauri-apps/plugin-updater.
//
// Flow (matches the product requirement):
//   1. check() periodically (interval from settings, default 1h) or manually
//   2. if an update is available -> download() automatically in the background,
//      WITH a progress callback (percent shown in the settings button) and
//      retried on transient network failures (GitHub asset downloads often
//      break midway on unstable connections)
//   3. when the download finishes -> updateState "ready": BOTH the titlebar
//      button AND the settings button offer "install update"
//   4. installUpdate() installs and relaunches.
// Errors are written to store.updateError and shown in the UI — they are NOT
// silently reverted to idle (that made failed downloads look like nothing
// happened).

import { useStore } from "../store";

// Holds the downloaded Update resource between check and install.
let pendingUpdate: { download: (onEvent?: (ev: any) => void, options?: any) => Promise<void>; install: () => Promise<void>; version: string } | null = null;

// GitHub 直连在弱网下常中途断开：单次失败不能让更新流程静默死亡。
const DOWNLOAD_ATTEMPTS = 3;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// Check for an update and, if one is available, download it in the background.
// `manual` = triggered by the user clicking the button (shows an explicit
// "up to date" confirmation when there is nothing to install).
export async function checkAndDownloadUpdate(manual = false): Promise<void> {
  const store = useStore.getState();
  // Don't interrupt an in-flight check/download, an already-ready update, or
  // an ongoing installation.
  if (store.updateState === "checking" || store.updateState === "downloading" || store.updateState === "ready" || store.updateState === "installing") return;
  try {
    store.setUpdateState("checking");
    store.setUpdateError(null);
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 30_000 });
    if (!update) {
      if (manual) {
        // 手动检查：给出可见的"已是最新"反馈，短暂展示后回落。
        useStore.getState().setUpdateState("uptodate");
        window.setTimeout(() => {
          if (useStore.getState().updateState === "uptodate") useStore.getState().setUpdateState("idle");
        }, 4000);
      } else {
        useStore.getState().setUpdateState("idle");
      }
      return;
    }
    pendingUpdate = update as unknown as typeof pendingUpdate;
    useStore.getState().setUpdateVersion(update.version);

    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
      try {
        useStore.getState().setUpdateState("downloading");
        useStore.getState().setUpdateProgress(null);
        let received = 0;
        let total = 0;
        await update.download((ev) => {
          if (ev.event === "Started" && typeof ev.data.contentLength === "number") {
            total = ev.data.contentLength;
          } else if (ev.event === "Progress") {
            received += ev.data.chunkLength;
            if (total > 0) {
              useStore.getState().setUpdateProgress(Math.min(100, Math.floor((received / total) * 100)));
            }
          }
        }, { timeout: 300_000 });
        useStore.getState().setUpdateProgress(null);
        useStore.getState().setUpdateState("ready");
        return;
      } catch (err) {
        lastErr = err;
        console.warn(`update-download-attempt-${attempt}-failed`, err);
        // 指数退避后重试（最后一次不用等）。
        if (attempt < DOWNLOAD_ATTEMPTS) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    throw lastErr;
  } catch (err) {
    pendingUpdate = null;
    console.warn("update-check-or-download-failed", err);
    useStore.getState().setUpdateProgress(null);
    // 错误持续展示在设置面板（含原因），直到用户点击"重试"或下次自动检查。
    useStore.getState().setUpdateError(errMessage(err));
    useStore.getState().setUpdateState("error");
  }
}

// Install the downloaded update and relaunch into the new version.
export async function installUpdate(): Promise<void> {
  if (!pendingUpdate) return;
  const update = pendingUpdate;
  try {
    useStore.getState().setUpdateState("installing");
    await update.install();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    console.warn("update-install-failed", err);
    useStore.getState().setUpdateError(errMessage(err));
    useStore.getState().setUpdateState("error");
  }
}
