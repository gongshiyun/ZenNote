import { useMemo } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { computeWordCount } from "../../domain";

export function StatusBar() {
  const cursorLine = useStore(s => s.cursorLine);
  const cursorCol = useStore(s => s.cursorCol);
  const content = useStore(s => s.content);
  const isDirty = useStore(s => s.isDirty);
  const sourceMode = useStore(s => s.sourceMode);
  const setSourceMode = useStore(s => s.setSourceMode);
  const currentFilePath = useStore(s => s.currentFilePath);

  const { totalWords, totalChars, lineCount } = useMemo(() => computeWordCount(content), [content]);

  return (
    <div style={{
      height: 28, display: "flex", alignItems: "center",
      padding: "0 12px", background: "var(--bg-statusbar)",
      borderTop: "1px solid var(--border)", fontSize: 12,
      color: "var(--text-secondary)", flexShrink: 0, gap: 8,
      userSelect: "none",
    }}>
      {/* Source mode toggle (Typora-style, bottom-left) */}
      <button
        onClick={() => setSourceMode(!sourceMode)}
        title={t().titlebar.toggleSource}
        style={{
          border: "none", background: sourceMode ? "var(--bg-sidebar-active)" : "transparent",
          color: sourceMode ? "#F59E0B" : "var(--text-secondary)",
          cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
          display: "flex", alignItems: "center", gap: 4, transition: "all 120ms ease",
        }}
        onMouseEnter={e => { if (!sourceMode) e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { if (!sourceMode) e.currentTarget.style.background = "transparent"; }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,6 1,8 3,10"/><polyline points="13,6 15,8 13,10"/><line x1="6" y1="3" x2="10" y2="13"/></svg>
        {sourceMode ? t().statusbar.source : t().statusbar.preview}
      </button>
      <span style={{ color: "var(--border)" }}>|</span>

      <span style={{ minWidth: 90 }}>Ln {cursorLine}, Col {cursorCol}</span>
      <span style={{ color: "var(--border)" }}>|</span>

      {currentFilePath && (
        <>
          <span style={{ color: isDirty ? "#F59E0B" : "var(--text-tertiary)", fontWeight: isDirty ? 600 : 400 }}>
            {isDirty ? "● " + t().statusbar.unsaved : "✓ " + t().statusbar.saved}
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
        </>
      )}

      <span style={{ flex: 1, textAlign: "center" }}>
        {totalWords > 0 && <span>{totalWords.toLocaleString()} {t().statusbar.words}</span>}
        {totalChars > 0 && <span> · {totalChars.toLocaleString()} {t().statusbar.chars}</span>}
        {lineCount > 1 && <span> · {lineCount} {t().statusbar.lines}</span>}
      </span>
    </div>
  );
}
