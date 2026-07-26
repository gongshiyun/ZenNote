import { useStore } from "../../store";
import { t, setLocale } from "../../i18n";
import { useRef, useEffect } from "react";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const fontSize = useStore(s => s.fontSize);
  const setFontSize = useStore(s => s.setFontSize);
  const tabSize = useStore(s => s.tabSize);
  const setTabSize = useStore(s => s.setTabSize);
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
  const locale = useStore(s => s.locale);
  const storeSetLocale = useStore(s => s.setLocale);

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
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
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