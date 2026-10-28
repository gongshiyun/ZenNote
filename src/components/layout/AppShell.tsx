import { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import type { EditorView } from "@codemirror/view";
import { Titlebar } from "./Titlebar";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { FileTree } from "../filetree/FileTree";
import { SourceEditor } from "../editor/SourceEditor";
import { LivePreviewEditor } from "../editor/livepreview/LivePreviewEditor";
import { FindReplaceBar } from "../editor/FindReplaceBar";
import { Outline } from "../outline/Outline";

// Lazy-load heavy, rarely-visible panels
const SearchPanel = lazy(() => import("../search/SearchPanel").then(m => ({ default: m.SearchPanel })));
const SettingsDialog = lazy(() => import("../dialogs/SettingsDialog").then(m => ({ default: m.SettingsDialog })));
const ShortcutsPanel = lazy(() => import("../dialogs/ShortcutsPanel").then(m => ({ default: m.ShortcutsPanel })));
const QuickOpen = lazy(() => import("../dialogs/QuickOpen").then(m => ({ default: m.QuickOpen })));
// NOTE: useMermaid 的启动预热已移除 —— 它会在挂载时动态加载整个 mermaid
// （~500KB+ JS），即使当前文档没有任何图表。代码块的 renderPreview 路径
// 本身就会按需 import 并 initialize，无需提前加载。
import { useUpdater } from "../../hooks/useUpdater";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { exportToHtml, exportToPdf } from "../../lib/exportNote";
import { parentDir, isWithinWorkspace } from "../../domain";
import * as fs from "../../services";
import { startWorkspaceWatcher } from "../../lib/workspaceWatcher";
import { flushDirtyDocuments, hasDirtyDocuments, saveCurrentDocument } from "../../lib/saveCoordinator";
import { isEditableTarget } from "../../lib/keyboard";
import { openDocumentWithSave } from "../../lib/openDocument";
import { createCloseRequestHandler } from "../../lib/windowClose";
import { createUntitledNote } from "../../lib/newNote";
import { AppMark, Button, FileTextIcon, FolderIcon, Spinner } from "../ui";

// ---- Auto-save ----
function useAutoSave() {
  const content = useStore(s => s.content);
  const currentFilePath = useStore(s => s.currentFilePath);
  const isDirty = useStore(s => s.isDirty);
  const autoSaveDelay = useStore(s => s.autoSaveDelay);
  const externalConflict = useStore(s => s.externalConflict);

  useEffect(() => {
    if (!isDirty || !currentFilePath || autoSaveDelay <= 0) return;
    const timer = setTimeout(async () => {
      try {
        await saveCurrentDocument();
      } catch { /* */ }
    }, autoSaveDelay);
    return () => clearTimeout(timer);
  }, [content, isDirty, currentFilePath, autoSaveDelay, externalConflict]);
}

// ---- Workspace file watching (external-change auto-refresh) ----
// The Rust side watches the current workspace folder and emits change events;
// the watcher module refreshes the tree and reloads externally-modified open
// files. Re-armed on every workspace switch; unwatched on cleanup.
function useWorkspaceWatcher() {
  const workspacePath = useStore(s => s.workspacePath);
  useEffect(() => {
    if (!workspacePath) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    fs.watchWorkspace(workspacePath).catch(() => { /* watcher unavailable */ });
    startWorkspaceWatcher()
      .then(u => { if (cancelled) u(); else unlisten = u; })
      .catch(() => { /* events unavailable */ });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      fs.unwatchWorkspace().catch(() => { /* */ });
    };
  }, [workspacePath]);
}

function useWorkspaceListingSettings() {
  const workspacePath = useStore(s => s.workspacePath);
  const showHiddenFiles = useStore(s => s.showHiddenFiles);
  useEffect(() => {
    if (!workspacePath) return;
    let cancelled = false;
    void fs.openWorkspace(workspacePath, showHiddenFiles)
      .then((tree) => {
        if (!cancelled) useStore.getState().setTree(tree);
      })
      .catch(() => { /* keep the existing tree on read failure */ });
    return () => { cancelled = true; };
  }, [workspacePath, showHiddenFiles]);
}

