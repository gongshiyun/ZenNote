import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "../../store";
import { t, setLocale } from "../../i18n";

// Tauri window API - lazy init to survive browser dev
let _appWindow: any = null;
async function getAppWindow() {
  if (_appWindow) return _appWindow;
  try {
    const m = await import("@tauri-apps/api/window");
    _appWindow = m.getCurrentWindow();
    return _appWindow;
  } catch {
    return null;
  }
}

export function Titlebar() {
  const currentFilePath = useStore(s => s.currentFilePath);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const toggleOutline = useStore(s => s.toggleOutline);
  const setSettingsVisible = useStore(s => s.setSettingsVisible);
  const mode = useStore(s => s.mode);
  const setMode = useStore(s => s.setMode);
  const themeId = useStore(s => s.themeId);
  const setThemeId = useStore(s => s.setThemeId);
  const locale = useStore(s => s.locale);
  const storeSetLocale = useStore(s => s.setLocale);
  const [isMaximized, setIsMaximized] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAppWindow().then(win => {
      if (!win) return;
      win.isMaximized().then(setIsMaximized).catch(() => {});
    });
  }, []);

  // Close theme dropdown on outside click
  useEffect(() => {
    if (!themeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) setThemeMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [themeMenuOpen]);

  const minimize = useCallback(() => {
    getAppWindow().then(win => win?.minimize().catch(() => {}));
  }, []);
  const toggleMax = useCallback(() => {
    getAppWindow().then(win => {
      if (!win) return;
      win.toggleMaximize().then(() => setIsMaximized(v => !v)).catch(() => {});
    });
  }, []);
  const close = useCallback(() => {
    getAppWindow().then(win => win?.close().catch(() => {}));
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.closest("button")) return;
    toggleMax();
  }, [toggleMax]);

  const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() || "ZenNote" : "ZenNote";

  return (
    <div className="titlebar-drag" onDoubleClick={handleDoubleClick}
      style={{ height: 36, display: "flex", alignItems: "center", background: "var(--bg-toolbar)", borderBottom: "1px solid var(--border)", flexShrink: 0, userSelect: "none" }}>
      <div className="titlebar-no-drag" style={{ display: "flex", alignItems: "center", paddingLeft: 8, gap: 2 }}>
        <TB tn={t().titlebar.toggleSidebar} onClick={toggleSidebar}><SidebarIcon /></TB>
        <TB tn={t().titlebar.toggleOutline} onClick={toggleOutline}><OutlineIcon /></TB>
        <TB tn={t().titlebar.settings} onClick={() => setSettingsVisible(true)}><SettingsIcon /></TB>
      </div>
      <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: "var(--text-secondary)", pointerEvents: "none" }}>{fileName}</div>
      <div className="titlebar-no-drag" style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {/* Theme selector */}
        <div ref={themeMenuRef} style={{ position: "relative" }}>
          <TB tn={t().titlebar.theme} onClick={() => setThemeMenuOpen(v => !v)} active={themeMenuOpen}><PaletteIcon /></TB>
          {themeMenuOpen && (
            <ThemeDropdown
              themeId={themeId} mode={mode}
              onSelectTheme={(id) => { setThemeId(id); }}
              onSelectMode={(m) => { setMode(m); setThemeMenuOpen(false); }}
              onClose={() => setThemeMenuOpen(false)}
            />
          )}
        </div>
        {/* Language toggle */}
        <TB tn={locale === "zh-CN" ? "Switch to English" : "切换为中文"} onClick={() => {
          const next = locale === "zh-CN" ? "en-US" : "zh-CN";
          storeSetLocale(next); setLocale(next);
        }}><span style={{ fontSize: 11, fontWeight: 700 }}>{locale === "zh-CN" ? "中" : "EN"}</span></TB>
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
        <WB tn={t().titlebar.minimize} onClick={minimize}><MinIcon /></WB>
        <WB tn={t().titlebar.maximize} onClick={toggleMax}>
          {isMaximized ? <RestoreIcon /> : <MaxIcon />}
        </WB>
        <WB tn={t().titlebar.close} onClick={close} isClose><CloseIcon /></WB>
      </div>
    </div>
  );
}

function TB(p: { children: React.ReactNode; onClick: () => void; tn?: string; active?: boolean }) {
  return <button onClick={p.onClick} title={p.tn}
    style={{ width: 32, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 6, background: p.active ? "var(--bg-sidebar-hover)" : "transparent", color: p.active ? "var(--text-accent)" : "var(--text-secondary)", cursor: "pointer", transition: "background-color 150ms ease, color 150ms ease" }}
    onMouseEnter={e => { if (!p.active) e.currentTarget.style.background = "var(--bg-hover)"; }}
    onMouseLeave={e => { if (!p.active) e.currentTarget.style.background = "transparent"; }}>{p.children}</button>;
}

