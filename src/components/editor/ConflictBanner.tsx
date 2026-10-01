/**
 * "This file changed on disk" banner.
 *
 * Extracted from the Crepe editor's render so BOTH editors show it. Without it
 * the Live Preview editor silently accepted external overwrites with no way to
 * reload or to keep the local version — a data-loss-shaped gap, not a cosmetic
 * one.
 */
import { useStore } from "../../store";
import { t } from "../../i18n";
import { keepExternalConflict, reloadExternalConflict } from "../../lib/workspaceWatcher";

export function ConflictBanner() {
  const externalConflict = useStore(s => s.externalConflict);
  const currentFilePath = useStore(s => s.currentFilePath);

  if (!externalConflict || externalConflict.path !== currentFilePath) return null;

  const deleted = externalConflict.reason === "deleted";

  return (
    <div style={{
      padding: "7px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 10,
      background: deleted ? "var(--bg-toolbar)" : "#FEF3C7",
      color: deleted ? "var(--text-secondary)" : "#92400E",
      borderBottom: "1px solid var(--border)", flexShrink: 0,
    }}>
      <span>
        {deleted ? t().editor.externalDeleted : t().editor.externalModified}
      </span>
      {!deleted && (
        <button
          onClick={() => reloadExternalConflict(externalConflict.path)}
          style={{
            border: "1px solid currentColor", background: "transparent",
            color: "inherit", borderRadius: 4, padding: "2px 8px", cursor: "pointer",
          }}
        >
          {t().editor.reloadExternal}
        </button>
      )}
      <button
        onClick={() => keepExternalConflict(externalConflict.path)}
        style={{
          border: "1px solid var(--border)", background: "var(--bg-editor)",
          color: "var(--text-primary)", borderRadius: 4, padding: "2px 8px", cursor: "pointer",
        }}
      >
        {t().editor.keepLocal}
      </button>
    </div>
  );
}