// ---- OS "Open with" (file association) ----
// Windows launches `zennote.exe <file.md>` for "Open with -> ZenNote". In that
// case open the file with its PARENT DIRECTORY as the workspace, and let this
// take precedence over the persisted session.
let osOpenedFilePromise: Promise<string | null> | null = null;
function getOsOpenedFileOnce(): Promise<string | null> {
  if (!osOpenedFilePromise) {
    osOpenedFilePromise = (async () => {
      try {
        const args = await fs.getLaunchArgs();
        for (let i = 1; i < args.length; i++) {
          const a = args[i];
          if (typeof a === "string" && a.toLowerCase().endsWith(".md")) {
            // Some shells pass a file:// URL instead of a plain path.
            return a.startsWith("file://") ? decodeURIComponent(a.replace(/^file:\/\/\/?/, "")) : a;
          }
        }
      } catch { /* non-desktop context */ }
      return null;
    })();
  }
  return osOpenedFilePromise;
}

async function openOsFile(file: string): Promise<void> {
  const parent = parentDir(file);
  if (!parent) return;
  const store = useStore.getState();
  store.setWorkspace(parent);
  store.setTree([]);
  store.setLoading(true);
  try { store.setTree(await fs.openWorkspace(parent, store.showHiddenFiles)); }
  catch { store.setTree([]); }
  finally { store.setLoading(false); }
  try {
    const content = await fs.readFile(file);
    const s = useStore.getState();
    s.setSelectedFile(file);
    await openDocumentWithSave(file, content, { sourceMode: s.defaultSourceMode });
  } catch { /* file unreadable — keep the workspace only */ }
}

