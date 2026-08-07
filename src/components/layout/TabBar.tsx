import { useState, useEffect, useRef } from "react";
import { useStore } from "../../store";
import { noteName } from "../../domain";
import { t } from "../../i18n";

// Typora/VS Code-style tab bar: one tab per open note, dirty dot, click to
// switch, middle-click or × to close (dirty tabs ask for confirmation first),
// RIGHT-CLICK for a context menu (close others / close to the left / right /
// close all / copy path).

interface TabMenuState {
  path: string;
  x: number;
  y: number;
}

export function TabBar() {
  const openTabs = useStore(s => s.openTabs);
  const currentFilePath = useStore(s => s.currentFilePath);
  const isDirty = useStore(s => s.isDirty);
  const fileStates = useStore(s => s.fileStates);
  const switchTab = useStore(s => s.switchTab);
  const closeTab = useStore(s => s.closeTab);
  const closeOtherTabs = useStore(s => s.closeOtherTabs);
  const closeTabsToLeft = useStore(s => s.closeTabsToLeft);
  const closeTabsToRight = useStore(s => s.closeTabsToRight);
  const closeAllTabs = useStore(s => s.closeAllTabs);
  const [menu, setMenu] = useState<TabMenuState | null>(null);

  if (!openTabs.length) return null;

  const dirtyOf = (path: string): boolean => {
    if (path === currentFilePath) return isDirty;
    return !!fileStates.get(path)?.dirty;
  };

  const requestClose = (path: string) => {
    if (dirtyOf(path) && !confirm(t().tabs.unsavedClose)) return;
    closeTab(path);
  };

  // Bulk close: one confirmation when ANY of the affected tabs is dirty.
  const requestBulkClose = (paths: string[], action: () => void) => {
    if (paths.length === 0) return;
    const hasDirty = paths.some(p => dirtyOf(p));
    if (hasDirty && !confirm(t().tabs.unsavedCloseMultiple)) return;
    action();
  };

  const menuActions = menu ? {
    close: () => requestClose(menu.path),
    closeOthers: () => requestBulkClose(openTabs.filter(p => p !== menu.path), () => closeOtherTabs(menu.path)),
    closeLeft: () => requestBulkClose(openTabs.slice(0, openTabs.indexOf(menu.path)), () => closeTabsToLeft(menu.path)),
    closeRight: () => requestBulkClose(openTabs.slice(openTabs.indexOf(menu.path) + 1), () => closeTabsToRight(menu.path)),
    closeAll: () => requestBulkClose(openTabs, () => closeAllTabs()),
    copyPath: () => {
      navigator.clipboard.writeText(menu.path)
        .catch((err) => { console.warn("tab-path-copy-failed", err); });
    },
  } : null;

  return (
    <div className="zn-tabbar">
      {openTabs.map(path => {
        const active = path === currentFilePath;
        const dirty = dirtyOf(path);
        return (
          <div
            key={path}
            className={"zn-tab" + (active ? " zn-tab-active" : "")}
            title={path}
            onClick={() => switchTab(path)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ path, x: e.clientX, y: e.clientY });
            }}
            onAuxClick={(e) => {
              // Middle-click closes the tab.
              if (e.button === 1) {
                e.preventDefault();
                requestClose(path);
              }
            }}>
            <span className="zn-tab-name">{noteName(path)}</span>
            <span
              className={"zn-tab-close" + (dirty ? " zn-tab-dirty" : "")}
              title={t().tabs.closeTab}
              onClick={(e) => {
                e.stopPropagation();
                requestClose(path);
              }}>
              <span className="zn-tab-dot" />
              <svg className="zn-tab-x" width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </span>
          </div>
        );
      })}
      {menu && menuActions && (
        <TabContextMenu
          state={menu}
          tabs={openTabs}
          onClose={() => setMenu(null)}
          actions={menuActions}
        />
      )}
    </div>
  );
}

// ---- Tab context menu ----

function TabContextMenu({ state, tabs, onClose, actions }: {
  state: TabMenuState;
  tabs: string[];
  onClose: () => void;
  actions: {
    close: () => void;
    closeOthers: () => void;
    closeLeft: () => void;
    closeRight: () => void;
    closeAll: () => void;
    copyPath: () => void;
  };
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const idx = tabs.indexOf(state.path);
  const tc = t().tabs;

  // Close on outside mousedown (registered one tick later so the triggering
  // right-click doesn't immediately dismiss the menu).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const run = (action: () => void) => { action(); onClose(); };

  const items: Array<{ label: string; onClick: () => void; disabled?: boolean; danger?: boolean } | { divider: true }> = [
    { label: tc.closeTab, onClick: () => run(actions.close) },
    { label: tc.closeOthers, onClick: () => run(actions.closeOthers), disabled: tabs.length <= 1 },
    { label: tc.closeToLeft, onClick: () => run(actions.closeLeft), disabled: idx <= 0 },
    { label: tc.closeToRight, onClick: () => run(actions.closeRight), disabled: idx < 0 || idx >= tabs.length - 1 },
    { label: tc.closeAll, onClick: () => run(actions.closeAll), disabled: tabs.length <= 1 },
    { divider: true },
    { label: tc.copyPath, onClick: () => run(actions.copyPath) },
  ];

  const adjustedX = Math.min(state.x, window.innerWidth - 200);
  const adjustedY = Math.min(state.y, window.innerHeight - items.length * 32 - 16);

  return (
    <div ref={menuRef} style={{
      position: "fixed", left: adjustedX, top: adjustedY, zIndex: 1200,
      background: "var(--bg-toolbar)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "4px 0", minWidth: 190,
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)", fontSize: 13,
    }}>
      {items.map((item, i) => {
        if ("divider" in item) {
          return <div key={i} style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />;
        }
        return (
          <div key={i}
            onClick={() => { if (!item.disabled) item.onClick(); }}
            style={{
              padding: "6px 14px",
              cursor: item.disabled ? "default" : "pointer",
              color: item.disabled ? "var(--text-tertiary)" : (item.danger ? "#E81123" : "var(--text-primary)"),
              opacity: item.disabled ? 0.5 : 1,
              background: "transparent",
            }}
            onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
