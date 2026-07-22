import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function FindReplaceBar({ visible, onClose }: Props) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  const matchRef = useRef<{ count: number; current: number }>({ count: 0, current: 0 });

  useEffect(() => {
    if (visible) {
      setTimeout(() => { findRef.current?.focus(); findRef.current?.select(); }, 50);
    } else {
      setFindText(""); setReplaceText(""); setShowReplace(false);
      setMatchCount(0); setCurrentIdx(0);
      clearHighlights();
    }
  }, [visible]);

  const clearHighlights = useCallback(() => {
    document.querySelectorAll(".zn-find-highlight").forEach(el => {
      const p = el.parentNode;
      if (p) { p.replaceChild(document.createTextNode(el.textContent || ""), el); p.normalize(); }
    });
    matchRef.current = { count: 0, current: 0 };
  }, []);

  const doFind = useCallback(() => {
    clearHighlights();
    if (!findText) { setMatchCount(0); setCurrentIdx(0); return; }

    const pm = document.querySelector(".ProseMirror") as HTMLElement;
    if (!pm) return;

    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    const matches: { node: Text; offset: number }[] = [];
    const flen = findText.length;
    const q = findText.toLowerCase();
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const parent = node.parentElement;
      if (parent?.closest("code, pre, .zn-find-highlight")) continue;

      const txt = node.textContent || "";
      const lower = txt.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(q, idx)) !== -1) {
        matches.push({ node, offset: idx });
        idx += q.length;
      }
    }

    if (matches.length === 0) { setMatchCount(0); setCurrentIdx(0); return; }

    matchRef.current = { count: matches.length, current: 0 };
    setMatchCount(matches.length);
    setCurrentIdx(0);

    matches.forEach((m, mi) => {
      const range = document.createRange();
      try {
        range.setStart(m.node, m.offset);
        range.setEnd(m.node, m.offset + flen);
        const span = document.createElement("span");
        span.className = "zn-find-highlight";
        span.style.cssText = "background:#FFD54F;color:#000;border-radius:2px;";
        if (mi === 0) span.style.background = "#FF9800";
        range.surroundContents(span);
      } catch { /* */ }
    });

    scrollToMatch(0);
  }, [findText, clearHighlights]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(doFind, 250);
    return () => clearTimeout(timer);
  }, [findText, visible, doFind]);

  const scrollToMatch = useCallback((idx: number) => {
    const all = document.querySelectorAll(".zn-find-highlight");
    if (all.length === 0) return;
    const safeIdx = ((idx % all.length) + all.length) % all.length;
    const target = all[safeIdx] as HTMLElement;
    if (!target) return;

    all.forEach((el, i) => {
      (el as HTMLElement).style.background = i === safeIdx ? "#FF9800" : "#FFD54F";
    });

    const scrollParent = target.closest("[style*=overflow]") || target.parentElement?.parentElement;
    if (scrollParent) {
      const top = target.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop - 120;
      scrollParent.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }, []);

  const findNext = useCallback(() => {
    const all = document.querySelectorAll(".zn-find-highlight");
    const next = (currentIdx + 1) % Math.max(all.length, 1);
    setCurrentIdx(next);
    scrollToMatch(next);
  }, [currentIdx, scrollToMatch]);

  const findPrev = useCallback(() => {
    const all = document.querySelectorAll(".zn-find-highlight");
    const prev = ((currentIdx - 1) + all.length) % Math.max(all.length, 1);
    setCurrentIdx(prev);
    scrollToMatch(prev);
  }, [currentIdx, scrollToMatch]);

  const replaceOne = useCallback(() => {
    const content = useStore.getState().content;
    if (!findText || !content) return;
    const q = findText.toLowerCase();
    const positions: number[] = [];
    let pos = content.toLowerCase().indexOf(q);
    while (pos !== -1) { positions.push(pos); pos = content.toLowerCase().indexOf(q, pos + 1); }
    if (positions.length === 0) return;
    const targetPos = positions[currentIdx % positions.length];
    const newContent = content.substring(0, targetPos) + replaceText + content.substring(targetPos + findText.length);
    useStore.getState().setContent(newContent);
    setTimeout(() => doFind(), 200);
  }, [currentIdx, findText, replaceText, doFind]);

  const replaceAll = useCallback(() => {
    const content = useStore.getState().content;
    if (!findText || !content) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const newContent = content.replace(regex, replaceText);
    useStore.getState().setContent(newContent);
    clearHighlights();
    setMatchCount(0);
    setCurrentIdx(0);
  }, [findText, replaceText, clearHighlights]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "Escape") { e.preventDefault(); clearHighlights(); onClose(); }
      if (e.key === "Enter" && !e.shiftKey && findText) { e.preventDefault(); findNext(); }
      if (e.key === "Enter" && e.shiftKey && findText) { e.preventDefault(); findPrev(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "r" && findText) {
        e.preventDefault(); setShowReplace(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onClose, findText, findNext, findPrev, clearHighlights]);

  if (!visible) return null;

  return (
    <div style={{
      height: 36, display: "flex", alignItems: "center", gap: 6,
      padding: "0 12px", background: "var(--bg-statusbar)",
      borderBottom: "1px solid var(--border)", flexShrink: 0, fontSize: 13,
    }}>
      <input ref={findRef} value={findText} onChange={e => setFindText(e.target.value)}
        placeholder={t().find.find}
        style={{
          width: 160, border: "1px solid var(--border)", borderRadius: 4,
          padding: "3px 8px", background: "var(--bg-editor)",
          color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit",
        }}
      />
      <span style={{ color: "var(--text-tertiary)", minWidth: 40, fontSize: 12, textAlign: "center" }}>
        {matchCount > 0 ? (currentIdx + 1) + "/" + matchCount : findText ? "0" : ""}
      </span>
      <button onClick={findPrev} title={t().find.previous + " (Shift+Enter)"} style={btnStyle}>
        <svg width="12" height="12" viewBox="0 0 12 12"><polyline points="3,8 1,6 3,4" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
      <button onClick={findNext} title={t().find.next + " (Enter)"} style={btnStyle}>
        <svg width="12" height="12" viewBox="0 0 12 12"><polyline points="9,4 11,6 9,8" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="6" x2="1" y2="6" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
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
      <button onClick={() => { clearHighlights(); onClose(); }} title={t().find.previous + " (Esc)"} style={btnStyle}>
        <svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 28, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
  border: "none", borderRadius: 4, background: "transparent", color: "var(--text-secondary)",
  cursor: "pointer", fontSize: 13, fontFamily: "inherit",
};