function useOsOpenFile() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const file = await getOsOpenedFileOnce();
      if (!file || cancelled) return;
      await openOsFile(file);
    })();
    return () => { cancelled = true; };
  }, []);
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
          fontFamily: s.fontFamily,
          editorPadding: s.editorPadding,
          autoCheckUpdate: s.autoCheckUpdate,
          updateCheckInterval: s.updateCheckInterval,
          fontSize: s.fontSize,
          tabSize: s.tabSize,
          autoSaveDelay: s.autoSaveDelay,
          showHiddenFiles: s.showHiddenFiles,
          showFileExtensions: s.showFileExtensions,
          defaultSourceMode: s.defaultSourceMode,
          sourceMode: s.sourceMode,
          sidebarVisible: s.sidebarVisible,
          outlineVisible: s.outlineVisible,
          sidebarWidth: s.sidebarWidth,
          outlineWidth: s.outlineWidth,
          recentWorkspaces: s.recentWorkspaces,
          expandedFolders: s.expandedFolders,
          draft: s.currentFilePath && s.isDirty
            ? { path: s.currentFilePath, content: s.content }
            : null,
          backgroundDrafts: Array.from(s.fileStates)
            .filter(([, state]) => state.dirty)
            .map(([path, state]) => ({ path, content: state.content })),
        };
        localStorage.setItem("zennote:session", JSON.stringify(data));
      } catch { /* */ }
    };
    const interval = setInterval(save, 5000);
    window.addEventListener("beforeunload", save);
    return () => { clearInterval(interval); window.removeEventListener("beforeunload", save); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = localStorage.getItem("zennote:session");
        if (!raw || cancelled) return;
        const data = JSON.parse(raw);
        if (data.mode) useStore.getState().setMode(data.mode);
        if (typeof data.fontFamily === "string") useStore.getState().setFontFamily(data.fontFamily);
        if (typeof data.editorPadding === "number") useStore.getState().setEditorPadding(data.editorPadding);
        if (typeof data.autoCheckUpdate === "boolean") useStore.getState().setAutoCheckUpdate(data.autoCheckUpdate);
        if (typeof data.updateCheckInterval === "number") useStore.getState().setUpdateCheckInterval(data.updateCheckInterval);
        if (typeof data.fontSize === "number") useStore.getState().setFontSize(data.fontSize);
        if (typeof data.tabSize === "number") useStore.getState().setTabSize(data.tabSize);
        if (typeof data.autoSaveDelay === "number") useStore.getState().setAutoSaveDelay(data.autoSaveDelay);
        if (typeof data.showHiddenFiles === "boolean") useStore.getState().setShowHiddenFiles(data.showHiddenFiles);
        if (typeof data.showFileExtensions === "boolean") useStore.getState().setShowFileExtensions(data.showFileExtensions);
        if (typeof data.defaultSourceMode === "boolean") useStore.getState().setDefaultSourceMode(data.defaultSourceMode);
        if (Array.isArray(data.recentWorkspaces)) {
          useStore.getState().setRecentWorkspaces(
            data.recentWorkspaces.filter((p: unknown) => typeof p === "string"),
          );
        }
        if (Array.isArray(data.expandedFolders)) {
          useStore.getState().setExpandedFolders(
            data.expandedFolders.filter((p: unknown) => typeof p === "string"),
          );
        }
        if (typeof data.sidebarWidth === "number") useStore.getState().setSidebarWidth(data.sidebarWidth);
        if (typeof data.outlineWidth === "number") useStore.getState().setOutlineWidth(data.outlineWidth);
        // Remember the last editing mode across restarts (PRD §3.3.2); sessions
        // written before this field existed fall back to the setting.
        const restoredSourceMode = typeof data.sourceMode === "boolean"
          ? data.sourceMode
          : data.defaultSourceMode === true;
        if (typeof data.sourceMode === "boolean") useStore.getState().setSourceMode(data.sourceMode);
        if (typeof data.sidebarVisible === "boolean" && data.sidebarVisible !== useStore.getState().sidebarVisible) useStore.getState().toggleSidebar();
        if (typeof data.outlineVisible === "boolean" && data.outlineVisible !== useStore.getState().outlineVisible) useStore.getState().toggleOutline();
        // An OS-launched file ("Open with") wins over the persisted workspace
        // and open tabs (useOsOpenFile sets those).
        const osFile = await getOsOpenedFileOnce();
        if (osFile || cancelled || !data.workspacePath) return;
        useStore.getState().setWorkspace(data.workspacePath);
        if (Array.isArray(data.openTabs)) useStore.getState().setOpenTabs(data.openTabs.filter((p: unknown) => typeof p === "string"));
        const drafts = new Map<string, string>();
        if (Array.isArray(data.backgroundDrafts)) {
          for (const draft of data.backgroundDrafts) {
            if (typeof draft?.path === "string" && typeof draft?.content === "string") {
              drafts.set(draft.path, draft.content);
            }
          }
        }
        if (typeof data.draft?.path === "string" && typeof data.draft?.content === "string") {
          drafts.set(data.draft.path, data.draft.content);
        }
        if (drafts.size > 0) {
          const states = new Map(useStore.getState().fileStates);
          for (const [path, draftContent] of drafts) {
            states.set(path, { content: draftContent, scrollPos: 0, cursorLine: 1, cursorCol: 1, dirty: true });
          }
          useStore.setState({ fileStates: states });
        }
        // Show the loading spinner while the restored workspace is listed.
        useStore.getState().setTree([]);
        useStore.getState().setLoading(true);
        fs.openWorkspace(data.workspacePath, useStore.getState().showHiddenFiles).then(tree => {
          if (cancelled) return;
          useStore.getState().setTree(tree);
          useStore.getState().setLoading(false);
          if (data.currentFilePath) {
            fs.readFile(data.currentFilePath).then(content => {
              if (cancelled) return;
              const draft = drafts.get(data.currentFilePath);
              const restored = draft ?? content;
              useStore.getState().setSelectedFile(data.currentFilePath);
              useStore.getState().setCurrentFile(data.currentFilePath, restored);
              if (draft !== undefined) {
                useStore.getState().setDirty(true);
                // The crash-recovery draft differs from what is on disk now:
                // autosave must NOT silently overwrite the newer disk version.
                // Surface the same conflict banner the live watcher uses; the
                // user decides whether to reload or keep the local draft.
                if (draft !== content) {
                  useStore.getState().setExternalConflict({
                    path: data.currentFilePath,
                    diskContent: content,
                    reason: "modified",
                  });
                }
              }
              useStore.getState().setSourceMode(restoredSourceMode);
            }).catch(() => {
              if (cancelled) return;
              const draft = drafts.get(data.currentFilePath);
              if (draft === undefined) return;
              useStore.getState().setSelectedFile(data.currentFilePath);
              useStore.getState().setCurrentFile(data.currentFilePath, draft);
              useStore.getState().setDirty(true);
              useStore.getState().setSourceMode(restoredSourceMode);
              useStore.getState().setExternalConflict({
                path: data.currentFilePath,
                diskContent: null,
                reason: "deleted",
              });
            });
          }
        }).catch(() => { if (!cancelled) useStore.getState().setLoading(false); });
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, []);
}

