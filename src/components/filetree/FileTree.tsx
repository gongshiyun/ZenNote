import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import type { FileNode } from "../../store";

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
  const parentPath = state.node.isDir ? state.node.path : state.node.path.replace(/[\\/][^\\/]+$/, "");
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const treeRef = useRef<HTMLDivElement>(null);

  const flatNodes = useMemo(() => flattenTree(tree, expandedFolders), [tree, expandedFolders]);

  const refreshTree = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const t = await invoke<any[]>("open_workspace", { path: workspacePath });
      setTree(t);
    } catch { /* */ }
  }, [workspacePath, setTree]);

  const openFile = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const content = await invoke<string>("read_file", { path: filePath });
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
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("create_file", { path: newPath });
      await refreshTree();
      openFile(newPath);
    } catch { /* */ }
  }, [workspacePath, refreshTree, openFile]);

  const handleNewFolder = useCallback(async (parentPath?: string) => {
    const name = prompt("", t().filetree.folderName);
    if (!name) return;
    const base = parentPath || workspacePath || "";
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("create_folder", { path: base + "\\" + name });
      await refreshTree();
    } catch { /* */ }
  }, [workspacePath, refreshTree]);

  const handleRename = useCallback(async (path: string, oldName: string) => {
    const newName = prompt("New name:", oldName);
    if (!newName || newName === oldName) return;
    const newPath = path.replace(/[\\/][^\\/]+$/, "\\" + newName);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("rename_file", { oldPath: path, newPath });
      await refreshTree();
    } catch { /* */ }
  }, [refreshTree]);

  const handleDelete = useCallback(async (path: string) => {
    const name = path.split(/[\\/]/).pop() || "";
    if (!confirm("Delete \"" + name + "\"?")) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_file", { path });
      await refreshTree();
    } catch { /* */ }
  }, [refreshTree]);

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
      <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", flexShrink: 0 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t().filetree.folder}: {workspaceName}</span>
        <button onClick={() => handleNewFile()} title={t().filetree.newNote + " (Ctrl+N)"}
          style={{ border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px", borderRadius: 4 }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>+</button>
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

// ---- FileTreeNode ----
function FileTreeNode({ node, depth, selectedFilePath, expandedFolders, onToggle, onSelect, onContextMenu, focusIndex, flatNodes }: {
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
}