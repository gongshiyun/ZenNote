/**
 * Visual theme for the Live Preview editor.
 *
 * Claude Code desktop language: warm paper page, serif display headings, quiet
 * 1px hairlines, one clay accent. Everything resolves through the app's CSS
 * custom properties (`src/styles/tokens.css`), so light/dark and the user's font
 * stack drive this editor exactly as they drive the rest of the chrome 鈥?no
 * hardcoded colours here.
 *
 * Two rules shape the editor's geometry and are easy to break by accident:
 *
 *   1. Vertical rhythm comes from PADDING, never margin. CodeMirror measures a
 *      block widget's height with getBoundingClientRect(), which excludes
 *      margins, so a vertical margin makes the recorded height smaller than the
 *      space actually consumed 鈥?every line below then hit-tests one line off.
 *      The block-widget roots therefore carry `margin: 0` (pinned by
 *      `src/__tests__/livePreviewTheme.test.ts`).
 *   2. A fenced code block is drawn from its three line classes
 *      (`-open/-body/-close`): fence lines are siblings among ALL lines, so CSS
 *      cannot tell which line is a block's first or last. Each edge is drawn
 *      exactly once, which is what keeps the card free of double borders.
 */
import { EditorView } from "@codemirror/view";

/** Body face. The product default; `--zn-font-stack` overrides it per user. */
export const LIVE_PREVIEW_FONT =
  '"Anthropic Sans", "AnthropicSans", "Styrene", "Inter", -apple-system, ' +
  'BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", ' +
  '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';

export const LIVE_PREVIEW_SERIF = "var(--zn-font-serif)";

export const LIVE_PREVIEW_MONO = "var(--zn-font-mono)";

/** Bubble toolbar + slash menu chrome. Plain CSS because the bubble lives in
 *  document.body, outside the editor's theme scope. */
