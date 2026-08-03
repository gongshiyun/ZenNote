import { useCallback, useState, useEffect, useRef, useMemo, memo } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import type { FileNode } from "../../domain";
import { parentDir, isWithinWorkspace } from "../../domain";
import * as fs from "../../services";

// ---- Flatten tree for keyboard nav ----
function flattenTree(nodes: FileNode[], expanded: string[]): FileNode[] {
  const result: FileNode[] = [];
  function walk(list: FileNode[]) {
    for (const n of list) {
      result.push(n);
      if (n.isDir && n.children && expanded.includes(n.path)) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

// ---- Context Menu ----
interface ContextMenuState { x: number; y: number; node: FileNode; }

function ContextMenu({ state, onClose, onNewFile, onNewFolder, onRename, onDelete }: {
  state: ContextMenuState; onClose: () => void;
  onNewFile: (p: string) => void; onNewFolder: (p: string) => void;
  onRename: (p: string, o: string) => void; onDelete: (p: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const parentPath = state.node.isDir ? state.node.path : parentDir(state.node.path);
  const items: { label: string; action: () => void; danger?: boolean }[] = [
    { label: t().filetree.newNote, action: () => { onNewFile(parentPath); onClose(); } },
    { label: t().filetree.newFolder, action: () => { onNewFolder(parentPath); onClose(); } },
    { label: t().filetree.rename, action: () => { onRename(state.node.path, state.node.name); onClose(); } },
    { label: t().filetree.delete, action: () => { onDelete(state.node.path); onClose(); }, danger: true },
  ];
  return (
    <div ref={menuRef} style={{ position: "fixed", left: state.x, top: state.y, zIndex: 1000, background: "var(--bg-toolbar)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 0", minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", fontSize: 13 }}>
      {items.map((item, i) => (
        <div key={i} onClick={item.action} style={{ padding: "6px 16px", cursor: "pointer", color: item.danger ? "#E81123" : "var(--text-primary)", background: "transparent" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{item.label}</div>
      ))}
    </div>
  );
}

// ---- Recent Workspaces Dropdown ----
function RecentWorkspacesDropdown({ current, recents, onSelect, onRemove }: {
  current: string | null; recents: string[];
  onSelect: (p: string) => void; onRemove: (p: string) => void;
}) {
  return (
    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "var(--bg-toolbar)", borderBottom: "1px solid var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", maxHeight: 280, overflowY: "auto", padding: "4px 0" }}>
      <div style={{ padding: "4px 12px 6px", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>{t().filetree.recentWorkspaces}</div>
      {recents.length === 0 ? (
        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-tertiary)" }}>{t().filetree.noNotes}</div>
      ) : (
        recents.map((p) => {
          const name = p.split(/[\\/]/).pop() || p;
          const isCurrent = p === current;
          return (
            <div key={p} onClick={() => onSelect(p)} title={p}
              style={{ display: "flex", alignItems: "center", padding: "6px 12px", cursor: "pointer", fontSize: 13, color: isCurrent ? "var(--text-accent)" : "var(--text-primary)", background: isCurrent ? "var(--bg-sidebar-active)" : "transparent", whiteSpace: "nowrap" }}
              onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "var(--bg-sidebar-hover)"; }}
              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ marginRight: 6, flexShrink: 0 }}>{"\uD83D\uDCC1"}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); onRemove(p); }}
                title={t().filetree.removeWorkspace}
                style={{ marginLeft: 6, flexShrink: 0, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, color: "var(--text-tertiary)", fontSize: 11 }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "#E81123"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}>{"\u2715"}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---- FileTree ----
export function FileTree() {
  const tree = useStore(s => s.tree);
  const workspacePath = useStore(s => s.workspacePath);
  const selectedFilePath = useStore(s => s.selectedFilePath);
  const expandedFolders = useStore(s => s.expandedFolders);
  const toggleFolder = useStore(s => s.toggleFolder);
  const setSelectedFile = useStore(s => s.setSelectedFile);
  const setCurrentFile = useStore(s => s.setCurrentFile);
  const setTree = useStore(s => s.setTree);
  const recentWorkspaces = useStore(s => s.recentWorkspaces);
  const removeRecentWorkspace = useStore(s => s.removeRecentWorkspace);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const workspaceAreaRef = useRef<HTMLDivElement>(null);

  const flatNodes = useMemo(() => flattenTree(tree, expandedFolders), [tree, expandedFolders]);

  const refreshTree = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const t = await fs.openWorkspace(workspacePath);
      setTree(t);
    } catch { /* */ }
  }, [workspacePath, setTree]);

  const openFile = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const content = await fs.readFile(filePath);
      setCurrentFile(filePath, content);
    } catch {
      setCurrentFile(filePath, "# " + (filePath.split(/[\\/]/).pop() || "") + "\n\n");
    }
  }, [setSelectedFile, setCurrentFile]);

  const handleNewFile = useCallback(async (parentPath?: string) => {
    const name = prompt("", t().filetree.untitled + ".md");
    if (!name) return;
    const base = parentPath || workspacePath || "";
    const newPath = base + "\\" + name;
    try {
      await fs.createFile(newPath);
      await refreshTree();
      openFile(newPath);
    } catch { /* */ }
  }, [workspacePath, refreshTree, openFile]);

  const handleNewFolder = useCallback(async (parentPath?: string) => {
    const name = prompt("", t().filetree.folderName);
    if (!name) return;
    const base = parentPath || workspacePath || "";
    try {
      await fs.createFolder(base + "\\" + name);
      await refreshTree();
    } catch { /* */ }
  }, [workspacePath, refreshTree]);

  const handleRename = useCallback(async (path: string, oldName: string) => {
    const newName = prompt("New name:", oldName);
    if (!newName || newName === oldName) return;
    const newPath = path.replace(/[\\/][^\\/]+$/, "\\" + newName);
    try {
      await fs.renameFile(path, newPath);
      await refreshTree();
    } catch { /* */ }
  }, [refreshTree]);

  const handleDelete = useCallback(async (path: string) => {
    const name = path.split(/[\\/]/).pop() || "";
    if (!confirm("Delete \"" + name + "\"?")) return;
    try {
      await fs.deleteFile(path);
      await refreshTree();
    } catch { /* */ }
  }, [refreshTree]);

  // Switch to a workspace: update current + recents, then load its tree.
  const switchWorkspace = useCallback(async (path: string) => {
    const store = useStore.getState();
    store.setWorkspace(path);
    store.setLoading(true);
    try {
      const t = await fs.openWorkspace(path);
      store.setTree(t);
    } catch { store.setTree([]); }
    store.setLoading(false);
  }, []);

  const handleOpenFileDialog = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (file && typeof file === "string") {
        const content = await fs.readFile(file);
        const store = useStore.getState();
        store.setSelectedFile(file);
        store.setCurrentFile(file, content);
        // Auto-add the file's directory as the workspace (shown in the sidebar)
        // when it lies outside the current workspace.
        const parent = parentDir(file);
        const ws = store.workspacePath;
        const inCurrent = isWithinWorkspace(parent, ws);
        if (!inCurrent) {
          store.setWorkspace(parent);
          try { const t = await fs.openWorkspace(parent); store.setTree(t); } catch {}
        }
      }
    } catch { /* */ }
  }, []);

  const handleOpenFolderDialog = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const folder = await open({ directory: true, multiple: false, title: t().filetree.openFolder });
      if (folder && typeof folder === "string") switchWorkspace(folder);
    } catch { /* */ }
  }, [switchWorkspace]);

  // Close the workspace dropdown when clicking outside of it.
  useEffect(() => {
    if (!showWorkspaces) return;
    const h = (e: MouseEvent) => {
      if (workspaceAreaRef.current && !workspaceAreaRef.current.contains(e.target as Node)) setShowWorkspaces(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showWorkspaces]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!treeRef.current?.contains(document.activeElement)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "n" && !e.shiftKey) { e.preventDefault(); handleNewFile(); return; }
      if (mod && e.key === "N" && e.shiftKey) { e.preventDefault(); handleNewFolder(); return; }

      if (e.key === "ArrowDown") { e.preventDefault(); setFocusIndex(i => Math.min(i + 1, flatNodes.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocusIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" && focusIndex >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node) node.isDir ? toggleFolder(node.path) : openFile(node.path);
        return;
      }
      if (e.key === "ArrowRight" && focusIndex >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node?.isDir && !expandedFolders.includes(node.path)) toggleFolder(node.path);
        return;
      }
      if (e.key === "ArrowLeft" && focusIndex >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node?.isDir && expandedFolders.includes(node.path)) toggleFolder(node.path);
        return;
      }
      if (e.key === "F2" && focusIndex >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node) handleRename(node.path, node.name);
        return;
      }
      if (e.key === "Delete" && focusIndex >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node) handleDelete(node.path);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flatNodes, focusIndex, expandedFolders, toggleFolder, openFile, handleNewFile, handleNewFolder, handleRename, handleDelete]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const workspaceName = workspacePath ? workspacePath.split(/[\\/]/).pop() || workspacePath : "";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Action row: open file / open folder / new note */}
      <div style={{ height: 36, display: "flex", alignItems: "center", padding: "0 8px", gap: 2, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <HeaderBtn title={t().filetree.openFile} onClick={handleOpenFileDialog}><OpenFileIcon /></HeaderBtn>
        <HeaderBtn title={t().filetree.openFolder} onClick={handleOpenFolderDialog}><OpenFolderIcon /></HeaderBtn>
        <div style={{ flex: 1 }} />
        <HeaderBtn title={t().filetree.newNote + " (Ctrl+N)"} onClick={() => handleNewFile()}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M7.5 2.5v10M2.5 7.5h10" />
          </svg>
        </HeaderBtn>
      </div>

      {/* Workspace selector with recent-workspaces dropdown */}
      <div ref={workspaceAreaRef} style={{ position: "relative", flexShrink: 0 }}>
        <div onClick={() => setShowWorkspaces(v => !v)}
          style={{ height: 32, display: "flex", alignItems: "center", padding: "0 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", background: showWorkspaces ? "var(--bg-hover)" : "transparent", userSelect: "none" }}
          onMouseEnter={e => { if (!showWorkspaces) e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { if (!showWorkspaces) e.currentTarget.style.background = "transparent"; }}>
          <span style={{ marginRight: 6, flexShrink: 0 }}>{"\uD83D\uDCC1"}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspaceName || t().filetree.folder}</span>
          <span style={{ fontSize: 9, marginLeft: 4, flexShrink: 0, transform: showWorkspaces ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>{"\u25BC"}</span>
        </div>
        {showWorkspaces && (
          <RecentWorkspacesDropdown
            current={workspacePath}
            recents={recentWorkspaces}
            onSelect={(p) => { setShowWorkspaces(false); switchWorkspace(p); }}
            onRemove={removeRecentWorkspace} />
        )}
      </div>

      <div ref={treeRef} tabIndex={0} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0", outline: "none" }}>
        {tree.length === 0 ? (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>{t().filetree.noNotes}</div>
        ) : (
          tree.map((node) => (
            <FileTreeNode key={node.path} node={node} depth={0}
              selectedFilePath={selectedFilePath} expandedFolders={expandedFolders}
              onToggle={toggleFolder} onSelect={openFile}
              onContextMenu={handleContextMenu} focusIndex={focusIndex}
              flatNodes={flatNodes} />
          ))
        )}
      </div>
      {contextMenu && (
        <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)}
          onNewFile={handleNewFile} onNewFolder={handleNewFolder}
          onRename={handleRename} onDelete={handleDelete} />
      )}
    </div>
  );
}

