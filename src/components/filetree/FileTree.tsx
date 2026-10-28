import { useCallback, useState, useEffect, useRef, useMemo, memo, type CSSProperties } from "react";
import { remapWorkspacePaths, removeWorkspacePaths, useStore } from "../../store";
import { t } from "../../i18n";
import type { FileNode } from "../../domain";
import { parentDir, isWithinWorkspace } from "../../domain";
import { affectedOpenPaths, joinPath, replaceFileName } from "../../lib/filePaths";
import { invalidateWorkspaceSearchCache } from "../../lib/workspaceSearch";
import { openDocumentWithSave } from "../../lib/openDocument";
import * as fs from "../../services";
import {
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  ContextMenu,
  CopyIcon,
  DropdownMenu,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  IconButton,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  Spinner,
  TrashIcon,
} from "../ui";

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

// ---- FileTree ----
export function FileTree() {
  const tree = useStore(s => s.tree);
  const workspacePath = useStore(s => s.workspacePath);
  const selectedFilePath = useStore(s => s.selectedFilePath);
  const expandedFolders = useStore(s => s.expandedFolders);
  const toggleFolder = useStore(s => s.toggleFolder);
  const setSelectedFile = useStore(s => s.setSelectedFile);
  const setTree = useStore(s => s.setTree);
  const recentWorkspaces = useStore(s => s.recentWorkspaces);
  const removeRecentWorkspace = useStore(s => s.removeRecentWorkspace);
  const isLoading = useStore(s => s.isLoading);
  const showFileExtensions = useStore(s => s.showFileExtensions);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  // Inline rename: which row is being edited and the draft name.
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Inline "new note / new folder" prompt shown above the tree. window.prompt()
  // is unreliable inside the Tauri webview, so creation asks in-panel instead.
  const [createPrompt, setCreatePrompt] = useState<{ kind: "file" | "folder"; parent: string } | null>(null);
  const [createDraft, setCreateDraft] = useState("");
  const treeRef = useRef<HTMLDivElement>(null);
  // The recents menu dismisses itself on the same press that hits its trigger;
  // remember that press so the following click closes instead of reopening it.
  const recentsSuppressUntilRef = useRef(0);
  // Folders whose children are currently being fetched (dedupe guard).
  const loadingFoldersRef = useRef(new Set<string>());

  const flatNodes = useMemo(() => flattenTree(tree, expandedFolders), [tree, expandedFolders]);

  // Clicking a row moves focus into the tree container so ↑↓ / F2 / Delete work
  // immediately, without a detour through the keyboard tab order.
  const focusRow = useCallback((index: number) => {
    setFocusIndex(index);
    treeRef.current?.focus({ preventScroll: true });
  }, []);

  // Keep the keyboard cursor visible while it moves.
  useEffect(() => {
    if (focusIndex < 0) return;
    const row = treeRef.current?.querySelectorAll<HTMLElement>("[data-tree-index]")[focusIndex];
    row?.scrollIntoView?.({ block: "nearest" });
  }, [focusIndex]);

  const refreshTree = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const t = await fs.openWorkspace(workspacePath, useStore.getState().showHiddenFiles);
      setTree(t);
    } catch { /* */ }
  }, [workspacePath, setTree]);

  // Lazy tree: load ONE folder level on demand when it gets expanded.
  // children === null marks "not loaded yet"; on failure treat as empty so the
  // spinner never sticks.
  const loadChildren = useCallback(async (path: string) => {
    if (loadingFoldersRef.current.has(path)) return;
    loadingFoldersRef.current.add(path);
    try {
      const children = await fs.readDir(path, useStore.getState().showHiddenFiles);
      useStore.getState().setFolderChildren(path, children);
    } catch {
      useStore.getState().setFolderChildren(path, []);
    } finally {
      loadingFoldersRef.current.delete(path);
    }
  }, []);

  const openFile = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    // The store applies the "default source mode" setting only until the user
    // has chosen a mode; after that, in-session opens keep the current mode.
    const opened = await openDocumentWithSave(filePath, undefined, {
      sourceMode: useStore.getState().defaultSourceMode,
    });
    if (!opened) {
      // Never fabricate content: a failed read (locked / non-UTF-8 / deleted) or
      // a superseded open must leave the current document untouched, otherwise
      // the first keystroke would autosave fake content over the real file.
      useStore.getState().setSaveError(t().filetree.openFailed);
      return;
    }
    useStore.getState().setSaveError(null);
  }, [setSelectedFile]);

  const beginCreate = useCallback((kind: "file" | "folder", parentPath?: string) => {
    setCreateDraft("");
    setCreatePrompt({ kind, parent: parentPath || workspacePath || "" });
  }, [workspacePath]);

  const submitCreate = useCallback(async () => {
    const request = createPrompt;
    if (!request) return;
    const name = createDraft.trim();
    setCreatePrompt(null);
    setCreateDraft("");
    if (!name) return;
    const newPath = joinPath(request.parent, name);
    try {
      if (request.kind === "file") {
        await fs.createFile(newPath);
        invalidateWorkspaceSearchCache(newPath);
        await refreshTree();
        await openFile(newPath);
      } else {
        await fs.createFolder(newPath);
        invalidateWorkspaceSearchCache();
        await refreshTree();
      }
    } catch { /* */ }
  }, [createPrompt, createDraft, refreshTree, openFile]);

  const cancelCreate = useCallback(() => {
    setCreatePrompt(null);
    setCreateDraft("");
  }, []);

  // Rename is edited inline in the tree row (Enter commits, Escape cancels).
  const beginRename = useCallback((path: string, name: string) => {
    setRenamingPath(path);
    setRenameDraft(name);
  }, []);

  const cancelRename = useCallback(() => { setRenamingPath(null); }, []);

  const commitRename = useCallback(async (path: string) => {
    const oldName = path.split(/[\\/]/).pop() || "";
    const newName = renameDraft.trim();
    setRenamingPath(null);
    if (!newName || newName === oldName) return;
    const newPath = replaceFileName(path, newName);
    try {
      await fs.renameFile(path, newPath);
      invalidateWorkspaceSearchCache(path);
      remapWorkspacePaths(path, newPath);
      await refreshTree();
    } catch { /* */ }
  }, [renameDraft, refreshTree]);

  const handleDelete = useCallback(async (path: string) => {
    const name = path.split(/[\\/]/).pop() || "";
    const store = useStore.getState();
    const affected = new Set([
      ...affectedOpenPaths(store.openTabs, path),
      ...(store.currentFilePath && affectedOpenPaths([store.currentFilePath], path).length
        ? [store.currentFilePath]
        : []),
    ]);
    if (store.currentFilePath && affected.has(store.currentFilePath)) {
      alert(t().filetree.deleteCurrentBlocked);
      return;
    }
    const hasDirty = Array.from(affected).some(p => store.fileStates.get(p)?.dirty);
    if (hasDirty) {
      alert(t().filetree.deleteDirtyBlocked);
      return;
    }
    if (!confirm(`${t().filetree.delete} "${name}"?`)) return;
    try {
      await fs.deleteFile(path);
      invalidateWorkspaceSearchCache(path);
      removeWorkspacePaths(path);
      await refreshTree();
    } catch { /* */ }
  }, [refreshTree]);

  const copyPath = useCallback((path: string) => {
    try { void navigator.clipboard?.writeText(path); } catch { /* clipboard unavailable */ }
  }, []);

  // Switch to a workspace: update current + recents, then load its tree.
  // The OLD tree is cleared IMMEDIATELY so the panel never keeps showing the
  // previous workspace while the new listing loads (spinner instead).
  const switchWorkspace = useCallback(async (path: string) => {
    const store = useStore.getState();
    store.setWorkspace(path);
    store.setTree([]);
    store.setLoading(true);
    try {
      const t = await fs.openWorkspace(path, store.showHiddenFiles);
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
        await openDocumentWithSave(file, content, { sourceMode: store.defaultSourceMode });
        // Auto-add the file's directory as the workspace (shown in the sidebar)
        // when it lies outside the current workspace.
        const parent = parentDir(file);
        const ws = store.workspacePath;
        const inCurrent = isWithinWorkspace(parent, ws);
        if (!inCurrent) {
          store.setWorkspace(parent);
          store.setTree([]);
          store.setLoading(true);
          try { const t = await fs.openWorkspace(parent, store.showHiddenFiles); store.setTree(t); } catch { store.setTree([]); } finally { store.setLoading(false); }
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

  // Recents menu trigger. The menu's own dismissal listener closes on the same
  // press that hits the trigger; a window-capture watcher registered while the
  // menu is open notes that press, so the queued click closes rather than
  // reopening the menu.
  useEffect(() => {
    if (!showWorkspaces) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-recents-trigger]")) {
        recentsSuppressUntilRef.current = Date.now() + 500;
      }
    };
    window.addEventListener("mousedown", onPointerDown, true);
    return () => window.removeEventListener("mousedown", onPointerDown, true);
  }, [showWorkspaces]);

  const toggleRecents = useCallback(() => {
    if (Date.now() < recentsSuppressUntilRef.current) {
      recentsSuppressUntilRef.current = 0;
      return;
    }
    setShowWorkspaces(value => !value);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never hijack keys while an IME candidate window is open.
      if (e.isComposing || e.keyCode === 229) return;
      const target = e.target as HTMLElement | null;
      // Inline rename input owns its own keys.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!treeRef.current?.contains(document.activeElement)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "n" && !e.shiftKey) { e.preventDefault(); beginCreate("file"); return; }
      if (mod && e.key === "N" && e.shiftKey) { e.preventDefault(); beginCreate("folder"); return; }

      if (e.key === "ArrowDown") { e.preventDefault(); setFocusIndex(i => Math.min(i + 1, flatNodes.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocusIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" && focusIndex >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node) {
          if (node.isDir) toggleFolder(node.path);
          else openFile(node.path);
        }
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
        if (node) beginRename(node.path, node.name);
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
  }, [flatNodes, focusIndex, expandedFolders, toggleFolder, openFile, beginCreate, beginRename, handleDelete]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const workspaceName = workspacePath ? workspacePath.split(/[\\/]/).pop() || workspacePath : "";
  const menuParent = contextMenu
    ? (contextMenu.node.isDir ? contextMenu.node.path : parentDir(contextMenu.node.path))
    : null;

  return (
    <div className="zn-sidebar">
      <div className="zn-panel-top">
        {/* Workspace header: folder + name, then the panel actions */}
        <div className="zn-panel-head">
        <button
          type="button"
          className="zn-panel-head__title"
          title={t().filetree.recentWorkspaces}
          aria-haspopup="menu"
          aria-expanded={showWorkspaces}
          data-recents-trigger
          onClick={toggleRecents}
        >
          <FolderOpenIcon size={15} className="zn-panel-head__icon" />
          <span className="zn-panel-head__name zn-ellipsis">
            {workspaceName || t().filetree.folder}
          </span>
        </button>
        <div className="zn-panel-head__actions">
          <IconButton size="sm" label={t().filetree.openFile} onClick={handleOpenFileDialog}>
            <FileTextIcon size={16} />
          </IconButton>
          <IconButton size="sm" label={t().filetree.openFolder} onClick={handleOpenFolderDialog}>
            <FolderOpenIcon size={16} />
          </IconButton>
          <IconButton
            size="sm"
            label={t().filetree.newNote + " (Ctrl+N)"}
            onClick={() => beginCreate("file")}
          >
            <PlusIcon size={16} />
          </IconButton>
          <IconButton
            size="sm"
            label={t().filetree.refresh}
            onClick={() => void refreshTree()}
            disabled={isLoading}
          >
            <RefreshIcon size={16} />
          </IconButton>
          <IconButton
            size="sm"
            label={t().filetree.recentWorkspaces}
            aria-haspopup="menu"
            aria-expanded={showWorkspaces}
            data-recents-trigger
            onClick={toggleRecents}
          >
            <ClockIcon size={16} />
          </IconButton>
        </div>

        {showWorkspaces && (
          <DropdownMenu
            align="left"
            onClose={() => setShowWorkspaces(false)}
            label={t().filetree.recentWorkspaces}
          >
            <MenuLabel>{t().filetree.recentWorkspaces}</MenuLabel>
            {recentWorkspaces.length === 0 ? (
              <div className="zn-recent-menu__empty">{t().filetree.noNotes}</div>
            ) : (
              recentWorkspaces.map((p) => {
                const name = p.split(/[\\/]/).pop() || p;
                const isCurrent = p === workspacePath;
                return (
                  <div
                    key={p}
                    className="zn-recent-menu__item"
                    data-current={isCurrent || undefined}
                  >
                    <button
                      type="button"
                      className="zn-recent-menu__select"
                      title={p}
                      onClick={() => {
                        setShowWorkspaces(false);
                        void switchWorkspace(p);
                      }}
                    >
                      <FolderIcon size={14} className="zn-recent-menu__icon" />
                      <span className="zn-recent-menu__name zn-ellipsis">{name}</span>
                      <span className="zn-recent-menu__path zn-mono zn-ellipsis">{p}</span>
                    </button>
                    <IconButton
                      size="sm"
                      className="zn-recent-menu__remove"
                      label={t().filetree.removeWorkspace}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeRecentWorkspace(p);
                      }}
                    >
                      <CloseIcon size={13} />
                    </IconButton>
                  </div>
                );
              })
            )}
          </DropdownMenu>
        )}
      </div>

      <div className="zn-panel-section">
        <span className="zn-label">{t().filetree.workspace}</span>
      </div>
      </div>

      <div
        ref={treeRef}
        className="zn-tree"
        role="tree"
        aria-label={t().shortcuts.sidebar}
        tabIndex={0}
      >
        {createPrompt && (
          <div className="zn-tree-prompt">
            {createPrompt.kind === "file"
              ? <FilePlusIcon size={15} className="zn-tree-row__icon" />
              : <FolderPlusIcon size={15} className="zn-tree-row__icon" />}
            <input
              className="zn-tree-rename"
              value={createDraft}
              autoFocus
              placeholder={createPrompt.kind === "file"
                ? t().filetree.untitled + ".md"
                : t().filetree.folderName}
              aria-label={createPrompt.kind === "file"
                ? t().filetree.noteName
                : t().filetree.folderName}
              onChange={(e) => setCreateDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); void submitCreate(); }
                else if (e.key === "Escape") { e.preventDefault(); cancelCreate(); }
              }}
              onBlur={cancelCreate}
            />
          </div>
        )}
        {isLoading ? (
          <div className="zn-tree__state">
            <Spinner size={18} />
            <span>{t().welcome.loadingWorkspace}</span>
          </div>
        ) : tree.length === 0 ? (
          <div className="zn-empty zn-tree__empty">{t().filetree.noNotes}</div>
        ) : (
          tree.map((node) => (
            <FileTreeNode key={node.path} node={node} depth={0}
              selectedFilePath={selectedFilePath} expandedFolders={expandedFolders}
              onToggle={toggleFolder} onSelect={openFile}
              onContextMenu={handleContextMenu} focusIndex={focusIndex}
              flatNodes={flatNodes} onLoadChildren={loadChildren}
              showFileExtensions={showFileExtensions}
              onFocusRow={focusRow}
              renamingPath={renamingPath} renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft} onRenameCommit={commitRename}
              onRenameCancel={cancelRename} />
          ))
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          label={contextMenu.node.name}
        >
          <MenuItem
            label={t().filetree.newNote}
            icon={<FilePlusIcon size={15} />}
            onSelect={() => { beginCreate("file", menuParent ?? undefined); setContextMenu(null); }}
          />
          <MenuItem
            label={t().filetree.newFolder}
            icon={<FolderPlusIcon size={15} />}
            onSelect={() => { beginCreate("folder", menuParent ?? undefined); setContextMenu(null); }}
          />
          <MenuSeparator />
          <MenuItem
            label={t().filetree.rename}
            icon={<PencilIcon size={15} />}
            onSelect={() => {
              beginRename(contextMenu.node.path, contextMenu.node.name);
              setContextMenu(null);
            }}
          />
          <MenuItem
            label={t().tabs.copyPath}
            icon={<CopyIcon size={15} />}
            onSelect={() => { copyPath(contextMenu.node.path); setContextMenu(null); }}
          />
          <MenuSeparator />
          <MenuItem
            label={t().filetree.delete}
            icon={<TrashIcon size={15} />}
            danger
            onSelect={() => { void handleDelete(contextMenu.node.path); setContextMenu(null); }}
          />
        </ContextMenu>
      )}
    </div>
  );
}

