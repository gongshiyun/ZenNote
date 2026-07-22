import { useStore } from "../../store";
import { t, setLocale } from "../../i18n";

export function StatusBar() {
  const cursorLine = useStore(s => s.cursorLine);
  const cursorCol = useStore(s => s.cursorCol);
  const content = useStore(s => s.content);
  const isDirty = useStore(s => s.isDirty);
  const sourceMode = useStore(s => s.sourceMode);
  const mode = useStore(s => s.mode);
  const setMode = useStore(s => s.setMode);
  const currentFilePath = useStore(s => s.currentFilePath);
  const locale = useStore(s => s.locale);
  const storeSetLocale = useStore(s => s.setLocale);

  const chineseChars = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ").split(/\s+/).filter(Boolean).length;
  const totalWords = chineseChars + englishWords;
  const totalChars = content.length;
  const lineCount = content ? content.split(/\r?\n/).length : 0;

  const cycleTheme = () => {
    const modes = ["light", "dark", "system"] as const;
    const idx = modes.indexOf(mode);
    setMode(modes[(idx + 1) % modes.length]);
  };

  const cycleLocale = () => {
    const next = locale === "zh-CN" ? "en-US" : "zh-CN";
    storeSetLocale(next);
    setLocale(next);
  };

  const themeIcon = mode === "system" ? "🖼" : mode === "dark" ? "🌙" : "☀️";
  const themeLabel = mode === "system" ? t().statusbar.system : mode === "dark" ? t().statusbar.dark : t().statusbar.light;
  const localeLabel = locale === "zh-CN" ? "中" : "EN";

  return (
    <div style={{
      height: 28, display: "flex", alignItems: "center",
      padding: "0 12px", background: "var(--bg-statusbar)",
      borderTop: "1px solid var(--border)", fontSize: 12,
      color: "var(--text-secondary)", flexShrink: 0, gap: 8,
      userSelect: "none",
    }}>
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

      <span style={{ color: sourceMode ? "#F59E0B" : "var(--text-accent)", fontWeight: 500 }}>
        {sourceMode ? t().statusbar.source : t().statusbar.preview}
      </span>
      <span style={{ color: "var(--border)" }}>|</span>

      <button
        onClick={cycleTheme}
        title={t().statusbar.theme + ": " + themeLabel}
        style={{
          border: "none", background: "transparent", color: "var(--text-secondary)",
          cursor: "pointer", fontSize: 13, padding: "2px 6px", borderRadius: 4,
          display: "flex", alignItems: "center", gap: 4,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
        <span>{themeIcon}</span>
      </button>

      <span style={{ color: "var(--border)" }}>|</span>

      <button
        onClick={cycleLocale}
        title={locale === "zh-CN" ? "Switch to English" : "切换为中文"}
        style={{
          border: "none", background: "transparent", color: "var(--text-secondary)",
          cursor: "pointer", fontSize: 12, padding: "2px 6px", borderRadius: 4,
          fontWeight: 600, minWidth: 24, textAlign: "center",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
        {localeLabel}
      </button>
    </div>
  );
}