// ---- FileTreeNode (memoized — avoids re-rendering the whole tree on unrelated state changes) ----
const FileTreeNode = memo(function FileTreeNode({ node, depth, selectedFilePath, expandedFolders, onToggle, onSelect, onContextMenu, focusIndex, flatNodes }: {
  node: FileNode; depth: number; selectedFilePath: string | null;
  expandedFolders: string[]; onToggle: (p: string) => void; onSelect: (p: string) => void;
  onContextMenu: (e: React.MouseEvent, n: FileNode) => void;
  focusIndex: number; flatNodes: FileNode[];
}) {
  const isExpanded = expandedFolders.includes(node.path);
  const isSelected = selectedFilePath === node.path;
  const nodeIndex = flatNodes.findIndex(n => n.path === node.path);
  const isFocused = focusIndex === nodeIndex;
  const pl = 12 + depth * 12;

  return (
    <>
      <div
        onClick={() => node.isDir ? onToggle(node.path) : onSelect(node.path)}
        onContextMenu={(e) => onContextMenu(e, node)}
        style={{ height: 28, display: "flex", alignItems: "center", paddingLeft: pl, paddingRight: 8, cursor: "pointer", background: isFocused ? "var(--bg-sidebar-active)" : isSelected ? "var(--bg-sidebar-active)" : "transparent", fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "background-color 100ms ease", userSelect: "none", outline: isFocused ? "1px solid var(--text-accent)" : "none", outlineOffset: -1 }}
        onMouseEnter={e => { if (!isSelected && !isFocused) e.currentTarget.style.background = "var(--bg-sidebar-hover)"; }}
        onMouseLeave={e => { if (!isSelected && !isFocused) e.currentTarget.style.background = "transparent"; }}>
        {node.isDir && <span style={{ marginRight: 4, fontSize: 10, width: 12, flexShrink: 0 }}>{isExpanded ? "\u25BC" : "\u25B6"}</span>}
        <span style={{ marginRight: 4, flexShrink: 0 }}>{node.isDir ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</span>
      </div>
      {node.isDir && isExpanded && node.children?.map(child => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1}
          selectedFilePath={selectedFilePath} expandedFolders={expandedFolders}
          onToggle={onToggle} onSelect={onSelect} onContextMenu={onContextMenu}
          focusIndex={focusIndex} flatNodes={flatNodes} />
      ))}
    </>
  );
});

// ---- Header action button ----
// Hover background is driven by CSS (:hover) instead of JS mouse handlers:
// when a click opens a native dialog (prompt), mouseleave never fires and a
// JS-set inline background would stay stuck on the button.
function HeaderBtn(p: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return <button className="zn-header-btn" onClick={p.onClick} title={p.title}>{p.children}</button>;
}

function OpenFileIcon() { return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2h4l2 2h5a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/></svg>); }
function OpenFolderIcon() { return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/><rect x="6" y="10" width="4" height="3" rx="0.5" fill="currentColor"/></svg>); }