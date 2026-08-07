import { useStore } from "../../store";
import { t, setLocale } from "../../i18n";
import { useRef, useEffect } from "react";
import { checkAndDownloadUpdate } from "../../lib/updater";

const SETTINGS_THEMES = [
  { id: "zen", label: "Zen", colors: ["#3B82F6", "#FFFFFF", "#1E1E1E"] },
  { id: "github", label: "GitHub", colors: ["#0969DA", "#F6F8FA", "#0D1117"] },
  { id: "notion", label: "Notion", colors: ["#2383E2", "#F7F7F5", "#191919"] },
  { id: "paper", label: "Paper", colors: ["#B4823C", "#FBF7F0", "#2A2520"] },
  { id: "ocean", label: "Ocean", colors: ["#1E64B4", "#F5F8FC", "#0F1923"] },
];

// Curated font styles. `stack` is a representative preview stack (the full stack
// lives in globals.css under :root[data-font="..."]).
const FONT_OPTIONS = [
  { value: "sans", labelKey: "fontSans", stack: '"Microsoft YaHei", "Segoe UI", sans-serif' },
  { value: "serif", labelKey: "fontSerif", stack: 'Georgia, "Noto Serif SC", serif' },
  { value: "mono", labelKey: "fontMono", stack: '"Cascadia Code", Consolas, monospace' },
  { value: "kai", labelKey: "fontKai", stack: '"KaiTi", "楷体", serif' },
  { value: "song", labelKey: "fontSong", stack: '"SimSun", "宋体", serif' },
  { value: "heiti", labelKey: "fontHeiti", stack: '"SimHei", "黑体", sans-serif' },
  { value: "fangsong", labelKey: "fontFangsong", stack: '"FangSong", "仿宋", serif' },
  { value: "rounded", labelKey: "fontRounded", stack: '"Yuanti SC", "YouYuan", sans-serif' },
  { value: "humanist", labelKey: "fontHumanist", stack: '"Segoe UI", Verdana, sans-serif' },
  { value: "geometric", labelKey: "fontGeometric", stack: '"Century Gothic", Futura, sans-serif' },
  { value: "literary", labelKey: "fontLiterary", stack: '"Palatino Linotype", Palatino, serif' },
  { value: "slab", labelKey: "fontSlab", stack: 'Rockwell, "Roboto Slab", serif' },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const fontSize = useStore(s => s.fontSize);
  const setFontSize = useStore(s => s.setFontSize);
  const tabSize = useStore(s => s.tabSize);
  const setTabSize = useStore(s => s.setTabSize);
  const editorPadding = useStore(s => s.editorPadding);
  const setEditorPadding = useStore(s => s.setEditorPadding);
  const autoSaveDelay = useStore(s => s.autoSaveDelay);
  const setAutoSaveDelay = useStore(s => s.setAutoSaveDelay);
  const showHiddenFiles = useStore(s => s.showHiddenFiles);
  const setShowHiddenFiles = useStore(s => s.setShowHiddenFiles);
  const showFileExtensions = useStore(s => s.showFileExtensions);
  const setShowFileExtensions = useStore(s => s.setShowFileExtensions);
  const defaultSourceMode = useStore(s => s.defaultSourceMode);
  const setDefaultSourceMode = useStore(s => s.setDefaultSourceMode);
  const mode = useStore(s => s.mode);
  const setMode = useStore(s => s.setMode);
  const themeId = useStore(s => s.themeId);
  const setThemeId = useStore(s => s.setThemeId);
  const fontFamily = useStore(s => s.fontFamily);
  const setFontFamily = useStore(s => s.setFontFamily);
  const locale = useStore(s => s.locale);
  const storeSetLocale = useStore(s => s.setLocale);
  const autoCheckUpdate = useStore(s => s.autoCheckUpdate);
  const setAutoCheckUpdate = useStore(s => s.setAutoCheckUpdate);
  const updateCheckInterval = useStore(s => s.updateCheckInterval);
  const setUpdateCheckInterval = useStore(s => s.setUpdateCheckInterval);
  const updateState = useStore(s => s.updateState);
  const updateVersion = useStore(s => s.updateVersion);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose();
    };
    // Delay to avoid immediate close from the click that opened it
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const themes: { label: string; value: "light" | "dark" | "system" }[] = [
    { label: t().statusbar.light, value: "light" },
    { label: t().statusbar.dark, value: "dark" },
    { label: t().statusbar.system, value: "system" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 950,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.35)",
    }}>
      <div ref={dialogRef} style={{
        width: 480, maxHeight: "80vh", overflow: "auto",
        background: "var(--bg-toolbar)", borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        border: "1px solid var(--border)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{t().settings.title}</span>
          <button onClick={onClose} style={{
            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", borderRadius: 6, background: "transparent", color: "var(--text-secondary)",
            cursor: "pointer", fontSize: 16,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            <svg width="16" height="16" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Section: Appearance */}
          <Section title={t().settings.appearance}>
            <Row label={t().settings.theme}>
              <div style={{ display: "flex", gap: 4, background: "var(--bg-sidebar)", borderRadius: 6, padding: 2 }}>
                {themes.map(t => (
                  <button key={t.value} onClick={() => setMode(t.value)} style={{
                    padding: "5px 14px", border: "none", borderRadius: 4,
                    fontSize: 12, fontWeight: mode === t.value ? 600 : 400,
                    background: mode === t.value ? "var(--bg-toolbar)" : "transparent",
                    color: mode === t.value ? "var(--text-accent)" : "var(--text-secondary)",
                    cursor: "pointer", transition: "all 120ms ease",
                    boxShadow: mode === t.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}>{t.label}</button>
                ))}
              </div>
            </Row>
            <Row label={t().settings.themeStyle}>
              <div style={{ display: "flex", gap: 6 }}>
                {SETTINGS_THEMES.map(th => (
                  <button key={th.id} onClick={() => setThemeId(th.id)} title={th.label} style={{
                    width: 32, height: 32, borderRadius: 8, cursor: "pointer", padding: 0,
                    border: themeId === th.id ? "2px solid var(--text-accent)" : "1px solid var(--border)",
                    background: "linear-gradient(135deg, " + th.colors[1] + " 50%, " + th.colors[2] + " 50%)",
                    position: "relative", overflow: "hidden", transition: "border 120ms ease",
                  }}>
                    <span style={{ position: "absolute", top: 3, left: 3, width: 8, height: 8, borderRadius: "50%", background: th.colors[0] }} />
                  </button>
                ))}
              </div>
            </Row>
            <div style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 8 }}>{t().settings.fontFamily}</div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
                maxHeight: 240, overflowY: "auto", paddingRight: 2,
              }}>
                {FONT_OPTIONS.map(f => {
                  const active = fontFamily === f.value;
                  return (
                    <div key={f.value} onClick={() => setFontFamily(f.value)}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = "var(--text-accent)"; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "var(--border)"; }}
                      style={{
                        padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                        border: "1px solid " + (active ? "var(--text-accent)" : "var(--border)"),
                        background: active ? "var(--bg-sidebar-active)" : "var(--bg-sidebar)",
                        transition: "border-color 120ms ease, background 120ms ease",
                      }}>
                      <div style={{
                        fontFamily: f.stack, fontSize: 16, color: "var(--text-primary)",
                        lineHeight: 1.4, marginBottom: 3, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        字体预览 Aa
                      </div>
                      <div style={{ fontSize: 10, color: active ? "var(--text-accent)" : "var(--text-tertiary)" }}>
                        {(t().settings as Record<string, string>)[f.labelKey]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Row label={t().settings.fontSize}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={12} max={24} step={1} value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  style={{ width: 100, accentColor: "var(--text-accent)" }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 28, textAlign: "center" }}>{fontSize}px</span>
              </div>
            </Row>
          </Section>

          {/* Section: Editor */}
          <Section title={t().settings.editorLabel}>
            <Row label={t().settings.tabSize}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={2} max={8} step={2} value={tabSize}
                  onChange={e => setTabSize(Number(e.target.value))}
                  style={{ width: 100, accentColor: "var(--text-accent)" }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 20, textAlign: "center" }}>{tabSize}</span>
              </div>
            </Row>
            <Row label={t().settings.editorPadding}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={16} max={500} step={4} value={editorPadding}
                  onChange={e => setEditorPadding(Number(e.target.value))}
                  style={{ width: 100, accentColor: "var(--text-accent)" }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 36, textAlign: "center" }}>{editorPadding}px</span>
              </div>
            </Row>
            <Row label={t().settings.autoSaveDelay}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={0} max={10000} step={500} value={autoSaveDelay}
                  onChange={e => setAutoSaveDelay(Number(e.target.value))}
                  style={{ width: 100, accentColor: "var(--text-accent)" }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 42, textAlign: "center" }}>
                  {autoSaveDelay === 0 ? "Off" : autoSaveDelay >= 1000 ? (autoSaveDelay / 1000).toFixed(1) + "s" : autoSaveDelay + "ms"}
                </span>
              </div>
            </Row>
            <Row label={t().settings.defaultSourceMode}>
              <Toggle checked={defaultSourceMode} onChange={setDefaultSourceMode} />
            </Row>
          </Section>


          {/* Section: Locale */}
          <Section title={t().settings.language}>
            <Row label={t().settings.language}>
              <div style={{ display: "flex", gap: 4, background: "var(--bg-sidebar)", borderRadius: 6, padding: 2 }}>
                <button onClick={() => { storeSetLocale("zh-CN"); setLocale("zh-CN"); }} style={{
                  padding: "5px 14px", border: "none", borderRadius: 4,
                  fontSize: 12, fontWeight: locale === "zh-CN" ? 600 : 400,
                  background: locale === "zh-CN" ? "var(--bg-toolbar)" : "transparent",
                  color: locale === "zh-CN" ? "var(--text-accent)" : "var(--text-secondary)",
                  cursor: "pointer", transition: "all 120ms ease",
                  boxShadow: locale === "zh-CN" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}>中文</button>
                <button onClick={() => { storeSetLocale("en-US"); setLocale("en-US"); }} style={{
                  padding: "5px 14px", border: "none", borderRadius: 4,
                  fontSize: 12, fontWeight: locale === "en-US" ? 600 : 400,
                  background: locale === "en-US" ? "var(--bg-toolbar)" : "transparent",
                  color: locale === "en-US" ? "var(--text-accent)" : "var(--text-secondary)",
                  cursor: "pointer", transition: "all 120ms ease",
                  boxShadow: locale === "en-US" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}>English</button>
              </div>
            </Row>
          </Section>

          {/* Section: Update */}
          <Section title={t().settings.update}>
            <Row label={t().settings.autoCheckUpdate}>
              <Toggle checked={autoCheckUpdate} onChange={setAutoCheckUpdate} />
            </Row>
            <Row label={t().settings.updateInterval}>
              <select value={updateCheckInterval} onChange={e => setUpdateCheckInterval(Number(e.target.value))}
                disabled={!autoCheckUpdate}
                style={{
                  padding: "4px 8px", fontSize: 12, borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--bg-sidebar)",
                  color: "var(--text-primary)", cursor: "pointer", outline: "none",
                  opacity: autoCheckUpdate ? 1 : 0.5,
                }}>
                <option value={30}>{t().settings.interval30m}</option>
                <option value={60}>{t().settings.interval1h}</option>
                <option value={360}>{t().settings.interval6h}</option>
                <option value={1440}>{t().settings.interval24h}</option>
              </select>
            </Row>
            <Row label={t().settings.checkNow}>
              <button onClick={() => { void checkAndDownloadUpdate(); }} style={{
                padding: "5px 14px", border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 12, background: "var(--bg-sidebar)", color: "var(--text-primary)",
                cursor: "pointer", transition: "all 120ms ease",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-sidebar)"; }}>
                {updateState === "checking" ? t().settings.checking : updateState === "downloading" ? t().settings.downloading : updateState === "ready" ? (t().settings.updateReady + " v" + (updateVersion || "")) : t().settings.checkNow}
              </button>
            </Row>
          </Section>

          {/* Section: File Tree */}
          <Section title={t().settings.fileTree}>
            <Row label={t().settings.showHiddenFiles}>
              <Toggle checked={showHiddenFiles} onChange={setShowHiddenFiles} />
            </Row>
            <Row label={t().settings.showFileExtensions}>
              <Toggle checked={showFileExtensions} onChange={setShowFileExtensions} />
            </Row>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 36, height: 20, borderRadius: 10, border: "none",
      background: checked ? "var(--text-accent)" : "var(--border)",
      cursor: "pointer", position: "relative", transition: "background 150ms ease",
      flexShrink: 0,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff",
        position: "absolute", top: 2,
        left: checked ? 18 : 2,
        transition: "left 150ms ease",
      }} />
    </button>
  );
}