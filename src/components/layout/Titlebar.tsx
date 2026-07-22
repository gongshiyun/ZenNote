import { useState, useEffect, useCallback } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";

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
  const sourceMode = useStore(s => s.sourceMode);
  const setSourceMode = useStore(s => s.setSourceMode);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const toggleOutline = useStore(s => s.toggleOutline);
  const setSettingsVisible = useStore(s => s.setSettingsVisible);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    getAppWindow().then(win => {
      if (!win) return;
      win.isMaximized().then(setIsMaximized).catch(() => {});
    });
  }, []);

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
        <TB tn={t().titlebar.toggleSource} onClick={() => setSourceMode(!sourceMode)} active={sourceMode}><SourceIcon /></TB>
        <TB tn={t().titlebar.settings} onClick={() => setSettingsVisible(true)}><SettingsIcon /></TB>
      </div>
      <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: "var(--text-secondary)", pointerEvents: "none" }}>{fileName}</div>
      <div className="titlebar-no-drag" style={{ display: "flex", alignItems: "center", gap: 0 }}>
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
function SourceIcon() { return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,6 1,8 3,10"/><polyline points="13,6 15,8 13,10"/><line x1="6" y1="3" x2="10" y2="13"/></svg>); }
function OutlineIcon() { return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="12" y2="8"/><line x1="2" y1="12" x2="10" y2="12"/></svg>); }
function SettingsIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>); }
function MinIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="4.5" width="8" height="1" rx="0.5" fill="currentColor"/></svg>); }
function MaxIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/></svg>); }
function RestoreIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="3" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="3" y="1" width="6" height="6" rx="1" fill="var(--bg-toolbar)" stroke="currentColor" strokeWidth="1"/></svg>); }
function CloseIcon() { return (<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>); }
