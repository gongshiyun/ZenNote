import { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import { Titlebar } from "./Titlebar";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { FileTree } from "../filetree/FileTree";
import { Editor } from "../editor/Editor";
import { Outline } from "../outline/Outline";

// Lazy-load heavy, rarely-visible panels
const SearchPanel = lazy(() => import("../search/SearchPanel").then(m => ({ default: m.SearchPanel })));
const SettingsDialog = lazy(() => import("../dialogs/SettingsDialog").then(m => ({ default: m.SettingsDialog })));
const ShortcutsPanel = lazy(() => import("../dialogs/ShortcutsPanel").then(m => ({ default: m.ShortcutsPanel })));
import { useMermaid } from "../../hooks/useMermaid";
import { useUpdater } from "../../hooks/useUpdater";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { exportToHtml, exportToPdf } from "../../lib/exportNote";
import { parentDir, isWithinWorkspace } from "../../domain";
import * as fs from "../../services";

// ---- Auto-save ----
function useAutoSave() {
  const content = useStore(s => s.content);
  const currentFilePath = useStore(s => s.currentFilePath);
  const isDirty = useStore(s => s.isDirty);
  const autoSaveDelay = useStore(s => s.autoSaveDelay);

  useEffect(() => {
    if (!isDirty || !currentFilePath || autoSaveDelay <= 0) return;
    const timer = setTimeout(async () => {
      const s = useStore.getState();
      if (!s.isDirty || !s.currentFilePath) return;
      try {
        await fs.writeFile(s.currentFilePath, s.content);
        useStore.getState().setDirty(false);
        useStore.getState().setLastSavedAt(Date.now());
      } catch { /* */ }
    }, autoSaveDelay);
    return () => clearTimeout(timer);
  }, [content, isDirty, currentFilePath, autoSaveDelay]);
}

// ---- Window state persistence ----
function useWindowPersistence() {
  useEffect(() => {
    const save = () => {
      try {
        const s = useStore.getState();
        const data = {
          workspacePath: s.workspacePath,
          currentFilePath: s.currentFilePath,
          openTabs: s.openTabs,
          mode: s.mode,
          themeId: s.themeId,
          fontFamily: s.fontFamily,
          editorPadding: s.editorPadding,
          autoCheckUpdate: s.autoCheckUpdate,
          updateCheckInterval: s.updateCheckInterval,
          sidebarVisible: s.sidebarVisible,
          outlineVisible: s.outlineVisible,
        };
        localStorage.setItem("zennote:session", JSON.stringify(data));
      } catch { /* */ }
    };
    const interval = setInterval(save, 5000);
    window.addEventListener("beforeunload", save);
    return () => { clearInterval(interval); window.removeEventListener("beforeunload", save); };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("zennote:session");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.mode) useStore.getState().setMode(data.mode);
      if (data.themeId) useStore.getState().setThemeId(data.themeId);
      if (data.fontFamily) useStore.getState().setFontFamily(data.fontFamily);
      if (typeof data.editorPadding === "number") useStore.getState().setEditorPadding(data.editorPadding);
      if (typeof data.autoCheckUpdate === "boolean") useStore.getState().setAutoCheckUpdate(data.autoCheckUpdate);
      if (typeof data.updateCheckInterval === "number") useStore.getState().setUpdateCheckInterval(data.updateCheckInterval);
      if (data.workspacePath) {
        useStore.getState().setWorkspace(data.workspacePath);
        if (Array.isArray(data.openTabs)) useStore.getState().setOpenTabs(data.openTabs.filter((p: unknown) => typeof p === "string"));
        // Show the loading spinner while the restored workspace is listed.
        useStore.getState().setTree([]);
        useStore.getState().setLoading(true);
        fs.openWorkspace(data.workspacePath).then(tree => {
          useStore.getState().setTree(tree);
          useStore.getState().setLoading(false);
          if (data.currentFilePath) {
            fs.readFile(data.currentFilePath).then(content => {
              useStore.getState().setSelectedFile(data.currentFilePath);
              useStore.getState().setCurrentFile(data.currentFilePath, content);
            }).catch(() => {});
          }
        }).catch(() => { useStore.getState().setLoading(false); });
      }
    } catch { /* */ }
  }, []);
}