// ---- Final save on native window close ----
function useCloseSaveGuard() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const handler = createCloseRequestHandler({
          hasDirtyDocuments,
          flushDirtyDocuments,
          confirmExit: () => confirm(t().app.closeSaveFailed),
          destroy: () => win.destroy(),
          close: () => win.close(),
        });
        const stop = await win.onCloseRequested(handler);
        if (cancelled) stop();
        else unlisten = stop;
      } catch { /* browser dev / non-Tauri */ }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
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
  const sidebarWidth = useStore(s => s.sidebarWidth);
  const outlineWidth = useStore(s => s.outlineWidth);
  const setSidebarWidth = useStore(s => s.setSidebarWidth);
  const setOutlineWidth = useStore(s => s.setOutlineWidth);
  const currentFilePath = useStore(s => s.currentFilePath);
  const reloadTick = useStore(s => s.reloadTick);
  const [findVisible, setFindVisible] = useState(false);
  const [findPreset, setFindPreset] = useState<{
    query: string;
    line?: number;
    showReplace?: boolean;
    ts: number;
  } | null>(null);
  const [shortcutsVisible, setShortcutsVisible] = useState(false);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  // Subscribe to locale so the WHOLE tree re-renders on language switch
  // (t() reads a module variable; components only see new text after re-render).
  const locale = useStore(s => s.locale);

  useEffect(() => {
    document.documentElement.lang = locale === "zh-CN" ? "zh" : "en";
  }, [locale]);

  useAutoSave();
  useWorkspaceWatcher();
  useWorkspaceListingSettings();
  useOsOpenFile();
  useWindowPersistence();
  useCloseSaveGuard();
  useUpdater();

  const sourceMode = useStore(s => s.sourceMode);

  // One find & replace bar for BOTH editing surfaces. It used to live inside
  // LivePreviewEditor, which meant Ctrl+F did nothing in source mode and the
  // global search panel's "jump to match" event had no listener at all.
  useEffect(() => {
    const onFindOpen = (event: Event) => {
      const detail = (event as CustomEvent<{
        query?: string;
        line?: number;
        showReplace?: boolean;
      }>).detail ?? {};
      setFindPreset({
        query: typeof detail.query === "string" ? detail.query : "",
        ...(typeof detail.line === "number" ? { line: detail.line } : {}),
        ...(detail.showReplace ? { showReplace: true } : {}),
        ts: Date.now(),
      });
      setFindVisible(true);
    };
    window.addEventListener("zn-find-open", onFindOpen);
    return () => window.removeEventListener("zn-find-open", onFindOpen);
  }, []);

  const isDraggingSidebar = useRef(false);
  const isDraggingOutline = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  // Live Preview's CodeMirror view. Find & replace and the table/image menus
  // are wired to the Crepe view today; they move onto this one in Phase 4.
  const lpViewRef = useRef<EditorView | null>(null);
  /** Source mode is a different surface, so it needs its own view handle. */
  const srcViewRef = useRef<EditorView | null>(null);
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
        // The outline lives on the RIGHT of the editor, so its handle sits on
        // the panel's left edge: dragging left grows the panel.
        const w = Math.max(140, Math.min(360, outlineRef.current.offsetWidth - e.movementX));
        outlineRef.current.style.width = w + "px";
      }
    };
    const onMouseUp = () => {
      // Commit the pixel width to the store (persisted in the session) once the
      // user lets go, instead of re-rendering on every mousemove.
      if (isDraggingSidebar.current && sidebarRef.current) {
        setSidebarWidth(sidebarRef.current.offsetWidth);
      }
      if (isDraggingOutline.current && outlineRef.current) {
        setOutlineWidth(outlineRef.current.offsetWidth);
      }
      isDraggingSidebar.current = false;
      isDraggingOutline.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [setSidebarWidth, setOutlineWidth]);

  // Global keyboard shortcuts
  useEffect(() => {
    const anyModalOpen = settingsVisible || searchVisible || quickOpenVisible || shortcutsVisible;
    const onKeyDown = (e: KeyboardEvent) => {
      // IME confirmation / candidate navigation must never trigger app shortcuts.
      if (e.isComposing || e.keyCode === 229) return;
      // F1 opens the shortcuts reference panel (no modifier needed).
      if (e.key === "F1") { e.preventDefault(); setShortcutsVisible(v => !v); return; }
      if (e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const editable = isEditableTarget(e.target);
      const target = e.target instanceof HTMLElement ? e.target : null;
      // e.key is UPPERCASE when Shift is held (e.g. "O" for Ctrl+Shift+O),
      // so compare case-insensitively.
      const key = e.key.toLowerCase();
      if (key === "b" && e.shiftKey) { e.preventDefault(); toggleOutline(); }
      else if (key === "b") {
        if (editable) return;
        e.preventDefault();
        toggleSidebar();
      }
      else if (key === "f" && e.shiftKey) { e.preventDefault(); setSearchVisible(true); }
      else if (key === "p" && !e.shiftKey) { e.preventDefault(); setQuickOpenVisible(true); }
      else if (key === "f" && !e.shiftKey) {
        // Find in either editing surface. If focus is already in the find bar,
        // leave the browser's select-all-in-field behaviour alone.
        if (anyModalOpen || target?.closest(".zn-findbar")) return;
        e.preventDefault();
        setFindPreset({ query: "", ts: Date.now() });
        setFindVisible(true);
      }
      else if (key === "h" && !e.shiftKey) {
        if (anyModalOpen || target?.closest(".zn-findbar")) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("zn-find-open", { detail: { query: "", showReplace: true } }));
      }
      else if (key === "s" && !e.shiftKey) {
        // Ctrl+S is advertised in the shortcuts panel; until now no handler
        // existed at all. Autosave is debounced, so an explicit save matters.
        e.preventDefault();
        void saveCurrentDocument().catch(() => { /* status bar shows the error */ });
      }
      else if (key === "n" && !e.shiftKey) {
        if (anyModalOpen) return;
        e.preventDefault();
        void createUntitledNote();
      }
      else if (key === "`" && !e.shiftKey) {
        e.preventDefault();
        const s = useStore.getState();
        s.setSourceMode(!s.sourceMode);
      }
      else if (key === "d" && e.shiftKey) {
        e.preventDefault();
        const s = useStore.getState();
        s.setMode(s.resolvedMode === "dark" ? "light" : "dark");
      }
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
              const s = useStore.getState();
              const opened = await openDocumentWithSave(file, undefined, { sourceMode: s.defaultSourceMode });
              if (!opened) return;
              s.setSelectedFile(file);
              // Auto-add the file's directory as the workspace when outside the current one.
              const parent = parentDir(file);
              const ws = s.workspacePath;
              const inCurrent = isWithinWorkspace(parent, ws);
              if (!inCurrent) {
                s.setWorkspace(parent);
                try { const t = await fs.openWorkspace(parent, s.showHiddenFiles); s.setTree(t); } catch {}
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
                const t = await fs.openWorkspace(folder, s.showHiddenFiles);
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
        if (editable) return;
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
        void openDocumentWithSave(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar, toggleOutline, setSearchVisible, setSettingsVisible, settingsVisible, searchVisible, quickOpenVisible, shortcutsVisible]);

  if (!workspacePath) {
    return (
      <div className="zn-app">
        <Titlebar />
        <WelcomeScreen />
      </div>
    );
  }

  return (
    <div className="zn-app">
      <Titlebar />
      <TabBar />
      <div className="zn-workspace">
        {/* Left sidebar: FileTree */}
        {sidebarVisible && (
          <>
            <div ref={sidebarRef} className="zn-sidebar-slot" style={{ width: sidebarWidth }}>
              <FileTree />
            </div>
            <div className="zn-resize-handle" onMouseDown={onSidebarMouseDown} />
          </>
        )}
        {/* Editor.
            Live Preview is the editor. Source mode — the raw markdown surface —
            is a separate shell around CodeMirror, not a second editor, which is
            why toggling it no longer swaps components. The find bar is hoisted
            here so BOTH surfaces share one bar (and the global search jump works). */}
        <div className="zn-editor-slot">
          <FindReplaceBar
            visible={findVisible}
            onClose={() => {
              setFindVisible(false);
              // Hand the caret back to whichever surface was being searched, so
              // closing the bar resumes typing where the user left off.
              (sourceMode ? srcViewRef : lpViewRef).current?.focus();
            }}
            preset={findPreset}
            documentKey={currentFilePath ? `${currentFilePath}:${reloadTick}` : null}
            getCmView={() => (sourceMode ? srcViewRef.current : lpViewRef.current)}
          />
          <div className="zn-editor-host">
            {sourceMode
              ? <SourceEditor viewRef={srcViewRef} />
              : <LivePreviewEditor viewRef={lpViewRef} />}
          </div>
        </div>
        {/* Right: Outline panel (PRD §3.4 — its handle is on the left edge) */}
        {outlineVisible && (
          <>
            <div className="zn-resize-handle" onMouseDown={onOutlineMouseDown} />
            <div ref={outlineRef} className="zn-outline-slot" style={{ width: outlineWidth }}>
              <Outline />
            </div>
          </>
        )}
      </div>
      <StatusBar />
      <Suspense fallback={null}>
        {searchVisible && <SearchPanel onClose={() => setSearchVisible(false)} />}
        {settingsVisible && <SettingsDialog onClose={() => setSettingsVisible(false)} />}
        {shortcutsVisible && <ShortcutsPanel onClose={() => setShortcutsVisible(false)} />}
        {quickOpenVisible && <QuickOpen onClose={() => setQuickOpenVisible(false)} />}
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
          const tree = await fs.openWorkspace(folder, useStore.getState().showHiddenFiles);
          setTree(tree);
        } catch { setTree([]); } finally {
          setLoading(false);
          setLoadingState(false);
        }
      }
    } catch {
      const path = prompt(t().welcome.openFolder);
      if (path) { setWorkspace(path); setTree([]); }
    }
  };

  // Open a single note from the welcome screen: its folder becomes the
  // workspace, then the note is opened through the normal save-coordinated path.
  const openFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (file && typeof file === "string") await openOsFile(file);
    } catch {
      // Browser dev (no Tauri dialog): fall back to a path prompt.
      const path = prompt(t().welcome.openFile);
      if (path?.trim()) await openOsFile(path.trim());
    }
  };

  return (
    <div className="zn-welcome">
      <div className="zn-welcome__inner">
        <div className="zn-welcome__mark">
          <AppMark size={44} />
        </div>
        <h1 className="zn-welcome__title">{t().app.title}</h1>
        <p className="zn-welcome__subtitle">{t().welcome.subtitle}</p>
        {loadingState ? (
          <div className="zn-welcome__loading" role="status">
            <Spinner size={14} />
            <span>{t().welcome.loadingWorkspace}</span>
          </div>
        ) : (
          <div className="zn-welcome__actions">
            <Button
              variant="primary"
              iconLeft={<FolderIcon size={15} />}
              onClick={() => { void openFolder(); }}
            >
              {t().welcome.openFolder}
            </Button>
            <Button
              variant="secondary"
              iconLeft={<FileTextIcon size={15} />}
              onClick={() => { void openFile(); }}
            >
              {t().welcome.openFile}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
