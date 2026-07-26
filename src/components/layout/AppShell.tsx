import { useState, useCallback, useRef, useEffect } from "react";
import { Titlebar } from "./Titlebar";
import { StatusBar } from "./StatusBar";
import { FileTree } from "../filetree/FileTree";
import { Editor } from "../editor/Editor";
import { Outline } from "../outline/Outline";
import { SearchPanel } from "../search/SearchPanel";
import { SettingsDialog } from "../dialogs/SettingsDialog";
import { useMermaid } from "../../hooks/useMermaid";
import { useStore } from "../../store";
import { t } from "../../i18n";

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
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("write_file", { path: s.currentFilePath, content: s.content });
        useStore.getState().setDirty(false);
      } catch { /* */ }
    }, autoSaveDelay);
    return () => clearTimeout(timer);
  }, [content, isDirty, currentFilePath, autoSaveDelay]);
}

// ---- Export ----
async function exportToHtml(content: string, filePath: string) {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const editorEl = document.querySelector(".ProseMirror") as HTMLElement;
    const bodyHtml = editorEl ? editorEl.innerHTML : content.replace(/</g, "<").replace(/>/g, ">").replace(/\n/g, "<br>");
    const name = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, "") || "Note";
    const html = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>" + name + "</title>\n<style>\nbody{max-width:860px;margin:40px auto;padding:0 20px;font-family:\"Microsoft YaHei\",-apple-system,sans-serif;font-size:16px;line-height:1.8;color:#1a1a1a;background:#fff}\nh1{font-size:2em;border-bottom:2px solid #eee;padding-bottom:.3em}\nh2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.2em}\nh3{font-size:1.25em}\ncode{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:.9em}\npre{background:#f4f4f4;padding:16px;border-radius:6px;overflow-x:auto}\npre code{background:none;padding:0}\nblockquote{border-left:4px solid #ddd;margin:0;padding:0 16px;color:#666}\ntable{border-collapse:collapse;width:100%}\nth,td{border:1px solid #ddd;padding:8px 12px;text-align:left}\nth{background:#f9f9f9;font-weight:600}\nimg{max-width:100%;height:auto}\n@media(prefers-color-scheme:dark){body{color:#e0e0e0;background:#1e1e1e}code{background:#2a2a2a}pre{background:#2a2a2a}blockquote{border-left-color:#555;color:#b0b0b0}th,td{border-color:#444}th{background:#2a2a2a}}\n</style>\n</head>\n<body>\n" + bodyHtml + "\n</body>\n</html>";
    const defaultPath = filePath.replace(/\.md$/, ".html");
    const savePath = await save({ defaultPath, filters: [{ name: "HTML", extensions: ["html"] }] });
    if (savePath && typeof savePath === "string") {
      await invoke("write_file", { path: savePath, content: html });
    }
  } catch { /* */ }
}

// ---- Image paste ----
function useImagePaste() {
  const currentFilePath = useStore(s => s.currentFilePath);
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!currentFilePath) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          const name = "image-" + Date.now();
          const mdImg = "![" + name + "](" + url + ")";
          const ta = document.querySelector("textarea") as HTMLTextAreaElement;
          if (ta && document.activeElement === ta) {
            const s = ta.selectionStart;
            const val = ta.value;
            const newVal = val.substring(0, s) + "\n" + mdImg + "\n" + val.substring(s);
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(ta, newVal);
              ta.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          return;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [currentFilePath]);
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
          mode: s.mode,
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
      if (data.workspacePath) {
        useStore.getState().setWorkspace(data.workspacePath);
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke<any[]>("open_workspace", { path: data.workspacePath }).then(tree => {
            useStore.getState().setTree(tree);
            if (data.currentFilePath) {
              invoke<string>("read_file", { path: data.currentFilePath }).then(content => {
                useStore.getState().setSelectedFile(data.currentFilePath);
                useStore.getState().setCurrentFile(data.currentFilePath, content);
              }).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
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

  useAutoSave();
  useMermaid();
  useImagePaste();
  useWindowPersistence();

  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [outlineWidth, setOutlineWidth] = useState(180);
  const isDraggingSidebar = useRef(false);
  const isDraggingOutline = useRef(false);
  const onSidebarMouseDown = useCallback(() => { isDraggingSidebar.current = true; }, []);
  const onOutlineMouseDown = useCallback(() => { isDraggingOutline.current = true; }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar.current) setSidebarWidth(w => Math.max(160, Math.min(480, w + e.movementX)));
      if (isDraggingOutline.current) setOutlineWidth(w => Math.max(140, Math.min(360, w + e.movementX)));
    };
    const onMouseUp = () => { isDraggingSidebar.current = false; isDraggingOutline.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "b" && e.shiftKey) { e.preventDefault(); toggleOutline(); }
      else if (e.key === "b") { e.preventDefault(); toggleSidebar(); }
      else if (e.key === "f" && e.shiftKey) { e.preventDefault(); setSearchVisible(true); }
      else if (e.key === "e" && e.shiftKey) {
        e.preventDefault();
        const s = useStore.getState();
        if (s.currentFilePath && s.content) exportToHtml(s.content, s.currentFilePath);
      }
      else if (e.key === "o" && !e.shiftKey) {
        e.preventDefault();
        (async () => {
          try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const { invoke } = await import("@tauri-apps/api/core");
            const file = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md"] }] });
            if (file && typeof file === "string") {
              const content = await invoke<string>("read_file", { path: file });
              const s = useStore.getState();
              s.setSelectedFile(file);
              s.setCurrentFile(file, content);
              if (!s.workspacePath) {
                const parent = file.replace(/[\\\/][^\\\/]+$/, "");
                s.setWorkspace(parent);
                try { const t = await invoke<any[]>("open_workspace", { path: parent }); s.setTree(t); } catch {}
              }
            }
          } catch {}
        })();
      }
      else if (e.key === "o" && e.shiftKey) {
        e.preventDefault();
        (async () => {
          try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const { invoke } = await import("@tauri-apps/api/core");
            const folder = await open({ directory: true, multiple: false });
            if (folder && typeof folder === "string") {
              const s = useStore.getState();
              s.setWorkspace(folder);
              s.setLoading(true);
              const t = await invoke<any[]>("open_workspace", { path: folder });
              s.setTree(t);
              s.setLoading(false);
            }
          } catch {}
        })();
      }
      else if (e.key === "," && !e.shiftKey) {
        e.preventDefault();
        setSettingsVisible(true);
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
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left sidebar: FileTree */}
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth, flexShrink: 0, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <FileTree />
            </div>
            <div className="resize-handle" onMouseDown={onSidebarMouseDown} />
          </>
        )}
        {/* Left side: Outline panel (between FileTree and Editor) */}
        {outlineVisible && (
          <>
            <div style={{ width: outlineWidth, flexShrink: 0, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
      {searchVisible && <SearchPanel onClose={() => setSearchVisible(false)} />}
      {settingsVisible && <SettingsDialog onClose={() => setSettingsVisible(false)} />}
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
      const { invoke } = await import("@tauri-apps/api/core");
      const folder = await open({ directory: true, multiple: false, title: t().welcome.openFolder });
      if (folder && typeof folder === "string") {
        setWorkspace(folder);
        setLoading(true);
        setLoadingState(true);
        const tree = await invoke<any[]>("open_workspace", { path: folder });
        setTree(tree);
        setLoading(false);
        setLoadingState(false);
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