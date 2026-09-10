import { useEffect, useRef } from "react";
import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, indentUnit } from "@codemirror/language";
import { useStore } from "../../store";
import { prepareImageUpload } from "../../lib/imageUpload";
import { znCodeHighlightStyle } from "./codeHighlight";
import { offsetAtLineCol } from "../../lib/textPosition";
import { computeWordCount } from "../../domain";

/**
 * Source mode editor — CodeMirror 6 with Markdown syntax highlighting.
 *
 * Replaces the old plain <textarea>: provides line numbers, markdown token
 * highlighting (same theme-aware palette as WYSIWYG code blocks), real
 * undo/redo and an efficient text model for large documents.
 *
 * Content sync with the store:
 *  - user edits -> updateListener -> store.setContent
 *  - external changes (find/replace runs directly on this view; file switches
 *    recreate the instance) are applied with the "zn.external" user event so
 *    the listener never echoes them back.
 */

interface Props {
  /** Exposes the live EditorView so FindReplaceBar can drive it. */
  viewRef: { current: EditorView | null };
}

export function SourceEditor({ viewRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const currentFilePath = useStore(s => s.currentFilePath);
  const tabSize = useStore(s => s.tabSize);
  const editorPadding = useStore(s => s.editorPadding);

  // Recreate the editor per file (clean undo history per document) and when
  // indent/margin settings change (rare).
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
      // Push user edits into the store (drives autosave).
      if (update.docChanged) {
        const external = update.transactions.some(tr => tr.isUserEvent("zn.external"));
        if (!external) s.setContent(update.state.doc.toString());
      }
      // Cursor position for the status bar (Ln/Col).
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
      // Persist scroll position (throttled by the cheap equality guard in the store).
      const scroller = update.view.scrollDOM;
      if (update.geometryChanged || update.viewportChanged) {
        s.setScrollPosition(scroller.scrollTop);
      }
    });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: content,
        selection: initialSelection,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(tabSize),
          indentUnit.of(" ".repeat(tabSize)),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(znCodeHighlightStyle),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          updateListener,
          // Image paste in source mode: persist via the shared image service
          // and insert a relative markdown image reference.
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
                void prepareImageUpload(file, path).then(rel => {
                  if (rel === null) return;
                  if (useStore.getState().currentFilePath !== path) return;
                  if (viewRef.current !== cmView) return;
                  cmView.dispatch(cmView.state.replaceSelection("\n![image](" + rel + ")\n"));
                }).catch((err: unknown) => { console.warn("source-image-paste-failed", err); });
                return true;
              }
              return false;
            },
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "var(--zn-editor-font-size, 15px)",
              background: "var(--bg-editor)",
              color: "var(--text-primary)",
            },
            ".cm-scroller": {
              fontFamily: '"Cascadia Code","Fira Code",Consolas,"Microsoft YaHei",monospace',
              lineHeight: "1.7",
            },
            ".cm-content": {
              padding: "40px " + editorPadding + "px",
              caretColor: "var(--text-primary)",
              maxWidth: "var(--zn-editor-content-width, 980px)",
              margin: "0 auto",
            },
            ".cm-gutters": {
              background: "var(--bg-editor)", color: "var(--text-tertiary)",
              border: "none", borderRight: "1px solid var(--border-light)",
            },
            ".cm-activeLine": { backgroundColor: "var(--bg-hover)" },
            ".cm-activeLineGutter": { backgroundColor: "transparent" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--bg-sidebar-active) !important" },
            ".cm-cursor": { borderLeftColor: "var(--text-primary)" },
          }),
        ],
      }),
    });

    viewRef.current = view;

    // Restore the saved scroll position once layout has settled.
    if (savedScroll > 0) {
      requestAnimationFrame(() => { view.scrollDOM.scrollTop = savedScroll; });
    }
    view.focus();

    return () => {
      // Write the final scroll into the PER-FILE cache (keyed by the path this
      // instance was created for). Do NOT touch store.scrollPosition: after a
      // file switch it already holds the NEXT file's restored value.
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
  }, [currentFilePath, tabSize, editorPadding]);

  // External content sync: if the store content diverges from the editor
  // (e.g. find/replace-all in another mode, external reload banner), adopt it
  // without focusing or disturbing the caret when the user is typing.
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

  // Explicit external reload must win even when the source editor currently
  // owns focus; normal store sync above intentionally avoids stealing focus.
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

  return <div ref={hostRef} className="zn-source-editor" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }} />;
}