// ---- FileTreeNode (memoized — avoids re-rendering the whole tree on unrelated state changes) ----
interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedFilePath: string | null;
  expandedFolders: string[];
  onToggle: (p: string) => void;
  onSelect: (p: string) => void;
  onContextMenu: (e: React.MouseEvent, n: FileNode) => void;
  focusIndex: number;
  flatNodes: FileNode[];
  onLoadChildren: (p: string) => void;
  showFileExtensions: boolean;
  onFocusRow: (index: number) => void;
  renamingPath: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: (path: string) => void;
  onRenameCancel: () => void;
}

const FileTreeNode = memo(function FileTreeNode({
  node, depth, selectedFilePath, expandedFolders, onToggle, onSelect, onContextMenu,
  focusIndex, flatNodes, onLoadChildren, showFileExtensions, onFocusRow,
  renamingPath, renameDraft, onRenameDraftChange, onRenameCommit, onRenameCancel,
}: FileTreeNodeProps) {
  const isExpanded = expandedFolders.includes(node.path);
  const isSelected = selectedFilePath === node.path;
  const nodeIndex = flatNodes.findIndex(n => n.path === node.path);
  const isFocused = focusIndex === nodeIndex;
  const isRenaming = renamingPath === node.path;
  const depthStyle = { "--zn-depth": depth } as CSSProperties;
  // Lazy tree: an expanded folder whose children haven't been fetched yet
  // (children === null) triggers an on-demand load exactly once.
  const needsLoad = node.isDir && isExpanded && node.children == null;
  useEffect(() => {
    if (needsLoad) onLoadChildren(node.path);
  }, [needsLoad, node.path, onLoadChildren]);

  const displayName = !node.isDir && !showFileExtensions
    ? node.name.replace(/\.md$/i, "")
    : node.name;

  return (
    <>
      <div
        className="zn-tree-row"
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected || undefined}
        aria-expanded={node.isDir ? isExpanded : undefined}
        data-dir={node.isDir || undefined}
        data-expanded={node.isDir ? isExpanded : undefined}
        data-selected={isSelected || undefined}
        data-focused={isFocused || undefined}
        data-tree-index={nodeIndex >= 0 ? nodeIndex : undefined}
        style={depthStyle}
        onMouseDown={() => {
          if (!isRenaming && nodeIndex >= 0) onFocusRow(nodeIndex);
        }}
        onClick={() => {
          if (isRenaming) return;
          if (node.isDir) onToggle(node.path);
          else onSelect(node.path);
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="zn-tree-row__chevron">
          {node.isDir ? <ChevronRightIcon size={14} /> : null}
        </span>
        <span className="zn-tree-row__icon">
          {node.isDir
            ? (isExpanded ? <FolderOpenIcon size={15} /> : <FolderIcon size={15} />)
            : <FileTextIcon size={15} />}
        </span>
        {isRenaming ? (
          <input
            className="zn-tree-rename"
            value={renameDraft}
            autoFocus
            aria-label={t().filetree.rename}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); onRenameCommit(node.path); }
              else if (e.key === "Escape") { e.preventDefault(); onRenameCancel(); }
            }}
            onBlur={onRenameCancel}
          />
        ) : (
          <span className="zn-tree-row__label">{displayName}</span>
        )}
      </div>
      {node.isDir && isExpanded && (node.children ? (
        node.children.map(child => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1}
            selectedFilePath={selectedFilePath} expandedFolders={expandedFolders}
            onToggle={onToggle} onSelect={onSelect} onContextMenu={onContextMenu}
            focusIndex={focusIndex} flatNodes={flatNodes} onLoadChildren={onLoadChildren}
            showFileExtensions={showFileExtensions} onFocusRow={onFocusRow}
            renamingPath={renamingPath} renameDraft={renameDraft}
            onRenameDraftChange={onRenameDraftChange} onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel} />
        ))
      ) : (
        <div
          className="zn-tree-row zn-tree-row--loading"
          role="treeitem"
          aria-level={depth + 2}
          aria-disabled="true"
          style={{ "--zn-depth": depth + 1 } as CSSProperties}
        >
          <span className="zn-tree-row__chevron" />
          <Spinner size={12} />
          <span className="zn-tree-row__label">{t().search.searching}</span>
        </div>
      ))}
    </>
  );
});
