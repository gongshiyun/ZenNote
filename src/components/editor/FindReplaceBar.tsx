import { useState, useRef, useEffect, useCallback } from "react";
import { t } from "../../i18n";
import { findAllMatches, wrapIndex, defaultFindOptions, type FindOptions } from "../../lib/findQuery";

/**
 * Document find & replace bar.
 *
 * Both surfaces — Live Preview and source mode — are CodeMirror, so there is a
 * single backend: the matching logic in lib/findQuery runs against the document
 * string, and navigation and replacement dispatch CodeMirror change specs.
 * Nothing is mutated in the DOM.
 *
 * A second backend used to sit here, driving ProseMirror decorations through the
 * `znFind` plugin for the Crepe editor. It went with Crepe.
 */

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Pre-filled query (set when jumping in from the global search panel). */
  preset?: { query: string; line?: number; showReplace?: boolean; ts: number } | null;
  /** Changes whenever the active document changes. */
  documentKey?: string | null;
  /** CodeMirror EditorView getter — both editing surfaces are CodeMirror. */
  getCmView: () => any | null;
}

export function FindReplaceBar({ visible, onClose, preset, documentKey, getCmView }: Props) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [opts, setOpts] = useState<FindOptions>({ ...defaultFindOptions });
  const [invalidRegex, setInvalidRegex] = useState(false);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const findRef = useRef<HTMLInputElement>(null);

  // ---- CodeMirror backend helpers ----

  const cmMatches = useCallback(() => {
    const view = getCmView();
    if (!view) return [];
    return findAllMatches(view.state.doc.toString(), findText, opts);
  }, [getCmView, findText, opts]);

  const cmGoto = useCallback((index: number) => {
    const view = getCmView();
    if (!view) return;
    const matches = cmMatches();
    if (matches.length === 0) return;
    const idx = wrapIndex(index, matches.length);
    const m = matches[idx];
    view.dispatch({ selection: { anchor: m.from, head: m.to }, scrollIntoView: true });
    view.focus();
    setCurrentIdx(idx);
  }, [getCmView, cmMatches]);

  const cmReplaceOne = useCallback(() => {
    const view = getCmView();
    if (!view) return;
    const matches = cmMatches();
    if (matches.length === 0) return;
    const idx = wrapIndex(currentIdx, matches.length);
    const m = matches[idx];
    view.dispatch({ changes: { from: m.from, to: m.to, insert: replaceText } });
    setMatchCount(findAllMatches(view.state.doc.toString(), findText, opts).length);
  }, [getCmView, cmMatches, currentIdx, replaceText, findText, opts]);

  const cmReplaceAll = useCallback(() => {
    const view = getCmView();
    if (!view) return;
    const matches = cmMatches();
    if (matches.length === 0) return;
    const changes = matches.map(m => ({ from: m.from, to: m.to, insert: replaceText }));
    view.dispatch({ changes });
    setMatchCount(0);
    setCurrentIdx(-1);
  }, [getCmView, cmMatches, replaceText]);

  // ---- Shared actions ----

  const runFind = useCallback((jumpToLine?: number) => {
    if (!findText) {
      setMatchCount(0); setCurrentIdx(-1); setInvalidRegex(false);
      return;
    }
    const fails = opts.regex && buildFails(findText);
    setInvalidRegex(fails);
    if (fails) { setMatchCount(0); setCurrentIdx(-1); return; }

    const matches = cmMatches();
    setMatchCount(matches.length);
    const targetIndex = jumpToLine
      ? matches.findIndex(m => {
        const view = getCmView();
        return !!view?.state?.doc?.lineAt && view.state.doc.lineAt(m.from).number >= jumpToLine;
      })
      : 0;
    if (targetIndex > 0) cmGoto(targetIndex);
    else setCurrentIdx(matches.length ? 0 : -1);
  }, [findText, opts, getCmView, cmMatches, cmGoto]);

  const findNext = useCallback(() => cmGoto(currentIdx + 1), [currentIdx, cmGoto]);
  const findPrev = useCallback(() => cmGoto(currentIdx - 1), [currentIdx, cmGoto]);

  const replaceOne = useCallback(() => cmReplaceOne(), [cmReplaceOne]);
  const replaceAll = useCallback(() => cmReplaceAll(), [cmReplaceAll]);

  // Debounced re-run while typing / toggling options.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => runFind(targetLine ?? undefined), 200);
    return () => clearTimeout(timer);
  }, [runFind, visible, targetLine]);

  // Focus & preset handling.
  useEffect(() => {
    if (visible) {
      setTimeout(() => { findRef.current?.focus(); findRef.current?.select(); }, 50);
      if (preset?.query) {
        setFindText(preset.query);
        setTargetLine(typeof preset.line === "number" ? preset.line : null);
      }
      if (preset?.showReplace) setShowReplace(true);
    } else {
      setFindText(""); setReplaceText(""); setShowReplace(false);
      setMatchCount(0); setCurrentIdx(-1); setInvalidRegex(false);
      setTargetLine(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, preset?.ts]);

  // Re-sync the query when the editing surface or active document changes.
  useEffect(() => {
    if (visible && findText) runFind(targetLine ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey]);

  // Keyboard handling.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Enter" && !e.shiftKey && findText) { e.preventDefault(); findNext(); }
      else if (e.key === "Enter" && e.shiftKey && findText) { e.preventDefault(); findPrev(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        setShowReplace(true);
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === "r" && findText) {
        e.preventDefault(); setShowReplace(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onClose, findText, findNext, findPrev]);

  if (!visible) return null;

  const toggleOpt = (key: keyof FindOptions) => {
    setOpts(o => ({ ...o, [key]: !o[key] }));
  };

  return (
    <div style={{
      minHeight: 36, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      padding: "4px 12px", background: "var(--bg-statusbar)",
      borderBottom: "1px solid var(--border)", flexShrink: 0, fontSize: 13,
    }}>
      <input ref={findRef} value={findText} onChange={e => setFindText(e.target.value)}
        placeholder={t().find.find}
        style={{
          width: 160, border: "1px solid " + (invalidRegex ? "var(--text-danger)" : "var(--border)"), borderRadius: 4,
          padding: "3px 8px", background: "var(--bg-editor)",
          color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit",
        }}
      />
      <span style={{ color: invalidRegex ? "var(--text-danger)" : "var(--text-tertiary)", minWidth: 40, fontSize: 12, textAlign: "center" }}>
        {invalidRegex ? t().find.invalidRegex : (matchCount > 0 ? (Math.max(currentIdx, 0) + 1) + "/" + matchCount : findText ? "0" : "")}
      </span>
      <button onClick={findPrev} title={t().find.previous + " (Shift+Enter)"} style={btnStyle}>
        <svg width="14" height="14" viewBox="0 0 12 12"><polyline points="3,8 1,6 3,4" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
      <button onClick={findNext} title={t().find.next + " (Enter)"} style={btnStyle}>
        <svg width="14" height="14" viewBox="0 0 12 12"><polyline points="9,4 11,6 9,8" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="6" x2="1" y2="6" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
      {/* Matching options */}
      <OptButton label="Aa" active={opts.caseSensitive} title={t().find.caseSensitive} onClick={() => toggleOpt("caseSensitive")} />
      <OptButton label="W" active={opts.wholeWord} title={t().find.wholeWord} onClick={() => toggleOpt("wholeWord")} />
      <OptButton label=".*" active={opts.regex} title={t().find.regex} onClick={() => toggleOpt("regex")} />
      <button onClick={() => setShowReplace(v => !v)} title={t().find.replace + " (Ctrl+R)"}
        style={{ ...btnStyle, background: showReplace ? "var(--bg-sidebar-active)" : "transparent", width: "auto", padding: "0 8px", fontSize: 11 }}>
        {t().find.replace}
      </button>
      {showReplace && (
        <>
          <input value={replaceText} onChange={e => setReplaceText(e.target.value)}
            placeholder={t().find.replaceWith}
            style={{
              width: 140, border: "1px solid var(--border)", borderRadius: 4,
              padding: "3px 8px", background: "var(--bg-editor)",
              color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit",
            }}
          />
          <button onClick={replaceOne} style={{ ...btnStyle, width: "auto", padding: "0 8px", fontSize: 12 }}>{t().find.replaceOne}</button>
          <button onClick={replaceAll} style={{ ...btnStyle, width: "auto", padding: "0 8px", fontSize: 12 }}>{t().find.replaceAll}</button>
        </>
      )}
      <div style={{ flex: 1 }} />
      <button onClick={onClose} title={t().find.previous + " (Esc)"} style={btnStyle}>
        <svg width="14" height="14" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
    </div>
  );
}

/** Quick regex-compile check for the "invalid regex" hint. */
function buildFails(query: string): boolean {
  try { new RegExp(query, "u"); return false; } catch { return true; }
}

function OptButton({ label, active, title, onClick }: { label: string; active: boolean; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        ...btnStyle, width: 30, fontSize: 11, fontWeight: 700, fontFamily: "Consolas, monospace",
        background: active ? "var(--bg-sidebar-active)" : "transparent",
        color: active ? "var(--text-accent)" : "var(--text-secondary)",
      }}>
      {label}
    </button>
  );
}

const btnStyle: React.CSSProperties = {
  width: 28, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
  border: "none", borderRadius: 4, background: "transparent", color: "var(--text-secondary)",
  cursor: "pointer", fontSize: 13, fontFamily: "inherit",
};
