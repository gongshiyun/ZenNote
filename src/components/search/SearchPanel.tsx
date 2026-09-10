import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { searchWorkspace, type WsSearchResult } from "../../lib/workspaceSearch";
import { openDocumentWithSave } from "../../lib/openDocument";
import { splitHighlight } from "../../lib/highlight";

interface SearchResult {
  filePath: string;
  fileName: string;
  /** 1-based line number; 0 = file-name match */
  line: number;
  content: string;
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

  useEffect(() => { inputRef.current?.focus(); }, []);

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
    const s = useStore.getState();
    const opened = await openDocumentWithSave(r.filePath, undefined, {
      sourceMode: s.defaultSourceMode,
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
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      display: "flex", justifyContent: "center", paddingTop: "12vh",
      background: "rgba(0,0,0,0.3)",
    }} onClick={onClose}>
      <div style={{
        width: 560, maxHeight: "70vh", background: "var(--bg-toolbar)",
        borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        border: "1px solid var(--border)",
      }} onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t().search.placeholder}
            style={{
              width: "100%", border: "none", outline: "none",
              fontSize: 15, background: "transparent",
              color: "var(--text-primary)", fontFamily: "inherit",
            }}
          />
        </div>

        {/* Results list */}
        <div ref={listRef} style={{ flex: 1, overflow: "auto", padding: "4px 0", fontSize: 13 }}>
          {searching && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-tertiary)" }}>
              {t().search.searching}
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-tertiary)" }}>
              {t().search.noResults}
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={i}
              data-search-item
              onClick={() => handleClick(r)}
              style={{
                padding: "8px 16px", cursor: "pointer",
                borderBottom: "1px solid var(--border-light)",
                background: i === focusIdx ? "var(--bg-sidebar-active)" : "transparent",
              }}
              onMouseEnter={e => {
                if (i !== focusIdx) e.currentTarget.style.background = "var(--bg-hover)";
                setFocusIdx(i);
              }}
              onMouseLeave={e => {
                if (i !== focusIdx) e.currentTarget.style.background = "transparent";
              }}>
              <div style={{ fontWeight: 600, marginBottom: 2, color: "var(--text-primary)" }}>
                <HighlightedText text={r.fileName} query={query} />
                {r.line > 0 ? (
                  <span style={{ fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 8 }}>
                    :{r.line}
                  </span>
                ) : (
                  <span style={{
                    fontWeight: 400, marginLeft: 8, fontSize: 11, color: "var(--text-accent)",
                    border: "1px solid var(--border)", borderRadius: 4, padding: "0 5px",
                  }}>
                    {t().search.fileNameMatch}
                  </span>
                )}
              </div>
              {r.content && (
                <div style={{
                  color: "var(--text-secondary)", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  <HighlightedText text={r.content} query={query} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 16px", fontSize: 11, color: "var(--text-tertiary)",
          borderTop: "1px solid var(--border)",
        }}>
          {results.length} {t().search.results} · {t().search.escToClose}
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
          <mark
            key={index}
            style={{
              background: "var(--selection-bg)",
              color: "inherit",
              borderRadius: 2,
              padding: "0 1px",
            }}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
