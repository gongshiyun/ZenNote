import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import * as fs from "../../services";

interface SearchResult {
  filePath: string;
  fileName: string;
  line: number;
  content: string;
}

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const workspacePath = useStore(s => s.workspacePath);
  const setCurrentFile = useStore(s => s.setCurrentFile);
  const setSelectedFile = useStore(s => s.setSelectedFile);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Search with debounce
  useEffect(() => {
    if (!query || !workspacePath) { setResults([]); setFocusIdx(0); return; }
    abortRef.current = false;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const tree = await fs.openWorkspace(workspacePath);
        if (abortRef.current) return;
        const found: SearchResult[] = [];
        const q = query.toLowerCase();
        async function searchNode(node: any) {
          if (abortRef.current) return;
          if (node.is_dir) {
            if (node.children) for (const c of node.children) await searchNode(c);
          } else if (node.name.endsWith(".md")) {
            try {
              const content = await fs.readFile(node.path);
              const lines = content.split("\n");
              lines.forEach((line, i) => {
                if (line.toLowerCase().includes(q)) {
                  found.push({
                    filePath: node.path, fileName: node.name,
                    line: i + 1, content: line.trim().substring(0, 120),
                  });
                }
              });
            } catch { /* */ }
          }
        }
        for (const n of tree) await searchNode(n);
        if (!abortRef.current) {
          setResults(found.slice(0, 50));
          setFocusIdx(0);
        }
      } catch { /* */ }
      if (!abortRef.current) setSearching(false);
    }, 300);

    return () => { clearTimeout(timer); };
  }, [query, workspacePath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  const handleClick = useCallback(async (r: SearchResult) => {
    try {
      const content = await fs.readFile(r.filePath);
      setSelectedFile(r.filePath);
      setCurrentFile(r.filePath, content);
      onClose();
    } catch { /* */ }
  }, [setSelectedFile, setCurrentFile, onClose]);

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
            placeholder={t().search.placeholder + " (↑↓ to navigate, Enter to open, Esc to close)"}
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
              Searching...
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-tertiary)" }}>
              No results found
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
                {r.fileName}
                <span style={{ fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 8 }}>
                  :{r.line}
                </span>
              </div>
              <div style={{
                color: "var(--text-secondary)", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {r.content}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 16px", fontSize: 11, color: "var(--text-tertiary)",
          borderTop: "1px solid var(--border)",
        }}>
          {results.length} {t().search.results} · Esc to close · ↑↓ to navigate
        </div>
      </div>
    </div>
  );
}