// ---- App Shell ----
export function AppShell() {
  const workspacePath = useStore(s => s.workspacePath);
  const sidebarVisible = useStore(s => s.sidebarVisible);
  const outlineVisible = useStore(s => s.outlineVisible);
  const searchVisible = useStore(s => s.searchVisible);
  const settingsVisible = useStore(s => s.settingsVisible);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const toggleOutline = useStore(s => s.toggleOutline);
  const setSearchVisible = useStore(s => s.setSearchVisible);
  const setSettingsVisible = useStore(s => s.setSettingsVisible);
  const [shortcutsVisible, setShortcutsVisible] = useState(false);
  // Subscribe to locale so the WHOLE tree re-renders on language switch
  // (t() reads a module variable; components only see new text after re-render).
  const locale = useStore(s => s.locale);

  useEffect(() => {
    document.documentElement.lang = locale === "zh-CN" ? "zh" : "en";
  }, [locale]);

  useAutoSave();
  useMermaid();
  useWindowPersistence();
  useUpdater();

  const [sidebarWidth] = useState(240);
  const [outlineWidth] = useState(180);
  const isDraggingSidebar = useRef(false);
  const isDraggingOutline = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const onSidebarMouseDown = useCallback(() => { isDraggingSidebar.current = true; }, []);
  const onOutlineMouseDown = useCallback(() => { isDraggingOutline.current = true; }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Direct DOM manipulation during drag — avoids React re-render on every mousemove
      if (isDraggingSidebar.current && sidebarRef.current) {
        const w = Math.max(160, Math.min(480, sidebarRef.current.offsetWidth + e.movementX));
        sidebarRef.current.style.width = w + "px";
      }
      if (isDraggingOutline.current && outlineRef.current) {
        const w = Math.max(140, Math.min(360, outlineRef.current.offsetWidth + e.movementX));
        outlineRef.current.style.width = w + "px";
      }
    };
    const onMouseUp = () => { isDraggingSidebar.current = false; isDraggingOutline.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // F1 opens the shortcuts reference panel (no modifier needed).
      if (e.key === "F1") { e.preventDefault(); setShortcutsVisible(v => !v); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      // e.key is UPPERCASE when Shift is held (e.g. "O" for Ctrl+Shift+O),
      // so compare case-insensitively.
      const key = e.key.toLowerCase();
      if (key === "b" && e.shiftKey) { e.preventDefault(); toggleOutline(); }
      else if (key === "b") { e.preventDefault(); toggleSidebar(); }
      else if (key === "f" && e.shiftKey) { e.preventDefault(); setSearchVisible(true); }
      else if (key === "e" && e.shiftKey) {
        e.preventDefault();
        const s = useStore.getState();
        if (s.currentFilePath && s.content) exportToHtml(s.content, s.currentFilePath);
      }
      else if (key === "p" && e.shiftKey) {
        e.preventDefault();
        const s = useStore.getState();
        if (s.currentFilePath && s.content) exportToPdf(s.content, s.currentFilePath);
      }
      else if (key === "o" && !e.shiftKey) {
        e.preventDefault();
        (async () => {
          try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const file = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md"] }] });
            if (file && typeof file === "string") {
              const content = await fs.readFile(file);
              const s = useStore.getState();
              s.setSelectedFile(file);
              s.setCurrentFile(file, content);
              // Auto-add the file's directory as the workspace when outside the current one.
              const parent = parentDir(file);
              const ws = s.workspacePath;
              const inCurrent = isWithinWorkspace(parent, ws);
              if (!inCurrent) {
                s.setWorkspace(parent);
                try { const t = await fs.openWorkspace(parent); s.setTree(t); } catch {}
              }
            }
          } catch {}
        })();
      }
      else if (key === "o" && e.shiftKey) {
        e.preventDefault();
        (async () => {
          try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const folder = await open({ directory: true, multiple: false });
            if (folder && typeof folder === "string") {
              const s = useStore.getState();
              s.setWorkspace(folder);
              // Clear the previous workspace's tree immediately so the panel
              // shows the loading spinner instead of stale content.
              s.setTree([]);
              s.setLoading(true);
              try {
                const t = await fs.openWorkspace(folder);
                s.setTree(t);
              } catch { s.setTree([]); } finally { s.setLoading(false); }
            }
          } catch {}
        })();
      }
      else if (key === "," && !e.shiftKey) {
        e.preventDefault();
        setSettingsVisible(true);
      }
      else if (key === "w" && !e.shiftKey && !e.altKey) {
        // Close the current tab (asks for confirmation when dirty).
        e.preventDefault();
        const s = useStore.getState();
        if (!s.currentFilePath) return;
        if (s.isDirty && !confirm(t().tabs.unsavedClose)) return;
        s.closeTab(s.currentFilePath);
      }
      else if (key === "tab") {
        // Cycle through open tabs (Ctrl+Tab / Ctrl+Shift+Tab).
        e.preventDefault();
        const s = useStore.getState();
        const tabs = s.openTabs;
        if (tabs.length < 2 || !s.currentFilePath) return;
        const idx = tabs.indexOf(s.currentFilePath);
        const next = e.shiftKey ? tabs[(idx - 1 + tabs.length) % tabs.length] : tabs[(idx + 1) % tabs.length];
        s.switchTab(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar, toggleOutline, setSearchVisible, setSettingsVisible]);

  if (!workspacePath) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Titlebar />
        <WelcomeScreen />
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Titlebar />
      <TabBar />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left sidebar: FileTree */}
        {sidebarVisible && (
          <>
            <div ref={sidebarRef} style={{ width: sidebarWidth, flexShrink: 0, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <FileTree />
            </div>
            <div className="resize-handle" onMouseDown={onSidebarMouseDown} />
          </>
        )}
        {/* Left side: Outline panel (between FileTree and Editor) */}
        {outlineVisible && (
          <>
            <div ref={outlineRef} style={{ width: outlineWidth, flexShrink: 0, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Outline />
            </div>
            <div className="resize-handle" onMouseDown={onOutlineMouseDown} />
          </>
        )}
        {/* Editor */}
        <div style={{ flex: 1, minWidth: 360, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Editor />
        </div>
      </div>
      <StatusBar />
      <Suspense fallback={null}>
        {searchVisible && <SearchPanel onClose={() => setSearchVisible(false)} />}
        {settingsVisible && <SettingsDialog onClose={() => setSettingsVisible(false)} />}
        {shortcutsVisible && <ShortcutsPanel onClose={() => setShortcutsVisible(false)} />}
      </Suspense>
    </div>
  );
}

// ---- Welcome Screen ----
function WelcomeScreen() {
  const setWorkspace = useStore(s => s.setWorkspace);
  const setTree = useStore(s => s.setTree);
  const setLoading = useStore(s => s.setLoading);
  const [loadingState, setLoadingState] = useState(false);

  const openFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const folder = await open({ directory: true, multiple: false, title: t().welcome.openFolder });
      if (folder && typeof folder === "string") {
        setWorkspace(folder);
        useStore.getState().setTree([]);
        setLoading(true);
        setLoadingState(true);
        try {
          const tree = await fs.openWorkspace(folder);
          setTree(tree);
        } catch { setTree([]); } finally {
          setLoading(false);
          setLoadingState(false);
        }
      }
    } catch {
      const path = prompt("Workspace path:");
      if (path) { setWorkspace(path); setTree([]); }
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-editor)", gap: 24 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{t().app.title}</div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t().welcome.subtitle}</div>
      {loadingState ? (
        <div style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{t().welcome.loadingWorkspace}</div>
      ) : (
        <button
          onClick={openFolder}
          style={{ padding: "10px 32px", fontSize: 14, fontWeight: 500, border: "none", borderRadius: 8, background: "var(--text-accent)", color: "#FFFFFF", cursor: "pointer", transition: "opacity 150ms ease" }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
          Open Folder
        </button>
      )}
    </div>
  );
}