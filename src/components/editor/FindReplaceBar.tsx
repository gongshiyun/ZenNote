import { useState, useRef, useEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { t } from "../../i18n";
import { findAllMatches, wrapIndex, defaultFindOptions, type FindOptions } from "../../lib/findQuery";
import { ArrowDownIcon, ArrowUpIcon, Button, IconButton, Kbd, SearchIcon } from "../ui";

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
    if (matches.length === 0) {
      setCurrentIdx(-1);
      return;
    }
    if (!jumpToLine) {
      setCurrentIdx(0);
      return;
    }
    // The first match at/after the target line must be SELECTED too; the old
    // `targetIndex > 0` guard skipped selection entirely when the match was the
    // first one, so "jump to search result" never moved the viewport.
    const targetIndex = matches.findIndex(m => {
      const view = getCmView();
      return !!view?.state?.doc?.lineAt && view.state.doc.lineAt(m.from).number >= jumpToLine;
    });
    cmGoto(targetIndex >= 0 ? targetIndex : 0);
  }, [findText, opts, getCmView, cmMatches, cmGoto]);

  // Jumping updates the CodeMirror selection but keeps focus in the find field,
  // so Enter/typing continues in the bar rather than moving into the document.
  const findNext = useCallback(() => {
    cmGoto(currentIdx + 1);
    findRef.current?.focus();
  }, [currentIdx, cmGoto]);
  const findPrev = useCallback(() => {
    cmGoto(currentIdx - 1);
    findRef.current?.focus();
  }, [currentIdx, cmGoto]);

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

  // Escape closes the bar from anywhere while it is open. Enter / replace
  // shortcuts are handled on the bar container below, so typing Enter in any
  // other field is never hijacked.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  const handleBarKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === "Enter" && findText) {
      e.preventDefault();
      if (e.shiftKey) findPrev();
      else findNext();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "h") {
      e.preventDefault();
      setShowReplace(true);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "r" && findText) {
      e.preventDefault();
      setShowReplace(v => !v);
    }
  };

  if (!visible) return null;

  const toggleOpt = (key: keyof FindOptions) => {
    setOpts(o => ({ ...o, [key]: !o[key] }));
  };

  const counter = invalidRegex
    ? t().find.invalidRegex
    : matchCount > 0
      ? `${Math.max(currentIdx, 0) + 1}/${matchCount}`
      : findText ? "0" : "";

  return (
    <div className="zn-findbar" role="search" onKeyDown={handleBarKeyDown}>
      <div className="zn-findbar__row">
        <SearchIcon size={15} className="zn-findbar__search-icon" />
        <input
          ref={findRef}
          value={findText}
          placeholder={t().find.find}
          aria-label={t().find.find}
          aria-invalid={invalidRegex || undefined}
          className="zn-input zn-findbar__field"
          data-invalid={invalidRegex || undefined}
          onChange={(e) => setFindText(e.target.value)}
        />
        <span
          className="zn-findbar__count"
          data-invalid={invalidRegex || undefined}
          title={counter}
          aria-live="polite"
        >
          {counter}
        </span>
        <IconButton
          label={`${t().find.previous} (Shift+Enter)`}
          size="sm"
          onClick={findPrev}
        >
          <ArrowUpIcon size={15} />
        </IconButton>
        <IconButton
          label={`${t().find.next} (Enter)`}
          size="sm"
          onClick={findNext}
        >
          <ArrowDownIcon size={15} />
        </IconButton>
        <span className="zn-findbar__sep" aria-hidden="true" />
        <IconButton
          label={t().find.caseSensitive}
          size="sm"
          className="zn-findbar__opt"
          active={opts.caseSensitive}
          onClick={() => toggleOpt("caseSensitive")}
        >
          Aa
        </IconButton>
        <IconButton
          label={t().find.wholeWord}
          size="sm"
          className="zn-findbar__opt"
          active={opts.wholeWord}
          onClick={() => toggleOpt("wholeWord")}
        >
          W
        </IconButton>
        <IconButton
          label={t().find.regex}
          size="sm"
          className="zn-findbar__opt"
          active={opts.regex}
          onClick={() => toggleOpt("regex")}
        >
          .*
        </IconButton>
        <span className="zn-findbar__sep" aria-hidden="true" />
        <Button
          variant="ghost"
          size="sm"
          className="zn-findbar__toggle"
          data-active={showReplace || undefined}
          title={`${t().find.replace} (Ctrl+R)`}
          onClick={() => setShowReplace(v => !v)}
        >
          {t().find.replace}
        </Button>
        <div className="zn-findbar__spacer" />
        <button
          type="button"
          className="zn-findbar__esc"
          title={t().find.close}
          aria-label={t().find.close}
          onClick={onClose}
        >
          <Kbd>Esc</Kbd>
        </button>
      </div>

      {showReplace ? (
        <div className="zn-findbar__row zn-findbar__row--replace">
          <input
            value={replaceText}
            placeholder={t().find.replaceWith}
            aria-label={t().find.replaceWith}
            className="zn-input zn-findbar__field zn-findbar__field--replace"
            onChange={(e) => setReplaceText(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={replaceOne}>
            {t().find.replaceOne}
          </Button>
          <Button variant="ghost" size="sm" onClick={replaceAll}>
            {t().find.replaceAll}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Quick regex-compile check for the "invalid regex" hint. */
function buildFails(query: string): boolean {
  try { new RegExp(query, "u"); return false; } catch { return true; }
}
