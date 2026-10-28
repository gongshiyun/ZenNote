import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { searchWorkspace, type WsSearchResult } from "../../lib/workspaceSearch";
import { openDocumentWithSave } from "../../lib/openDocument";
import { splitHighlight } from "../../lib/highlight";
import { Kbd, SearchIcon, Spinner } from "../ui";

interface SearchResult {
  filePath: string;
  fileName: string;
  /** 1-based line number; 0 = file-name match */
  line: number;
  content: string;
}

/** Directory part of a workspace-relative result path; empty for root files. */
function relativeDir(filePath: string, workspacePath: string | null): string {
  let relative = filePath;
  if (workspacePath && filePath.startsWith(workspacePath)) {
    relative = filePath.slice(workspacePath.length).replace(/^[\\/]/, "");
  }
  const index = Math.max(relative.lastIndexOf("/"), relative.lastIndexOf("\\"));
  return index > 0 ? relative.slice(0, index) : "";
}

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const workspacePath = useStore(s => s.workspacePath);
  const setSelectedFile = useStore(s => s.setSelectedFile);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Move focus into the palette on open, and hand it back on close.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => { restoreFocusRef.current?.focus?.(); };
  }, []);

  // Search with debounce. Runs in the Rust backend (search_workspace) with a
  // JS fallback; results are cached per workspace+query in workspaceSearch.
  useEffect(() => {
    if (!query || !workspacePath) {
      setResults([]);
      setFocusIdx(0);
      setSearching(false);
      return;
    }
    let active = true;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found: WsSearchResult[] = await searchWorkspace(workspacePath, query);
        if (active) {
          setResults(found);
          setFocusIdx(0);
        }
      } catch { /* */ }
      if (active) setSearching(false);
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, workspacePath]);

  const handleClick = useCallback(async (r: SearchResult) => {
    const opened = await openDocumentWithSave(r.filePath, undefined, {
      sourceMode: useStore.getState().defaultSourceMode,
    });
    if (!opened) return;
    setSelectedFile(r.filePath);
    onClose();
    // Hand the query and target line to the in-document find bar so the user
    // lands on the result they selected instead of the first workspace match.
    window.dispatchEvent(new CustomEvent("zn-find-open", { detail: { query, line: r.line } }));
  }, [setSelectedFile, onClose, query]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never hijack keys while an IME candidate window is open.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx(i => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx(i => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        handleClick(results[focusIdx] || results[0]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [results, focusIdx, handleClick, onClose]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-search-item]");
      const target = items[focusIdx] as HTMLElement;
      if (target) target.scrollIntoView({ block: "nearest" });
    }
  }, [focusIdx]);

  return (
    <div className="zn-overlay zn-overlay--top zn-search-overlay" onClick={onClose}>
      <div
        className="zn-search"
        role="dialog"
        aria-modal="true"
        aria-label={t().search.placeholder}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input row */}
        <div className="zn-search__head">
          <SearchIcon size={18} className="zn-search__icon" />
          <input
            ref={inputRef}
            className="zn-search__input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t().search.placeholder}
            aria-label={t().search.placeholder}
          />
          <span className="zn-search__esc"><Kbd>Esc</Kbd></span>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          className="zn-search__body"
          role="listbox"
          aria-label={t().search.placeholder}
        >
          {searching && (
            <div className="zn-search__state">
              <Spinner size={16} />
              <span>{t().search.searching}</span>
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <div className="zn-empty zn-search__empty">{t().search.noResults}</div>
          )}
          {!searching && results.map((r, i) => {
            const dir = relativeDir(r.filePath, workspacePath);
            return (
              <button
                key={`${r.filePath}:${r.line}:${i}`}
                type="button"
                role="option"
                aria-selected={i === focusIdx}
                data-search-item
                data-selected={i === focusIdx || undefined}
                className="zn-search-result"
                onClick={() => handleClick(r)}
                onMouseEnter={() => setFocusIdx(i)}
              >
                <span className="zn-search-result__head">
                  <span className="zn-search-result__title">
                    <HighlightedText text={r.fileName} query={query} />
                    {r.line > 0 ? (
                      <span className="zn-search-result__line">:{r.line}</span>
                    ) : (
                      <span className="zn-search-result__badge">{t().search.fileNameMatch}</span>
                    )}
                  </span>
                  {dir ? <span className="zn-search-result__path">{dir}</span> : null}
                </span>
                {r.content && (
                  <span className="zn-search-result__snippet">
                    <HighlightedText text={r.content} query={query} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint bar */}
        <div className="zn-search__footer">
          <span className="zn-search__count">
            {results.length > 0 ? `${results.length} ${t().search.results}` : null}
          </span>
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

function HighlightedText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((segment, index) =>
        segment.match ? (
          <mark key={index}>{segment.text}</mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