function WB(p: { children: React.ReactNode; onClick: () => void; tn?: string; isClose?: boolean }) {
  return <button onClick={p.onClick} title={p.tn}
    style={{ width: 46, height: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 0, background: "transparent", color: "var(--text-secondary)", cursor: "pointer", transition: "background-color 150ms ease" }}
    onMouseEnter={e => { e.currentTarget.style.background = p.isClose ? "var(--titlebar-close-hover)" : "var(--titlebar-btn-hover)"; if (p.isClose) e.currentTarget.style.color = "#fff"; }}
    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}>{p.children}</button>;
}

function SidebarIcon() { return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="5" height="12" rx="1"/><rect x="8" y="2" width="7" height="12" rx="1"/></svg>); }
function OutlineIcon() { return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="12" y2="8"/><line x1="2" y1="12" x2="10" y2="12"/></svg>); }
function SettingsIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>); }
function MinIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="4.5" width="8" height="1" rx="0.5" fill="currentColor"/></svg>); }
function MaxIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/></svg>); }
function RestoreIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="3" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="3" y="1" width="6" height="6" rx="1" fill="var(--bg-toolbar)" stroke="currentColor" strokeWidth="1"/></svg>); }
function CloseIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>); }
function PaletteIcon() { return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 1.5a6.5 6.5 0 100 13c1.1 0 1.6-.7 1.6-1.5 0-.5-.2-.8-.5-1.1-.3-.3-.5-.6-.5-1.1 0-.8.7-1.5 1.5-1.5h1.4A3 3 0 0014.5 8c0-3.6-2.9-6.5-6.5-6.5z"/><circle cx="5.5" cy="6" r="0.9" fill="currentColor" stroke="none"/><circle cx="8" cy="4.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="10.5" cy="6" r="0.9" fill="currentColor" stroke="none"/><circle cx="5" cy="9" r="0.9" fill="currentColor" stroke="none"/></svg>); }

// ---- Theme Dropdown ----
const THEMES = [
  { id: "zen", colors: ["#3B82F6", "#FFFFFF", "#1E1E1E"] },
  { id: "github", colors: ["#0969DA", "#F6F8FA", "#0D1117"] },
  { id: "notion", colors: ["#2383E2", "#F7F7F5", "#191919"] },
  { id: "paper", colors: ["#B4823C", "#FBF7F0", "#2A2520"] },
  { id: "ocean", colors: ["#1E64B4", "#F5F8FC", "#0F1923"] },
];

function ThemeDropdown({ themeId, mode, onSelectTheme, onSelectMode }: {
  themeId: string; mode: string;
  onSelectTheme: (id: string) => void;
  onSelectMode: (m: "light" | "dark" | "system") => void;
  onClose: () => void;
}) {
  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
    fontSize: 12, cursor: "pointer", borderRadius: 6, margin: "1px 4px",
    background: active ? "var(--bg-sidebar-active)" : "transparent",
    color: active ? "var(--text-accent)" : "var(--text-primary)",
    fontWeight: active ? 600 : 400,
  });
  return (
    <div style={{
      position: "absolute", top: "100%", right: 0, marginTop: 6, width: 200,
      background: "var(--bg-toolbar)", border: "1px solid var(--border)",
      borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "6px 0",
      zIndex: 1000,
    }}>
      {/* Theme list */}
      <div style={{ padding: "4px 12px 6px", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>{t().titlebar.themeStyle}</div>
      {THEMES.map(th => (
        <div key={th.id} style={itemStyle(themeId === th.id)}
          onMouseEnter={e => { if (themeId !== th.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { if (themeId !== th.id) e.currentTarget.style.background = "transparent"; }}
          onClick={() => onSelectTheme(th.id)}>
          <span style={{ display: "flex", gap: 2 }}>
            {th.colors.map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, border: "1px solid var(--border)" }} />)}
          </span>
          <span style={{ flex: 1 }}>{(t().titlebar as Record<string, string>)["theme_" + th.id] ?? th.id}</span>
          {themeId === th.id && <span style={{ fontSize: 11 }}>✓</span>}
        </div>
      ))}
      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", margin: "6px 8px" }} />
      {/* Mode */}
      <div style={{ padding: "2px 12px 6px", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>{t().titlebar.themeMode}</div>
      {(["light", "dark", "system"] as const).map(m => (
        <div key={m} style={itemStyle(mode === m)}
          onMouseEnter={e => { if (mode !== m) e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { if (mode !== m) e.currentTarget.style.background = "transparent"; }}
          onClick={() => onSelectMode(m)}>
          <span>{m === "light" ? "☀️" : m === "dark" ? "🌙" : "🖼"}</span>
          <span style={{ flex: 1 }}>{m === "light" ? t().statusbar.light : m === "dark" ? t().statusbar.dark : t().statusbar.system}</span>
          {mode === m && <span style={{ fontSize: 11 }}>✓</span>}
        </div>
      ))}
    </div>
  );
}
