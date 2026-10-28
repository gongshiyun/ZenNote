import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileNode } from "../../domain";
import { t } from "../../i18n";
import { openDocumentWithSave } from "../../lib/openDocument";
import { useStore } from "../../store";
import * as fs from "../../services";
import { fuzzyScore } from "../../lib/fuzzy";
import { FileTextIcon, Kbd, SearchIcon } from "../ui";

/** Directory part of a workspace-relative quick-open path; empty for root files. */
function relativeDir(filePath: string, workspacePath: string | null): string {
  let relative = filePath;
  if (workspacePath && filePath.startsWith(workspacePath)) {
    relative = filePath.slice(workspacePath.length).replace(/^[\\/]/, "");
  }
  const index = Math.max(relative.lastIndexOf("/"), relative.lastIndexOf("\\"));
  return index > 0 ? relative.slice(0, index) : "";
}

export function QuickOpen({ onClose }: { onClose: () => void }) {
  const workspacePath = useStore(s => s.workspacePath);
  const showHiddenFiles = useStore(s => s.showHiddenFiles);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!workspacePath) return;
    let cancelled = false;
    void fs.listMarkdownFiles(workspacePath, showHiddenFiles)
      .then(result => { if (!cancelled) setFiles(result); })
      .catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [workspacePath, showHiddenFiles]);

  // Move focus into the palette on open, and hand it back on close.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => { restoreFocusRef.current?.focus?.(); };
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

  // Auto-scroll the keyboard cursor into view.
  useEffect(() => {
    if (focusIdx < 0) return;
    const items = listRef.current?.querySelectorAll<HTMLElement>("[data-search-item]");
    items?.[focusIdx]?.scrollIntoView?.({ block: "nearest" });
  }, [focusIdx]);

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
      // Never hijack keys while an IME candidate window is open.
      if (e.isComposing || e.keyCode === 229) return;
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
    <div className="zn-overlay zn-overlay--top zn-search-overlay" onClick={onClose}>
      <div
        className="zn-search zn-quickopen"
        role="dialog"
        aria-modal="true"
        aria-label={t().quickOpen.placeholder}
        onClick={event => event.stopPropagation()}
      >
        {/* File-name input row */}
        <div className="zn-search__head">
          <SearchIcon size={18} className="zn-search__icon" />
          <input
            ref={inputRef}
            className="zn-search__input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t().quickOpen.placeholder}
            aria-label={t().quickOpen.placeholder}
          />
          <span className="zn-search__esc"><Kbd>Esc</Kbd></span>
        </div>

        {/* Fuzzy-filtered note list */}
        <div ref={listRef} className="zn-search__body" role="listbox" aria-label={t().quickOpen.placeholder}>
          {results.length === 0 ? (
            <div className="zn-empty zn-search__empty">{t().quickOpen.noResults}</div>
          ) : results.map((file, index) => {
            const dir = relativeDir(file.path, workspacePath);
            return (
              <button
                key={file.path}
                type="button"
                role="option"
                aria-selected={index === focusIdx}
                data-search-item
                data-selected={index === focusIdx || undefined}
                className="zn-search-result"
                onMouseEnter={() => setFocusIdx(index)}
                onClick={() => { void open(file); }}
              >
                <span className="zn-search-result__head">
                  <FileTextIcon size={15} className="zn-search-result__icon" />
                  <span className="zn-search-result__title">{file.name}</span>
                  {dir ? <span className="zn-search-result__path">{dir}</span> : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer hint bar */}
        <div className="zn-search__footer">
          <span className="zn-search__count" />
          <span className="zn-search__hints">
            <Kbd>↑↓</Kbd>
            <Kbd>↵</Kbd>
            <Kbd>Esc</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
