import { useEffect } from "react";
import { useStore } from "../store";
import { checkAndDownloadUpdate } from "../lib/updater";

// Drives the periodic auto-update check based on the user's settings.
export function useUpdater() {
  const autoCheckUpdate = useStore(s => s.autoCheckUpdate);
  const updateCheckInterval = useStore(s => s.updateCheckInterval);

  useEffect(() => {
    if (!autoCheckUpdate) return;
    // Initial check shortly after launch (give the app a moment to settle).
    const kickoff = window.setTimeout(() => { checkAndDownloadUpdate(); }, 5000);
    const ms = Math.max(1, updateCheckInterval) * 60 * 1000;
    const timer = window.setInterval(() => { checkAndDownloadUpdate(); }, ms);
    return () => { window.clearTimeout(kickoff); window.clearInterval(timer); };
  }, [autoCheckUpdate, updateCheckInterval]);
}
