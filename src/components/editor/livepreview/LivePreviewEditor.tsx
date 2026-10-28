/**
 * Live Preview editor — the CodeMirror surface whose document is the raw
 * markdown. Syntax marks are hidden until the caret enters the range that owns
 * them, at which point they become real, editable text. This is the
 * Typora / Obsidian model, and it is what makes "put the cursor between the two
 * # of a heading" possible.
 *
 * Content sync mirrors SourceEditor so the rest of the app (autosave, status
 * bar, find & replace, draft recovery) needs no changes:
 *   - user edits        -> updateListener -> store.setContent
 *   - external changes  -> dispatched with the "zn.external" user event so the
 *                          listener never echoes them back
 */
import { useEffect, useRef } from "react";
import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, indentUnit } from "@codemirror/language";
import { GFM } from "@lezer/markdown";
import { useStore } from "../../../store";
import { offsetAtLineCol } from "../../../lib/textPosition";
import { computeWordCount } from "../../../domain";
import { znCodeHighlightStyle } from "../codeHighlight";
import { livePreviewExtensions, livePreviewRefresh, scheduleDocumentPreload } from "./livePreview";
import { Highlight } from "./markdownExtensions";
import { bubbleToolbar, markdownAutomation, markKeymap } from "./livePreviewInteractions";
import { renderedBlockActions } from "./renderedBlockActions";
import { slashKeymap, slashMenu } from "./slashMenu";
import { livePreviewTheme, installLivePreviewChrome } from "./livePreviewTheme";
import { ConflictBanner } from "../ConflictBanner";
import { prepareImageUpload } from "../../../lib/imageUpload";
import { t } from "../../../i18n";
import { AppMark } from "../../ui/icons";

interface Props {
  /** Exposes the live EditorView so the shared find bar / status bar can drive it. */
  viewRef: { current: EditorView | null };
}

