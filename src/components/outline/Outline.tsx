import { useEffect, useMemo, useCallback, useRef } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { parseHeadings, displayableHeadings } from "../../domain";

export function Outline() {
  const content = useStore(s => s.content);
  const activeHeadingId = useStore(s => s.activeHeadingId);
  const setHeadings = useStore(s => s.setHeadings);
  const setActiveHeading = useStore(s => s.setActiveHeading);
  const sourceMode = useStore(s => s.sourceMode);
  const setSourceMode = useStore(s => s.setSourceMode);
  const scrollTimer = useRef<number>(0);

  // Parse all headings (h1-h6), then display only h1-h3
  const headings = useMemo(() => parseHeadings(content), [content]);
  const displayHeadings = useMemo(() => displayableHeadings(headings), [headings]);

  useEffect(() => { setHeadings(headings); }, [headings, setHeadings]);

  // Auto-highlight active heading based on scroll position
  useEffect(() => {
    if (sourceMode || displayHeadings.length === 0) return;

    const pm = document.querySelector(".ProseMirror");
    if (!pm) return;
    // Find the REAL scroll container: Crepe wraps .ProseMirror in non-scrolling
    // divs (.milkdown), so parentElement is not scrollable and scroll events
    // never fire on it. Walk up to the first scrollable ancestor.
    let scrollEl: HTMLElement | null = pm as HTMLElement;
    while (scrollEl && scrollEl !== document.body &&
      !(scrollEl.scrollHeight > scrollEl.clientHeight && /(auto|scroll)/.test(getComputedStyle(scrollEl).overflowY))) {
      scrollEl = scrollEl.parentElement;
    }
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

    // Scroll to the heading inside the rendered (preview) editor.
    const scrollToHeading = (idx: number): boolean => {
      const pm = document.querySelector(".ProseMirror");
      if (!pm) return false;
      const headingEls = pm.querySelectorAll("h1, h2, h3");
      const target = headingEls[idx] as HTMLElement | undefined;
      if (!target) return false;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    };

    // Clicking the outline always navigates in the rendered view — never the
    // markdown source. If we are in source mode, switch back to preview first,
    // then scroll once the editor has re-rendered.
    if (sourceMode) {
      setSourceMode(false);
      let tries = 0;
      const timer = window.setInterval(() => {
        tries++;
        if (scrollToHeading(displayIdx) || tries > 40) window.clearInterval(timer);
      }, 100);
      return;
    }

    scrollToHeading(displayIdx);
  }, [setActiveHeading, displayHeadings, sourceMode, setSourceMode]);

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
