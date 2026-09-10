import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileNode } from "../../domain";
import { t } from "../../i18n";
import { openDocumentWithSave } from "../../lib/openDocument";
import { useStore } from "../../store";
import * as fs from "../../services";
import { fuzzyScore } from "../../lib/fuzzy";

export function QuickOpen({ onClose }: { onClose: () => void }) {
  const workspacePath = useStore(s => s.workspacePath);
  const showHiddenFiles = useStore(s => s.showHiddenFiles);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspacePath) return;
    let cancelled = false;
    void fs.listMarkdownFiles(workspacePath, showHiddenFiles)
      .then(result => { if (!cancelled) setFiles(result); })
      .catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [workspacePath, showHiddenFiles]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return files;
    return files
      .map(file => {
        const relative = workspacePath
          ? file.path.slice(workspacePath.length).replace(/^[\\/]/, "")
          : file.path;
        return { file, score: fuzzyScore(relative, q) };
      })
      .filter((entry): entry is { file: FileNode; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.file);
  }, [files, query, workspacePath]);

  useEffect(() => {
    setFocusIdx(index => Math.min(index, Math.max(0, results.length - 1)));
  }, [results.length]);

  const open = useCallback(async (file: FileNode | undefined) => {
    if (!file) return;
    const s = useStore.getState();
    const opened = await openDocumentWithSave(file.path, undefined, {
      sourceMode: s.defaultSourceMode,
    });
    if (!opened) return;
    s.setSelectedFile(file.path);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx(index => Math.min(index + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx(index => Math.max(index - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        void open(results[focusIdx] ?? results[0]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusIdx, onClose, open, results]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 940,
        display: "flex", justifyContent: "center", paddingTop: "12vh",
        background: "rgba(0,0,0,0.3)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 580, maxHeight: "68vh", background: "var(--bg-toolbar)",
          border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)", overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
        onClick={event => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t().quickOpen.placeholder}
          style={{
            border: "none", outline: "none", padding: "13px 16px",
            background: "transparent", color: "var(--text-primary)",
            borderBottom: "1px solid var(--border)", fontSize: 15,
          }}
        />
        <div style={{ overflowY: "auto", padding: "4px 0" }}>
          {results.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              {t().quickOpen.noResults}
            </div>
          ) : results.map((file, index) => {
            const relative = workspacePath
              ? file.path.slice(workspacePath.length).replace(/^[\\/]/, "")
              : file.path;
            return (
              <div
                key={file.path}
                onMouseEnter={() => setFocusIdx(index)}
                onClick={() => { void open(file); }}
                style={{
                  padding: "7px 16px", cursor: "pointer",
                  background: index === focusIdx ? "var(--bg-sidebar-active)" : "transparent",
                  display: "flex", alignItems: "baseline", gap: 10,
                }}
              >
                <span style={{ color: "var(--text-primary)", fontSize: 13 }}>{file.name}</span>
                <span style={{
                  color: "var(--text-tertiary)", fontSize: 11,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {relative}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