export function LivePreviewEditor({ viewRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const currentFilePath = useStore(s => s.currentFilePath);
  const tabSize = useStore(s => s.tabSize);
  const editorPadding = useStore(s => s.editorPadding);
  const resolvedMode = useStore(s => s.resolvedMode);
  const locale = useStore(s => s.locale);
  const headingJumpRequest = useStore(s => s.headingJumpRequest);
  /** Debounce handle for the outline's active-row tracking while scrolling. */
  const headingScrollTimer = useRef(0);
  // Widget labels (the `[TOC]` heading in particular) are baked when the
  // decorations are built. Remember the locale this editor's widgets were built
  // with, so a runtime language switch can rebuild them below.
  const builtLocale = useRef(locale);

  // Mermaid bakes the colour scheme into the SVG it produces, and rendered
  // diagrams are cached per mode, so a scheme change has to re-render all of
  // them. Nothing else in the editor depends on the mode — the markup is styled
  // by CSS — so without this the previous mode's diagrams stay on screen:
  // switching dark to light left dark boxes sitting on a light page.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Re-running the prepare pass renders the diagrams for the new mode and
    // rebuilds the decorations; the old mode's SVGs stay cached for switching
    // back.
    scheduleDocumentPreload(view, 0);
  }, [resolvedMode, viewRef]);

  // The scroller margin is driven by the same setting as the old editor, so the
  // "page side margins" slider keeps working.
  useEffect(() => {
    document.documentElement.style.setProperty("--zn-lp-margin", `${editorPadding}px`);
  }, [editorPadding]);

  // The bubble toolbar is mounted on document.body, so it needs its own sheet.
  useEffect(() => {
    installLivePreviewChrome();
  }, []);

  // Runtime language switch: widget DOM is only rebuilt when the decorations
  // are, so a locale change has to force one rebuild — otherwise the `[TOC]`
  // label (and any other `t()` text baked into a widget) stays in the old
  // language until the file is reopened. The refresh effect is the same one the
  // async renderers use; the document is untouched.
  useEffect(() => {
    if (builtLocale.current === locale) return;
    builtLocale.current = locale;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: livePreviewRefresh.of(null) });
    scheduleDocumentPreload(view, 0);
  }, [locale, viewRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !currentFilePath) return;

    const content = useStore.getState().content || "";
    const savedScroll = useStore.getState().scrollPosition;
    const storedSelection = useStore.getState().cmSelection;
    const cursorLine = useStore.getState().cursorLine;
    const cursorCol = useStore.getState().cursorCol;
    const initialSelection = storedSelection?.content === content
      ? EditorSelection.range(
        Math.min(storedSelection.anchor, content.length),
        Math.min(storedSelection.head, content.length),
      )
      : EditorSelection.cursor(offsetAtLineCol(content, cursorLine, cursorCol));

    const updateListener = EditorView.updateListener.of(update => {
      const s = useStore.getState();
      if (update.docChanged) {
        const external = update.transactions.some(tr => tr.isUserEvent("zn.external"));
        if (!external) s.setContent(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        s.setCursorPosition(line.number, head - line.from + 1);
        s.setCmSelection({
          anchor: update.state.selection.main.anchor,
          head,
          content: update.state.doc.toString(),
        });
        const from = Math.min(update.state.selection.main.anchor, head);
        const to = Math.max(update.state.selection.main.anchor, head);
        const selected = update.state.doc.sliceString(from, to);
        s.setSelectionStats(selected.length, computeWordCount(selected).totalWords);
      }
      if (update.geometryChanged || update.viewportChanged) {
        s.setScrollPosition(update.view.scrollDOM.scrollTop);
      }
    });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: content,
        selection: initialSelection,
        extensions: [
          // No line numbers, no active-line band: this is a document, not code.
          drawSelection(),
          history(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(tabSize),
          indentUnit.of(" ".repeat(tabSize)),
          markdown({
            base: markdownLanguage,
            codeLanguages: languages,
            // GFM gives tables, task lists, autolinks and strikethrough.
            // Highlight (`==x==`) is not in the grammar and is supplied here so
            // Live Preview matches what the Crepe editor renders.
            extensions: [GFM, Highlight],
          }),
          syntaxHighlighting(znCodeHighlightStyle),
          livePreviewExtensions,
          livePreviewTheme,
          // Phase 4 interactions. markKeymap comes before defaultKeymap so
          // Mod-b / Mod-i / Mod-k are ours, not CodeMirror's defaults.
          markKeymap,
          bubbleToolbar,
          slashKeymap,
          slashMenu,
          renderedBlockActions,
          // List continuation / heading shortcuts / pair input. Runs after the
          // explicit keymaps so it only sees keys they did not claim.
          markdownAutomation,
          // Paste: an image is uploaded to the note's assets folder and inserted
          // as a relative reference; a URL pasted over a selection becomes a
          // link. Both mirror what the Crepe editor and source mode already do —
          // without them, pasting simply did nothing.
          EditorView.domEventHandlers({
            paste: (event: ClipboardEvent, cmView: EditorView) => {
              const items = event.clipboardData?.items;
              if (!items) return false;
              for (const item of items) {
                if (!item.type.startsWith("image/")) continue;
                const file = item.getAsFile();
                if (!file) continue;
                event.preventDefault();
                const path = useStore.getState().currentFilePath;
                void prepareImageUpload(file, path)
                  .then(rel => {
                    if (rel === null) return;
                    if (useStore.getState().currentFilePath !== path) return;
                    if (viewRef.current !== cmView) return;
                    cmView.dispatch(cmView.state.replaceSelection(`![image](${rel})`));
                  })
                  .catch((err: unknown) => {
                    console.warn("live-preview-image-paste-failed", err);
                  });
                return true;
              }

              // Plain text that is a single URL, pasted over a selection.
              const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
              const sel = cmView.state.selection.main;
              if (!sel.empty && /^https?:\/\/\S+$/i.test(text)) {
                event.preventDefault();
                cmView.dispatch({
                  changes: {
                    from: sel.from,
                    to: sel.to,
                    insert: `[${cmView.state.sliceDoc(sel.from, sel.to)}](${text})`,
                  },
                  // Caret after the inserted link.
                  selection: EditorSelection.cursor(sel.from + text.length + (cmView.state.sliceDoc(sel.from, sel.to).length) + 4),
                  scrollIntoView: true,
                });
                return true;
              }
              return false;
            },
          }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          updateListener,
        ],
      }),
    });

    viewRef.current = view;
    if (savedScroll > 0) {
      requestAnimationFrame(() => { view.scrollDOM.scrollTop = savedScroll; });
    }
    view.focus();

    // Outline sync: CodeMirror only renders the viewport, so the previous
    // DOM-index implementation marked the wrong row on long notes. Map the top
    // visible document position to the last h1-h3 whose source line is above it.
    const scrollEl = view.scrollDOM;
    const syncActiveHeading = () => {
      const headings = useStore.getState().headings.filter(h => h.level <= 3);
      if (headings.length === 0) return;
      const rect = scrollEl.getBoundingClientRect();
      const coords = view.posAtCoords({ x: rect.left + 16, y: rect.top + 16 });
      const topPos = coords ?? view.viewport.from;
      const topLine = view.state.doc.lineAt(
        Math.max(0, Math.min(topPos, view.state.doc.length)),
      ).number;
      let active = -1;
      headings.forEach((heading, index) => {
        if (heading.pos + 1 <= topLine) active = index;
      });
      useStore.getState().setActiveHeading(active >= 0 ? String(active) : null);
    };
    const onScroll = () => {
      if (headingScrollTimer.current) window.clearTimeout(headingScrollTimer.current);
      headingScrollTimer.current = window.setTimeout(syncActiveHeading, 80);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(syncActiveHeading);

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (headingScrollTimer.current) window.clearTimeout(headingScrollTimer.current);
      const s = useStore.getState();
      const prev = s.fileStates.get(currentFilePath);
      if (prev) {
        const states = new Map(s.fileStates);
        states.set(currentFilePath, { ...prev, scrollPos: view.scrollDOM.scrollTop });
        useStore.setState({ fileStates: states });
      }
      viewRef.current = null;
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilePath, tabSize]);

  // External content sync (search & replace, external reload) — never while the
  // user owns focus, so typing is never disturbed.
  const content = useStore(s => s.content);
  const reloadTick = useStore(s => s.reloadTick);
  const initialReloadTick = useRef(reloadTick);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (content === current) return;
    if (view.hasFocus) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      annotations: Transaction.userEvent.of("zn.external"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // Outline jump: the panel cannot map a heading to a CodeMirror position, so it
  // leaves a one-shot request here. Requests are short-lived: a stale one from a
  // previous document must not yank the caret after a tab switch.
  useEffect(() => {
    const request = headingJumpRequest;
    const view = viewRef.current;
    if (!request || !view) return;
    if (Date.now() - request.ts > 3000) return;
    const lineNumber = Math.max(1, Math.min(view.state.doc.lines, request.pos + 1));
    const line = view.state.doc.line(lineNumber);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 24 }),
    });
    view.focus();
  }, [headingJumpRequest, viewRef]);

  useEffect(() => {
    if (reloadTick === initialReloadTick.current) return;
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (content === current) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      annotations: Transaction.userEvent.of("zn.external"),
    });
  }, [reloadTick, content, viewRef]);

  // Find & replace lives one level up, in AppShell: a single bar drives whichever
  // CodeMirror surface is mounted (live preview or source mode), and the global
  // search panel can hand it a query + target line. Keeping a second instance
  // here stacked two bars on Ctrl+F.

  // A workspace can be open with no note selected — and a brand-new note can be
  // empty. Both used to leave a featureless page, so say what to do next. The
  // prompt is presentation only (`pointer-events:none`) and vanishes as soon as
  // the document has content, so it never blocks the caret.
  const showEmptyState = !currentFilePath || content.trim() === "";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <ConflictBanner />
      <div
        className="zn-editor-surface"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        {showEmptyState && (
          <div className="zn-editor-empty" role="note">
            <AppMark size={24} />
            <p className="zn-editor-empty__title">{t().editor.openNote}</p>
            <p className="zn-editor-empty__hint">
              <kbd className="zn-kbd">Ctrl</kbd>
              <span className="zn-editor-empty__plus" aria-hidden="true">+</span>
              <kbd className="zn-kbd">P</kbd>
            </p>
          </div>
        )}
        <div
          ref={hostRef}
          className="zn-live-preview"
          style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}
        />
      </div>
    </div>
  );
}
