import { useMemo } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { computeWordCount, WORDS_PER_MINUTE } from "../../domain";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Spinner } from "../ui";
import { AlertTriangleIcon, CircleCheckIcon, CodeIcon } from "../ui/icons";

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
    <div className="zn-statusbar">
      {/* Source mode toggle (Typora-style, bottom-left) */}
      <button
        type="button"
        className="zn-statusbar__toggle"
        data-active={sourceMode || undefined}
        title={t().titlebar.toggleSource}
        aria-label={t().titlebar.toggleSource}
        aria-pressed={sourceMode}
        onClick={() => setSourceMode(!sourceMode)}
      >
        <CodeIcon size={13} />
        <span>{sourceMode ? t().statusbar.source : t().statusbar.preview}</span>
      </button>

      {/* Fields are separated by the flex `gap` rather than by "|" glyphs; the
          Claude-style status strip relies on spacing alone. */}
      {(!currentFilePath && cursorLine === 1 && cursorCol === 1) ? null : (
        <span className="zn-statusbar__item zn-statusbar__position zn-mono">
          Ln {cursorLine}, Col {cursorCol}
        </span>
      )}

      {currentFilePath && (
        <span className="zn-statusbar__item zn-statusbar__save" data-dirty={isDirty || undefined}>
          {isDirty
            ? <span className="zn-statusbar__dot" aria-hidden="true" />
            : <CircleCheckIcon size={12} className="zn-statusbar__save-icon" />}
          <span>
            {isDirty ? t().statusbar.unsaved : t().statusbar.saved}
            {!isDirty && savedTimeLabel ? " " + savedTimeLabel : ""}
          </span>
        </span>
      )}

      {saveError && (
        <span className="zn-statusbar__item zn-statusbar__error" title={saveError}>
          <AlertTriangleIcon size={12} />
          <span className="zn-statusbar__error-text">
            {t().statusbar.saveFailed}: {saveError}
          </span>
        </span>
      )}

      {selectionCharCount > 0 && (
        <span className="zn-statusbar__item zn-statusbar__selection">
          {t().statusbar.selection} {selectionCharCount} {t().statusbar.chars} / {selectionWordCount} {t().statusbar.words}
        </span>
      )}

      {imageUploadCount > 0 && (
        <span className="zn-statusbar__item zn-statusbar__selection">
          <Spinner size={10} />
          {t().statusbar.imageProcessing}
        </span>
      )}

      <span className="zn-statusbar__stats">
        {totalWords > 0 && <span>{totalWords.toLocaleString()} {t().statusbar.words}</span>}
        {totalChars > 0 && <span> · {totalChars.toLocaleString()} {t().statusbar.chars}</span>}
        {lineCount > 1 && <span> · {lineCount} {t().statusbar.lines}</span>}
        {readMin > 0 && <span> · {t().statusbar.readTimeAbout} {readMin} {t().statusbar.readTime}</span>}
      </span>
    </div>
  );
}
