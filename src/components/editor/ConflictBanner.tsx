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
import { AlertTriangleIcon } from "../ui";

export function ConflictBanner() {
  const externalConflict = useStore(s => s.externalConflict);
  const currentFilePath = useStore(s => s.currentFilePath);

  if (!externalConflict || externalConflict.path !== currentFilePath) return null;

  const deleted = externalConflict.reason === "deleted";
  const message = deleted ? t().editor.externalDeleted : t().editor.externalModified;

  return (
    <div
      className="zn-conflict"
      data-deleted={deleted || undefined}
      role={deleted ? "status" : "alert"}
    >
      <span className="zn-conflict__icon">
        <AlertTriangleIcon size={15} />
      </span>
      <span className="zn-conflict__text" title={message}>{message}</span>
      <div className="zn-conflict__actions">
        {!deleted && (
          <button
            type="button"
            className="zn-conflict__btn"
            onClick={() => reloadExternalConflict(externalConflict.path)}
          >
            {t().editor.reloadExternal}
          </button>
        )}
        <button
          type="button"
          className="zn-conflict__btn"
          onClick={() => keepExternalConflict(externalConflict.path)}
        >
          {t().editor.keepLocal}
        </button>
      </div>
    </div>
  );
}
