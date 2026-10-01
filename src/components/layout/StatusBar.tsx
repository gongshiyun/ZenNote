import { useMemo } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { computeWordCount, WORDS_PER_MINUTE } from "../../domain";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

export function StatusBar() {
  const cursorLine = useStore(s => s.cursorLine);
  const cursorCol = useStore(s => s.cursorCol);
  const content = useStore(s => s.content);
  const isDirty = useStore(s => s.isDirty);
  const sourceMode = useStore(s => s.sourceMode);
  const setSourceMode = useStore(s => s.setSourceMode);
  const currentFilePath = useStore(s => s.currentFilePath);
  const lastSavedAt = useStore(s => s.lastSavedAt);
  const saveError = useStore(s => s.saveError);
  const selectionCharCount = useStore(s => s.selectionCharCount);
  const selectionWordCount = useStore(s => s.selectionWordCount);
  const imageUploadCount = useStore(s => s.imageUploadCount);

  // 词数/字数/行数/阅读时长是全文扫描统计，不能压在每次按键的热路径上：
  // 防抖 500ms 后刷新（初始值立即返回，首屏展示不受影响）。Ln/Col 仍然即时。
  const debouncedContent = useDebouncedValue(content, 500);

  // 单次扫描得到全部统计（阅读时长直接从 totalWords 推导，避免再扫一遍全文）。
  const { totalWords, totalChars, lineCount, readMin } = useMemo(() => {
    const stats = computeWordCount(debouncedContent);
    return {
      ...stats,
      readMin: stats.totalWords > 0 ? Math.max(1, Math.ceil(stats.totalWords / WORDS_PER_MINUTE)) : 0,
    };
  }, [debouncedContent]);
  const savedTimeLabel = useMemo(() => {
    if (!lastSavedAt) return "";
    const d = new Date(lastSavedAt);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }, [lastSavedAt]);

  return (
    <div style={{
      height: 24, display: "flex", alignItems: "center",
      padding: "0 10px", background: "var(--bg-statusbar)",
      borderTop: "1px solid var(--border)", fontSize: 11.5,
      color: "var(--text-tertiary)", flexShrink: 0, gap: 14,
      userSelect: "none",
    }}>
      {/* Source mode toggle (Typora-style, bottom-left) */}
      <button
        onClick={() => setSourceMode(!sourceMode)}
        title={t().titlebar.toggleSource}
        style={{
          border: "none", background: sourceMode ? "var(--bg-sidebar-active)" : "transparent",
          color: sourceMode ? "var(--text-warning)" : "var(--text-secondary)",
          cursor: "pointer", fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 4,
          display: "flex", alignItems: "center", gap: 4, transition: "all 120ms ease",
        }}
        onMouseEnter={e => { if (!sourceMode) e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { if (!sourceMode) e.currentTarget.style.background = "transparent"; }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,6 1,8 3,10"/><polyline points="13,6 15,8 13,10"/><line x1="6" y1="3" x2="10" y2="13"/></svg>
        {sourceMode ? t().statusbar.source : t().statusbar.preview}
      </button>

      {/* Fields are separated by the flex `gap` above rather than by "|" glyphs.
          Pipe separators are the most dated thing in the old chrome and read as
          an IDE from 2008; Claude's status strip relies on spacing alone. */}
      <span style={{ minWidth: 80 }}>Ln {cursorLine}, Col {cursorCol}</span>

      {currentFilePath && (
        <span style={{ color: isDirty ? "var(--text-warning)" : "var(--text-tertiary)", fontWeight: isDirty ? 500 : 400 }}>
          {isDirty
            ? "● " + t().statusbar.unsaved
            : "✓ " + t().statusbar.saved + (savedTimeLabel ? " " + savedTimeLabel : "")}
        </span>
      )}

      {saveError && (
        <span title={saveError} style={{ color: "var(--text-danger)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t().statusbar.saveFailed}: {saveError}
        </span>
      )}

      {selectionCharCount > 0 && (
        <span style={{ color: "var(--text-accent)" }}>
          {t().statusbar.selection} {selectionCharCount} {t().statusbar.chars} / {selectionWordCount} {t().statusbar.words}
        </span>
      )}

      {imageUploadCount > 0 && (
        <span style={{ color: "var(--text-accent)" }}>
          {t().statusbar.imageProcessing}
        </span>
      )}

      <span style={{ flex: 1, textAlign: "center" }}>
        {totalWords > 0 && <span>{totalWords.toLocaleString()} {t().statusbar.words}</span>}
        {totalChars > 0 && <span> · {totalChars.toLocaleString()} {t().statusbar.chars}</span>}
        {lineCount > 1 && <span> · {lineCount} {t().statusbar.lines}</span>}
        {readMin > 0 && <span> · {t().statusbar.readTimeAbout} {readMin} {t().statusbar.readTime}</span>}
      </span>
    </div>
  );
}
