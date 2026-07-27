import { useEffect, useMemo, useCallback, useRef } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";

interface Heading {
  level: number;
  text: string;
  pos: number;
}

export function Outline() {
  const content = useStore(s => s.content);
  const activeHeadingId = useStore(s => s.activeHeadingId);
  const setHeadings = useStore(s => s.setHeadings);
  const setActiveHeading = useStore(s => s.setActiveHeading);
  const sourceMode = useStore(s => s.sourceMode);
  const scrollTimer = useRef<number>(0);

  // Parse all headings (h1-h6), then display only h1-h3
  const headings: Heading[] = useMemo(() => {
    const lines = content.split(/\r?\n/);
    const result: Heading[] = [];
    lines.forEach((line, idx) => {
      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) {
        result.push({ level: match[1].length, text: match[2].trim(), pos: idx });
      }
    });
    return result;
  }, [content]);

  // Display headings filtered to h1-h3, with their original index
  const displayHeadings = useMemo(() => {
    return headings
      .map((h, originalIdx) => ({ ...h, originalIdx }))
      .filter(h => h.level <= 3);
  }, [headings]);

  useEffect(() => { setHeadings(headings); }, [headings, setHeadings]);

  // Auto-highlight active heading based on scroll position
  useEffect(() => {
    if (sourceMode || displayHeadings.length === 0) return;

    const pm = document.querySelector(".ProseMirror");
    if (!pm) return;
    const scrollEl = pm.parentElement;
    if (!scrollEl) return;

    const handleScroll = () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = window.setTimeout(() => {
        // Filter heading elements to only h1-h3 in the DOM
        const headingEls = Array.from(pm.querySelectorAll("h1, h2, h3"));
        let activeIdx = -1;
        const scrollTop = scrollEl.scrollTop + 100;

        headingEls.forEach((el, i) => {
          const rect = el.getBoundingClientRect();
          const containerRect = scrollEl.getBoundingClientRect();
          const elTop = rect.top - containerRect.top + scrollEl.scrollTop;
          if (elTop <= scrollTop) activeIdx = i;
        });

        setActiveHeading(activeIdx >= 0 ? String(activeIdx) : null);
      }, 100);
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      scrollEl.removeEventListener("scroll", handleScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [displayHeadings, sourceMode, setActiveHeading]);

  const handleClick = useCallback((displayIdx: number) => {
    setActiveHeading(String(displayIdx));
    const heading = displayHeadings[displayIdx];
    if (!heading) return;

    // Source mode: scroll the textarea to the heading's line
    if (sourceMode) {
      const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
      if (!ta) return;
      const lines = ta.value.split("\n");
      let charPos = 0;
      for (let i = 0; i < heading.pos && i < lines.length; i++) charPos += lines[i].length + 1;
      ta.focus();
      ta.setSelectionRange(charPos, charPos);
      return;
    }

    const pm = document.querySelector(".ProseMirror");
    if (!pm) return;

    const headingEls = pm.querySelectorAll("h1, h2, h3");
    const target = headingEls[displayIdx] as HTMLElement | undefined;
    if (!target) return;

    // Use native scrollIntoView — works regardless of scroll container nesting
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setActiveHeading, displayHeadings, sourceMode]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 32, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", flexShrink: 0 }}>
        Outline
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0" }}>
        {displayHeadings.length === 0 ? (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>{t().outline.noHeadings}</div>
        ) : (
          displayHeadings.map((h, idx) => {
            const isActive = activeHeadingId === String(idx);
            const pl = 12 + (h.level - 1) * 14;
            return (
              <div key={idx} onClick={() => handleClick(idx)}
                style={{
                  height: 26, display: "flex", alignItems: "center",
                  paddingLeft: pl, paddingRight: 12,
                  cursor: "pointer",
                  background: isActive ? "var(--bg-sidebar-active)" : "transparent",
                  fontSize: 12, fontWeight: h.level <= 2 ? 600 : 400,
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  transition: "background-color 100ms ease, color 100ms ease",
                  userSelect: "none",
                  borderLeft: isActive ? "2px solid var(--text-accent)" : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-sidebar-hover)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                title={h.text}>
                {h.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
