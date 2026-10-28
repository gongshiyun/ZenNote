import { useEffect, useMemo, type CSSProperties } from "react";
import { useStore } from "../../store";
import { t } from "../../i18n";
import { parseHeadings, displayableHeadings } from "../../domain";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

/**
 * Document outline panel.
 *
 * Navigation is by DOCUMENT POSITION, not by DOM node: Live Preview renders with
 * CodeMirror, which virtualises the document to roughly one viewport, so
 * `querySelectorAll(".cm-zn-h2")[idx]` used to target the wrong heading (or
 * nothing) in any note taller than a screen. The panel now asks the editor to
 * jump to `heading.pos` (a source line index) through `requestHeadingJump`;
 * the editor owns the position mapping and also drives the active row while the
 * user scrolls.
 */
export function Outline() {
  const content = useStore(s => s.content);
  const activeHeadingId = useStore(s => s.activeHeadingId);
  const setHeadings = useStore(s => s.setHeadings);
  const setActiveHeading = useStore(s => s.setActiveHeading);
  const requestHeadingJump = useStore(s => s.requestHeadingJump);
  const sourceMode = useStore(s => s.sourceMode);
  const setSourceMode = useStore(s => s.setSourceMode);

  // 大纲解析是全文扫描（split + 逐行正则），不能压在每次按键的热路径上；
  // 防抖 400ms 后重新解析（初始值立即返回，打开面板首屏不延迟）。
  const debouncedContent = useDebouncedValue(content, 400);

  // Parse all headings (h1-h6), then display only h1-h3
  const headings = useMemo(() => parseHeadings(debouncedContent), [debouncedContent]);
  const displayHeadings = useMemo(() => displayableHeadings(headings), [headings]);

  useEffect(() => { setHeadings(headings); }, [headings, setHeadings]);

  const handleClick = (displayIdx: number) => {
    const heading = displayHeadings[displayIdx];
    if (!heading) return;
    setActiveHeading(String(displayIdx));
    requestHeadingJump(heading.pos);
    // Clicking the outline always navigates the rendered view. Switching back
    // from source mode re-mounts the live editor, which then consumes the
    // pending jump request.
    if (sourceMode) setSourceMode(false);
  };

  return (
    <aside className="zn-outline" aria-label={t().outline.title}>
      <div className="zn-outline__head">
        <span className="zn-label">{t().outline.title}</span>
      </div>
      <div className="zn-outline__body">
        {displayHeadings.length === 0 ? (
          <div className="zn-empty zn-outline__empty">{t().outline.noHeadings}</div>
        ) : (
          displayHeadings.map((h, idx) => {
            const isActive = activeHeadingId === String(idx);
            return (
              <div
                key={idx}
                className="zn-outline-row"
                data-active={isActive || undefined}
                data-level={h.level}
                style={{ "--zn-level": h.level - 1 } as CSSProperties}
                onClick={() => handleClick(idx)}
                title={h.text}
              >
                <span className="zn-outline-row__label">{h.text}</span>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