export const livePreviewChromeStyles = `
/* ---- bubble toolbar (selection formatting) ---- */
.cm-zn-bubble {
  position: fixed;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--zn-canvas-raised);
  border: 1px solid var(--zn-border);
  border-radius: var(--zn-radius-lg);
  box-shadow: var(--zn-shadow-popover);
}
.cm-zn-bubble-btn {
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: var(--zn-radius-sm);
  background: transparent;
  color: var(--zn-text-secondary);
  font-family: var(--zn-font-ui);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--zn-dur) var(--zn-ease), color var(--zn-dur) var(--zn-ease);
}
.cm-zn-bubble-btn:hover {
  background: var(--zn-hover);
  color: var(--zn-text);
}
.cm-zn-bubble-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--zn-border-soft);
}

/* ---- slash menu ---- */
.cm-zn-slash {
  position: fixed;
  z-index: 1300;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
  padding: 5px;
  background: var(--zn-canvas-raised);
  border: 1px solid var(--zn-border);
  border-radius: var(--zn-radius-lg);
  box-shadow: var(--zn-shadow-popover);
  font-family: var(--zn-font-ui);
}
.cm-zn-slash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: var(--zn-radius-sm);
  font-size: 12.5px;
  color: var(--zn-text);
  cursor: pointer;
  white-space: nowrap;
}
.cm-zn-slash-item:hover {
  background: var(--zn-hover);
}
.cm-zn-slash-item.is-selected {
  background: var(--zn-accent-soft);
  color: var(--zn-text);
}
.cm-zn-slash-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.cm-zn-slash-detail {
  font-family: var(--zn-font-mono);
  font-size: 10.5px;
  color: var(--zn-text-tertiary);
}
.cm-zn-slash-item.is-selected .cm-zn-slash-detail {
  color: var(--zn-accent);
}

/* The zoom affordance is positioned relative to the rendered block it belongs
   to, so both hosts need a positioning context. */
.cm-zn-mermaid,
.cm-zn-image {
  position: relative;
}
.cm-zn-image .zn-mermaid-zoom-btn {
  opacity: 0;
  transition: opacity var(--zn-dur) var(--zn-ease);
}
.cm-zn-image:hover .zn-mermaid-zoom-btn,
.cm-zn-mermaid:hover .zn-mermaid-zoom-btn {
  opacity: 0.85;
}
.cm-zn-image .zn-mermaid-zoom-btn:hover,
.cm-zn-mermaid .zn-mermaid-zoom-btn:hover {
  opacity: 1;
}

/* ---- image alignment bar + table context menu ----
   Mounted on document.body, so the positioning is viewport-fixed and the
   styling has to live here. Both are the same warm \`.zn-menu\`-style surface as
   the app's other popovers (surface, hairline, 10px radius, soft shadow). */
.zn-lp-image-bar,
.zn-lp-table-menu {
  position: fixed;
  z-index: 1250;
  display: flex;
  gap: 2px;
  padding: 5px;
  background: var(--zn-canvas-raised);
  border: 1px solid var(--zn-border);
  border-radius: var(--zn-radius-lg);
  box-shadow: var(--zn-shadow-popover);
  animation: zn-pop-in var(--zn-dur) var(--zn-ease);
}
.zn-lp-table-menu {
  flex-direction: column;
  min-width: 230px;
  gap: 0;
}
.zn-lp-image-bar button {
  width: 28px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--zn-radius-sm);
  background: transparent;
  color: var(--zn-text-secondary);
  cursor: pointer;
  transition: background-color var(--zn-dur) var(--zn-ease), color var(--zn-dur) var(--zn-ease);
}
.zn-lp-image-bar button:hover {
  background: var(--zn-hover);
  color: var(--zn-text);
}
.zn-lp-image-bar button.is-active {
  background: var(--zn-accent-soft);
  color: var(--zn-accent);
}
.zn-lp-table-menu button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: var(--zn-radius-sm);
  background: transparent;
  color: var(--zn-text);
  font-family: var(--zn-font-ui);
  font-size: 12.5px;
  line-height: 1.2;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--zn-dur) var(--zn-ease), color var(--zn-dur) var(--zn-ease);
}
.zn-lp-table-menu button:hover {
  background: var(--zn-hover);
}
.zn-lp-table-menu button.is-active {
  color: var(--zn-accent);
  font-weight: 600;
}
.zn-lp-table-menu button:disabled {
  opacity: 0.45;
  cursor: default;
}
.zn-lp-table-menu button:disabled:hover {
  background: transparent;
}
.zn-lp-table-menu button.is-danger {
  color: var(--zn-danger);
}
.zn-lp-table-menu button.is-danger:hover {
  background: var(--zn-danger-soft);
}
.zn-lp-menu-divider,
.zn-lp-bar-sep {
  background: var(--zn-border-soft);
}
.zn-lp-menu-divider {
  height: 1px;
  margin: 5px 6px;
}
.zn-lp-bar-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  align-self: center;
}

/* ---- footnote reference chip ---- */
.cm-zn-footnote-ref {
  display: inline-block;
  min-width: 1.3em;
  padding: 0 4px;
  margin: 0 1px;
  text-align: center;
  font-size: 0.72em;
  line-height: 1.6;
  border-radius: var(--zn-radius-xs);
  color: var(--zn-accent);
  background: var(--zn-accent-soft);
  cursor: pointer;
  vertical-align: super;
}
.cm-zn-footnote-ref:hover {
  background: color-mix(in srgb, var(--zn-accent) 20%, transparent);
}
/* The definition body, once its [^id]: marker is hidden. */
.cm-zn-footnote-def {
  font-size: 0.9em;
  color: var(--zn-editor-muted);
  padding-left: 0.2em;
  border-left: 2px solid var(--zn-editor-rule);
}
/* Brief highlight on a jump target. */
.cm-zn-footnote-flash {
  animation: cm-zn-footnote-pulse 1.2s var(--zn-ease);
  border-radius: var(--zn-radius-xs);
}
@keyframes cm-zn-footnote-pulse {
  0%, 60% { background: color-mix(in srgb, var(--zn-accent) 22%, transparent); }
  100% { background: transparent; }
}

/* ---- fenced code block header (language picker + copy) ----
   The widget markup still carries the original \`cm-zn-code-tools\` /
   \`cm-zn-code-copy\` names; the chrome below supports both spellings so the
   header layout does not depend on a class rename. */
.zn-lp-code-tools,
.cm-zn-code-tools {
  /* Inline-level on purpose: as a block-level flex box it starts a new block
     box inside the header line, and the line's own strut adds a phantom line
     above the tools. inline-flex keeps the header exactly as tall as its row. */
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 24px;
  vertical-align: middle;
  user-select: none;
}
.zn-lp-code-lang {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--zn-font-mono);
  font-size: 10.5px;
  /* Slightly tracked, so it reads as a label rather than a sentence. */
  letter-spacing: 0.02em;
  color: var(--zn-text-tertiary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--zn-radius-xs);
  padding: 2px 5px;
  /* Optical: the label lines up with the code's left edge, not the pill's. */
  margin-left: -5px;
  cursor: pointer;
  transition: background-color var(--zn-dur) var(--zn-ease), color var(--zn-dur) var(--zn-ease);
}
.zn-lp-code-lang:hover,
.zn-lp-code-lang.is-open {
  color: var(--zn-text-secondary);
  background: var(--zn-hover);
}
.zn-lp-code-lang.is-open {
  color: var(--zn-accent);
  background: var(--zn-accent-soft);
}
.zn-lp-code-lang-name {
  line-height: 1;
}
.zn-lp-code-chevron {
  display: inline-flex;
  width: 12px;
  height: 12px;
  opacity: 0.75;
  transition: transform var(--zn-dur) var(--zn-ease);
}
.zn-lp-code-chevron svg { width: 12px; height: 12px; }
.zn-lp-code-lang.is-open .zn-lp-code-chevron { transform: rotate(180deg); }
.zn-lp-code-copy,
.cm-zn-code-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: var(--zn-radius-sm);
  background: transparent;
  color: var(--zn-text-tertiary);
  padding: 0;
  /* Optical: match the -5px on the language pill, on the other side. */
  margin-right: -5px;
  cursor: pointer;
  transition: background-color var(--zn-dur) var(--zn-ease), color var(--zn-dur) var(--zn-ease);
}
.zn-lp-code-copy svg,
.cm-zn-code-copy svg { width: 15px; height: 15px; }
.zn-lp-code-copy:hover,
.cm-zn-code-copy:hover {
  color: var(--zn-text);
  background: var(--zn-hover);
}
/* The confirmation is the mark changing colour, not the button resizing. */
.zn-lp-code-copy.is-copied,
.cm-zn-code-copy.is-copied {
  color: var(--zn-accent);
  background: var(--zn-accent-soft);
}

/* The language menu. Built from the same \`.zn-menu\` surface and row rhythm as
   the table context menu rather than a native <select>, whose popup the
   platform draws itself and which therefore ignores the app's theme. */
.zn-lp-code-menu {
  position: fixed;
  z-index: 1250;
  display: flex;
  flex-direction: column;
  padding: 5px;
  min-width: 168px;
  max-height: 288px;
  overflow-y: auto;
  background: var(--zn-canvas-raised);
  border: 1px solid var(--zn-border);
  border-radius: var(--zn-radius-lg);
  box-shadow: var(--zn-shadow-popover);
  animation: zn-pop-in var(--zn-dur) var(--zn-ease);
}
.zn-lp-code-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: var(--zn-radius-sm);
  background: transparent;
  color: var(--zn-text-secondary);
  font-family: var(--zn-font-mono);
  font-size: 11.5px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.zn-lp-code-menu-item:hover,
.zn-lp-code-menu-item:focus-visible {
  background: var(--zn-hover);
  color: var(--zn-text);
  outline: none;
}
.zn-lp-code-menu-item.is-selected { color: var(--zn-text); }
/* A fixed gutter keeps every label on one left edge, selected row or not, so
   the tick never shifts the text sideways. */
.zn-lp-code-menu-tick {
  display: inline-flex;
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--zn-accent);
}
.zn-lp-code-menu-tick svg { width: 12px; height: 12px; }
.zn-lp-code-menu-item:not(.is-selected) .zn-lp-code-menu-tick { visibility: hidden; }
`;

/** Inject the chrome stylesheet once per document. */
export function installLivePreviewChrome(): void {
  if (document.getElementById("zn-lp-chrome")) return;
  const el = document.createElement("style");
  el.id = "zn-lp-chrome";
  el.textContent = livePreviewChromeStyles;
  document.head.appendChild(el);
}

const themeSpec = {
  "&": {
    height: "100%",
    background: "var(--zn-canvas)",
    color: "var(--zn-editor-text)",
    fontFamily: `var(--zn-font-stack, ${LIVE_PREVIEW_FONT})`,
    fontSize: "var(--zn-editor-font-size, 16px)",
  },

  // The reading column: centred at the shared content width, with the same
  // side margin setting as the source mode so toggling does not reflow.
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "var(--zn-lh-prose, 1.75)",
    padding: "40px var(--zn-lp-margin, 80px) 0",
  },
  ".cm-content": {
    maxWidth: "var(--zn-editor-content-width, 860px)",
    margin: "0 auto",
    caretColor: "var(--zn-accent)",
    // Deep bottom air, so the last paragraph can be scrolled up to the middle.
    padding: "0 0 30vh",
  },
  ".cm-line": { padding: "0" },

  // Selection uses the theme's warm selection colour, not CodeMirror's default.
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--zn-selection)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--zn-accent)", borderLeftWidth: "2px" },

  // The active line gets no band: this is a document, not code, and a
  // full-width band fights the "the page is the document" illusion.
  ".cm-activeLine": { backgroundColor: "transparent" },

  /* ---- revealed syntax marks (the line the caret is on) ---- */
  ".cm-zn-mark": { color: "var(--text-markdown-mark)" },
  // While a range is selected the marks must clear contrast against the
  // selection background, which the dim token does not (~2:1).
  ".cm-zn-mark-on": { color: "var(--zn-text)" },

  /* ---- inline marks ---- */
  ".cm-zn-inline-strong": { fontWeight: "650", color: "var(--zn-editor-heading)" },
  ".cm-zn-inline-em": { fontStyle: "italic" },
  ".cm-zn-inline-strike": { textDecoration: "line-through", color: "var(--zn-editor-muted)" },
  ".cm-zn-inline-mark": {
    // Translucent so the selection layer behind stays visible: an opaque inline
    // background completely hides the selection, making it impossible to tell
    // what is selected.
    backgroundColor: "color-mix(in srgb, var(--zn-accent) 24%, transparent)",
    borderRadius: "3px",
    padding: "0 2px",
  },
  // The chip: a quiet monospace inlay, never a filled button.
  ".cm-zn-inline-code": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.88em",
    color: "var(--zn-code-inline-fg)",
    backgroundColor: "var(--zn-code-inline-bg)",
    border: "1px solid color-mix(in srgb, var(--zn-code-inline-fg) 14%, transparent)",
    borderRadius: "var(--zn-radius-xs)",
    padding: "1px 5px",
  },
  // Clay link with a soft underline that firms up on hover.
  ".cm-zn-inline-link": {
    color: "var(--zn-editor-link)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--zn-editor-link) 40%, transparent)",
    textDecorationThickness: "1px",
    textUnderlineOffset: "2px",
    transition: "text-decoration-color var(--zn-dur) var(--zn-ease)",
  },
  ".cm-zn-inline-link:hover": {
    textDecorationColor: "var(--zn-editor-link)",
  },
  // Selected variants: restore full contrast so nothing dims into the selection.
  ".cm-zn-inline-link-on": { color: "var(--zn-text)" },
  ".cm-zn-inline-code-on": { color: "var(--zn-text)" },
  ".cm-zn-inline-strike-on": { color: "var(--zn-editor-text)" },

  /* ---- task list ---- */
  ".cm-zn-task": { marginRight: "0.45em" },
  // A clay checkbox: the one accent an author uses constantly gets the brand
  // colour, and it stays legible in both schemes via --zn-on-accent.
  ".cm-zn-task-box": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1em",
    height: "1em",
    border: "1.5px solid var(--zn-accent)",
    borderRadius: "4px",
    background: "transparent",
    fontSize: "0.68em",
    lineHeight: "1",
    verticalAlign: "-0.1em",
    color: "var(--zn-on-accent)",
    transition: "background-color var(--zn-dur) var(--zn-ease), border-color var(--zn-dur) var(--zn-ease)",
    cursor: "pointer",
  },
  ".cm-zn-task-box:hover": { borderColor: "var(--zn-accent-strong)" },
  ".cm-zn-task-on": {
    background: "var(--zn-accent)",
    borderColor: "var(--zn-accent)",
  },
  // A completed task's whole line dims and strikes through, not just the box.
  // `:has` is the only route from the checkbox widget to its line; WebView2 is
  // Chromium (鈮?05), and without support the box itself still shows the state.
  ".cm-line:has(.cm-zn-task-on)": {
    color: "var(--zn-editor-muted)",
    textDecoration: "line-through",
    textDecorationColor: "color-mix(in srgb, var(--zn-editor-muted) 55%, transparent)",
  },

  /* ---- images ----------------------------------------------------------
     The image is an INLINE widget (it belongs to a paragraph). It must not be
     `display:block`: a block box inside a CodeMirror line splits the line box
     and stacked badge images ended up ~100px apart (each line reserved two full
     line-heights plus padding). Standalone image lines get centring and a little
     breathing room through `.cm-zn-image-line`, which the decoration pass adds
     only when the image/link-image occupies the whole line. */
  ".cm-zn-image": {
    display: "inline-block",
    verticalAlign: "middle",
    position: "relative",
    padding: "0",
    margin: "0",
  },
  ".cm-zn-image-line": {
    textAlign: "center",
    padding: "0.15em 0",
  },
  ".cm-zn-image img": {
    maxWidth: "100%",
    borderRadius: "var(--zn-radius-lg)",
    border: "1px solid var(--zn-border)",
    background: "var(--zn-surface)",
    display: "inline-block",
    verticalAlign: "top",
  },
  ".cm-zn-image-empty": { color: "var(--zn-text-tertiary)", fontStyle: "italic" },

  /* ---- tables (block widget: no vertical margin) ----
     The wrapper is the card: hairline + radius, clipped. Cell borders carry only
     row dividers, so nothing doubles up against the frame. */
  ".cm-zn-table-wrap": {
    overflowX: "auto",
    overflowY: "hidden",
    padding: "0",
    margin: "0",
    position: "relative",
    border: "1px solid var(--zn-border)",
    borderRadius: "var(--zn-radius-lg)",
    background: "var(--zn-canvas)",
  },
  /* Row/column operations. Kept out of the way until the table is hovered or the
     button itself has focus, so the frame stays quiet while reading. */
  ".cm-zn-table-ops": {
    position: "absolute",
    top: "8px",
    right: "8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    padding: "0",
    border: "1px solid var(--zn-border)",
    borderRadius: "var(--zn-radius-sm)",
    background: "var(--zn-canvas-raised)",
    color: "var(--zn-text-secondary)",
    opacity: "0",
    transition: "opacity var(--zn-dur) var(--zn-ease), color var(--zn-dur) var(--zn-ease)",
    cursor: "pointer",
  },
  ".cm-zn-table-ops svg": { width: "15px", height: "15px" },
  ".cm-zn-table-wrap:hover .cm-zn-table-ops, .cm-zn-table-ops:focus-visible": {
    opacity: "1",
  },
  ".cm-zn-table-ops:hover": {
    color: "var(--zn-text)",
    background: "var(--zn-hover)",
  },
  ".cm-zn-table": {
    borderCollapse: "separate",
    borderSpacing: "0",
    width: "100%",
    tableLayout: "fixed",
    fontSize: "14px",
    lineHeight: "1.6",
  },
  ".cm-zn-table th, .cm-zn-table td": {
    border: "none",
    borderBottom: "1px solid var(--zn-border-soft)",
    padding: "7px 12px",
    verticalAlign: "top",
    overflowWrap: "anywhere",
  },
  ".cm-zn-table th": {
    background: "var(--zn-surface)",
    fontWeight: "600",
    fontSize: "12px",
    letterSpacing: "0.01em",
    // Headers follow the column's alignment, not the UA's centred default; the
    // widget sets an inline textAlign only for columns that declare one.
    textAlign: "left",
    color: "var(--zn-text-secondary)",
    borderBottom: "1px solid var(--zn-border)",
  },
  ".cm-zn-table tbody tr:last-child td": { borderBottom: "none" },
  ".cm-zn-table tbody tr:hover td": { background: "var(--zn-hover)" },
  ".cm-zn-table .cm-zn-inline-code": { fontSize: "0.85em" },
  /* A cell being edited shows its raw markdown; make that state obvious. */
  ".cm-zn-cell-editing": {
    outline: "2px solid var(--zn-accent)",
    outlineOffset: "-2px",
    background: "var(--zn-canvas)",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "13px",
    cursor: "text",
  },
  ".cm-zn-table td, .cm-zn-table th": { cursor: "text" },
  /* A painted cell range (drag across cells): the clay selection tint plus a
     hairline outline, so it reads as "selected" without shouting. */
  ".cm-zn-table th.cm-zn-cell-selected, .cm-zn-table td.cm-zn-cell-selected": {
    background: "var(--zn-selected)",
    boxShadow: "inset 0 0 0 2px var(--zn-accent-ring)",
  },

  /* ---- `[TOC]` outline (block widget: no vertical margin) ---- */
  ".cm-zn-toc": {
    // padding not margin 鈥?margins are invisible to CodeMirror's block-widget
    // height measurement (see the note at the top of this file).
    padding: "12px 16px",
    margin: "0",
    border: "1px solid var(--zn-border-soft)",
    borderRadius: "var(--zn-radius-lg)",
    background: "var(--zn-surface)",
  },
  ".cm-zn-toc-title": {
    fontWeight: "600",
    fontSize: "10.5px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--zn-text-tertiary)",
    marginBottom: "6px",
  },
  ".cm-zn-toc-empty": {
    fontSize: "0.88em",
    color: "var(--zn-text-tertiary)",
    fontStyle: "italic",
  },
  ".cm-zn-toc-list": { display: "flex", flexDirection: "column" },
  ".cm-zn-toc-item": {
    fontSize: "13px",
    lineHeight: "1.9",
    color: "var(--zn-editor-link)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-zn-toc-item:hover": {
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--zn-editor-link) 40%, transparent)",
  },
  ".cm-zn-toc-level-1": { fontWeight: "600" },
  ".cm-zn-toc-level-2": { paddingLeft: "1.2em" },
  ".cm-zn-toc-level-3": { paddingLeft: "2.4em" },
  ".cm-zn-toc-level-4": { paddingLeft: "3.6em" },
  ".cm-zn-toc-level-5": { paddingLeft: "4.8em" },
  ".cm-zn-toc-level-6": { paddingLeft: "6em" },

  /* ---- raw HTML blocks (block widget: no vertical margin) ---- */
  // Mirrors the rendered-HTML rules so the same document looks the same in both
  // the live preview and any HTML block. The list/paragraph rules matter because
  // the editor resets default list styling.
  ".cm-zn-html-block": { display: "block", padding: "0.5em 0", margin: "0", color: "inherit" },
  ".cm-zn-html-block cite": {
    display: "block",
    fontStyle: "normal",
    padding: "10px 16px",
    borderLeft: "2px solid var(--zn-accent)",
    background: "var(--zn-surface)",
    borderRadius: "0 var(--zn-radius-md) var(--zn-radius-md) 0",
    color: "var(--zn-text-secondary)",
    fontSize: "0.95em",
  },
  ".cm-zn-html-block kbd": {
    padding: "1px 5px",
    border: "1px solid var(--zn-border)",
    borderBottomColor: "var(--zn-border-strong)",
    borderRadius: "var(--zn-radius-xs)",
    background: "var(--zn-surface-strong)",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.85em",
  },
  ".cm-zn-html-block mark": {
    background: "color-mix(in srgb, var(--zn-accent) 26%, transparent)",
    color: "inherit",
    padding: "0 2px",
    borderRadius: "2px",
  },
  /* Inline HTML that got a direct visual treatment. */
  ".cm-zn-html-kbd": {
    padding: "1px 5px",
    border: "1px solid var(--zn-border)",
    borderBottomColor: "var(--zn-border-strong)",
    borderRadius: "var(--zn-radius-xs)",
    background: "var(--zn-surface-strong)",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.85em",
  },
  ".cm-zn-html-mark": {
    background: "color-mix(in srgb, var(--zn-accent) 26%, transparent)",
    color: "inherit",
    padding: "0 2px",
    borderRadius: "2px",
  },
  ".cm-zn-html-sup": { verticalAlign: "super", fontSize: "0.75em" },
  ".cm-zn-html-sub": { verticalAlign: "sub", fontSize: "0.75em" },
  ".cm-zn-html-block ul, .cm-zn-html-block ol": {
    paddingLeft: "1.6em",
    margin: "0.3em 0",
    listStyle: "revert",
  },
  ".cm-zn-html-block li": { listStyle: "revert", margin: "0.15em 0" },
  // 0.9em paragraph rhythm: adjacent margins collapse, so this is also the gap.
  ".cm-zn-html-block p": { margin: "0.9em 0" },
  ".cm-zn-html-block > :first-child": { marginTop: "0" },
  ".cm-zn-html-block > :last-child": { marginBottom: "0" },
  ".cm-zn-html-block a": {
    color: "var(--zn-editor-link)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--zn-editor-link) 40%, transparent)",
  },
  ".cm-zn-html-block code": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.88em",
    color: "var(--zn-code-inline-fg)",
    background: "var(--zn-code-inline-bg)",
    borderRadius: "var(--zn-radius-xs)",
    padding: "1px 4px",
  },
  ".cm-zn-html-block table": { borderCollapse: "collapse", margin: "0.4em 0" },
  ".cm-zn-html-block th, .cm-zn-html-block td": {
    border: "1px solid var(--zn-border-soft)",
    padding: "4px 10px",
  },

  /* ---- math ---- */
  ".cm-zn-math-inline": { display: "inline-block", verticalAlign: "middle" },
  ".cm-zn-math-display": {
    display: "block",
    padding: "0.6em 0",
    margin: "0",
    textAlign: "center",
    overflowX: "auto",
  },

  /* ---- YAML frontmatter (block widget: no vertical margin) ---- */
  ".cm-zn-frontmatter": {
    // padding, not margin: CodeMirror measures a block widget's height with
    // getBoundingClientRect(), which excludes margins 鈥?so a vertical margin
    // makes every later line's hit-testing drift by that amount.
    padding: "10px 0 8px",
    margin: "0",
    border: "1px solid var(--zn-border-soft)",
    borderRadius: "var(--zn-radius-lg)",
    background: "var(--zn-surface)",
    overflow: "hidden",
  },
  ".cm-zn-frontmatter-label": {
    padding: "0 14px 4px",
    fontSize: "10.5px",
    fontWeight: "600",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--zn-text-tertiary)",
  },
  ".cm-zn-frontmatter-body": {
    margin: "0",
    padding: "0 14px",
    background: "transparent",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "12px",
    lineHeight: "1.7",
    color: "var(--zn-text-secondary)",
    whiteSpace: "pre-wrap",
  },

  /* ---- mermaid (block widget: no vertical margin) ---- */
  ".cm-zn-mermaid": {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "12px 16px",
    margin: "0",
    background: "var(--zn-surface)",
    border: "1px solid var(--zn-border-soft)",
    borderRadius: "var(--zn-radius-lg)",
    overflow: "hidden",
  },
  ".cm-zn-mermaid svg": { maxWidth: "100%", height: "auto" },
  ".cm-zn-mermaid-pending": { color: "var(--zn-text-tertiary)", fontStyle: "italic", fontSize: "0.9em" },

  /* ---- headings ----
     Serif display for H1/H2 (the structural voice of the page), sans for the
     rest. Sizes are absolute px so they stay stable when the base size setting
     changes; the space above each heading lives in padding (鈮?.4em) so it is
     part of the measured line box. */
  ".cm-zn-h1, .cm-zn-h2, .cm-zn-h3, .cm-zn-h4, .cm-zn-h5, .cm-zn-h6": {
    color: "var(--zn-editor-heading)",
    fontWeight: "600",
  },
  ".cm-zn-h1": {
    fontFamily: LIVE_PREVIEW_SERIF,
    fontSize: "30px",
    lineHeight: "1.25",
    letterSpacing: "-0.02em",
    padding: "1.4em 0 0.5em",
  },
  ".cm-zn-h2": {
    fontFamily: LIVE_PREVIEW_SERIF,
    fontSize: "22px",
    lineHeight: "1.35",
    letterSpacing: "-0.015em",
    padding: "1.5em 0 0.45em",
    borderBottom: "1px solid var(--zn-editor-rule-soft)",
  },
  ".cm-zn-h3": {
    fontFamily: "var(--zn-font-ui)",
    fontSize: "17.5px",
    lineHeight: "1.4",
    letterSpacing: "-0.01em",
    padding: "1.4em 0 0.3em",
  },
  ".cm-zn-h4": {
    fontFamily: "var(--zn-font-ui)",
    fontSize: "14.5px",
    lineHeight: "1.5",
    letterSpacing: "-0.005em",
    padding: "1.4em 0 0.2em",
  },
  ".cm-zn-h5": {
    fontFamily: "var(--zn-font-ui)",
    fontSize: "14.5px",
    lineHeight: "1.5",
    letterSpacing: "-0.005em",
    padding: "1.4em 0 0.18em",
  },
  ".cm-zn-h6": {
    fontFamily: "var(--zn-font-ui)",
    fontSize: "14.5px",
    fontWeight: "600",
    lineHeight: "1.5",
    letterSpacing: "0.01em",
    color: "var(--zn-editor-muted)",
    padding: "1.4em 0 0.18em",
  },

  /* ---- quotes ---- */
  ".cm-zn-quote": {
    borderLeft: "2px solid var(--zn-accent)",
    padding: "0.2em 0 0.2em 1em",
    marginLeft: "0",
    fontFamily: LIVE_PREVIEW_SERIF,
    fontStyle: "italic",
    color: "var(--zn-text-secondary)",
  },
  // Muted prose sits at ~3:1 against a selection; restore full contrast when a
  // range is selected so it does not grey out.
  ".cm-zn-quote-on": { color: "var(--zn-editor-text)" },
  ".cm-zn-footnote-def-on": { color: "var(--zn-editor-text)" },

  ".cm-zn-li": {},

  ".cm-zn-bullet": { color: "var(--zn-text-tertiary)", marginRight: "0.5em" },

  ".cm-zn-rule": {
    border: "none",
    borderTop: "1px solid var(--zn-editor-rule)",
    margin: "1.6em 0",
  },

  /* ---- fenced code blocks ----
     Three line classes (`-open` / `-body` / `-close`) so a single continuous,
     rounded card can be drawn: fence lines are siblings among ALL lines, so
     `:first-child` style selectors cannot identify a fence's own first and last
     line. Each edge (top / sides / bottom) is drawn exactly once. */
  ".cm-zn-fence": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "13px",
    lineHeight: "1.65",
    background: "var(--zn-code-block-bg)",
  },
  // Fence-symbol lines stay dim; the code body keeps normal contrast.
  ".cm-zn-fence-open, .cm-zn-fence-close": { color: "var(--zn-text-tertiary)" },
  // The opening fence line is the block's header row: language and Copy sit in
  // their own 32px strip (24px tools + 4px above and below), then the body's
  // top air. Padding, never margin 鈥?see the note at the top of this file.
  ".cm-zn-fence-open": {
    padding: "4px 16px 10px",
    borderTopLeftRadius: "var(--zn-radius-lg)",
    borderTopRightRadius: "var(--zn-radius-lg)",
    border: "1px solid var(--zn-border)",
    borderBottom: "none",
  },
  // Horizontal padding, not margin: the code must not touch the frame. Padding
  // is included in a line's measured box, so this cannot reintroduce the
  // hit-testing drift that vertical margins caused in the block widgets.
  ".cm-zn-fence-body": {
    padding: "0 16px",
    borderLeft: "1px solid var(--zn-border)",
    borderRight: "1px solid var(--zn-border)",
  },
  // The closing fence line holds no visible text (its backticks are hidden), so
  // it is the block's footer spacing. Its line box is also what gives the code
  // its bottom air, which is why the padding stays small.
  ".cm-zn-fence-close": {
    padding: "6px 16px 10px",
    borderBottomLeftRadius: "var(--zn-radius-lg)",
    borderBottomRightRadius: "var(--zn-radius-lg)",
    border: "1px solid var(--zn-border)",
    borderTop: "none",
  },
  // A fence with no body (an empty block) must still look like one box.
  ".cm-zn-fence-open.cm-zn-fence-close": {
    borderRadius: "var(--zn-radius-lg)",
    border: "1px solid var(--zn-border)",
    padding: "4px 16px 10px",
  },
};

/**
 * The raw style spec, exported so a test can assert invariants about it. The
 * block-widget margin rule below is easy to reintroduce and produces a subtle,
 * hard-to-diagnose click-drift, so it is pinned rather than trusted.
 */
export const livePreviewThemeSpec = themeSpec;
export const livePreviewTheme = EditorView.theme(themeSpec);
