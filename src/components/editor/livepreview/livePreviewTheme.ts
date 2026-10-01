/**
 * Visual theme for the Live Preview editor.
 *
 * Everything resolves through the app's CSS custom properties, so the Claude
 * theme (and the five legacy themes) drive this editor exactly as they drive
 * the rest of the chrome — no hardcoded colours here.
 *
 * The type scale deliberately mirrors what the Crepe editor rendered, so
 * switching between the two does not reflow the page.
 */
import { EditorView } from "@codemirror/view";

export const LIVE_PREVIEW_FONT =
  '"Anthropic Sans", "AnthropicSans", "Styrene", "Inter", -apple-system, ' +
  'BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", ' +
  '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';

export const LIVE_PREVIEW_SERIF =
  '"Anthropic Serif", "AnthropicSerif", "Tiempos", "Source Serif 4", ' +
  '"Noto Serif SC", "Songti SC", Georgia, Cambria, "Times New Roman", serif';

export const LIVE_PREVIEW_MONO =
  '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, "Microsoft YaHei", monospace';

/** Bubble toolbar + slash menu chrome. Plain CSS because the bubble lives in
 *  document.body, outside the editor's theme scope. */
export const livePreviewChromeStyles = `
.cm-zn-bubble {
  position: fixed;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--zn-float-bg, #fff);
  border: 1px solid var(--zn-float-border, #ddd);
  border-radius: var(--zn-radius-menu, 8px);
  box-shadow: var(--shadow-popover, 0 6px 20px rgba(0,0,0,.12));
}
.cm-zn-bubble-btn {
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cm-zn-bubble-btn:hover {
  background: var(--zn-float-hover, #f0f0f0);
  color: var(--text-primary);
}
.cm-zn-bubble-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--zn-float-border, #ddd);
}
/* Slash menu panel — hand-rolled, so it needs its own styling. */
.cm-zn-slash {
  position: fixed;
  z-index: 1300;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  background: var(--zn-float-bg, #fff);
  border: 1px solid var(--zn-float-border, #ddd);
  border-radius: var(--zn-radius-menu, 8px);
  box-shadow: var(--shadow-popover, 0 6px 20px rgba(0,0,0,.12));
  font-family: var(--zn-font-stack, sans-serif);
}
.cm-zn-slash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 5px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.cm-zn-slash-item.is-selected {
  background: var(--zn-float-selected, #e8e8e8);
  color: var(--text-accent);
}
.cm-zn-slash-detail {
  font-family: var(--zn-font-code, monospace);
  font-size: 11px;
  color: var(--text-tertiary);
}
.cm-zn-slash-item.is-selected .cm-zn-slash-detail {
  color: var(--text-accent);
  opacity: 0.8;
}
/* Zoom button over a rendered diagram / image. The .zn-mermaid-zoom-btn class
   (defined in globals.css) is absolutely positioned relative to its parent, so
   both hosts need to establish a positioning context. */
.cm-zn-mermaid,
.cm-zn-image {
  position: relative;
}
.cm-zn-image .zn-mermaid-zoom-btn {
  opacity: 0;
  transition: opacity 120ms ease;
}
.cm-zn-image:hover .zn-mermaid-zoom-btn,
.cm-zn-mermaid:hover .zn-mermaid-zoom-btn {
  opacity: 0.85;
}
.cm-zn-image .zn-mermaid-zoom-btn:hover,
.cm-zn-mermaid .zn-mermaid-zoom-btn:hover {
  opacity: 1;
}
/* Image alignment bar and table context menu. Mounted on document.body, so the
   positioning is viewport-fixed and the styling has to live here. */
.zn-lp-image-bar,
.zn-lp-table-menu {
  position: fixed;
  z-index: 1250;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--zn-float-bg, #fff);
  border: 1px solid var(--zn-float-border, #ddd);
  border-radius: var(--zn-radius-menu, 8px);
  box-shadow: var(--shadow-popover, 0 6px 20px rgba(0,0,0,.12));
}
.zn-lp-table-menu {
  flex-direction: column;
  min-width: 168px;
  gap: 0;
}
.zn-lp-image-bar button {
  width: 28px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.zn-lp-image-bar button:hover {
  background: var(--zn-float-hover, #f0f0f0);
  color: var(--text-primary);
}
.zn-lp-image-bar button.is-active {
  background: var(--zn-float-selected, #e8e8e8);
  color: var(--text-accent);
}
.zn-lp-table-menu button {
  padding: 6px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.zn-lp-table-menu button:hover {
  background: var(--zn-float-hover, #f0f0f0);
}
.zn-lp-table-menu button.is-danger {
  color: var(--text-danger);
}
.zn-lp-menu-divider,
.zn-lp-bar-sep {
  background: var(--zn-float-border, #ddd);
}
.zn-lp-menu-divider {
  height: 1px;
  margin: 4px 2px;
}
.zn-lp-bar-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  align-self: center;
}
/* Footnote reference chip. Matches the Crepe editor's sup, including the warm
   neutral fill it was changed to (a coral tint read as candy pink on bone). */
.cm-zn-footnote-ref {
  display: inline-block;
  min-width: 1.3em;
  padding: 0 4px;
  margin: 0 1px;
  text-align: center;
  font-size: 0.72em;
  line-height: 1.6;
  border-radius: 4px;
  color: var(--text-accent);
  background: color-mix(in srgb, var(--text-primary) 8%, transparent);
  cursor: pointer;
  vertical-align: super;
}
.cm-zn-footnote-ref:hover {
  background: color-mix(in srgb, var(--text-primary) 14%, transparent);
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
  animation: cm-zn-footnote-pulse 1.2s ease;
  border-radius: 4px;
}
@keyframes cm-zn-footnote-pulse {
  0%, 60% { background: color-mix(in srgb, var(--text-accent) 22%, transparent); }
  100% { background: transparent; }
}
/* Code block header: the language menu on the left, Copy on the right.
   Both belong to the frame, not the code, so they stay quiet — tertiary until
   touched. The deliberate type split: the language is set in the mono face so it
   reads as a code label, Copy stays in the UI face so it reads as a control. */
.zn-lp-code-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  user-select: none;
}
.zn-lp-code-lang {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--zn-font-code, monospace);
  font-size: 10.5px;
  /* Slightly tracked, so it reads as a label rather than a sentence. */
  letter-spacing: 0.02em;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 2px 5px;
  /* Optical: the label lines up with the code's left edge, not the pill's. */
  margin-left: -5px;
  cursor: pointer;
}
.zn-lp-code-lang:hover,
.zn-lp-code-lang.is-open {
  color: var(--text-primary);
  background: var(--zn-float-hover, rgba(128, 128, 128, 0.12));
}
.zn-lp-code-chevron {
  display: inline-flex;
  width: 12px;
  height: 12px;
  opacity: 0.75;
  transition: transform 140ms ease;
}
.zn-lp-code-chevron svg { width: 12px; height: 12px; }
.zn-lp-code-lang.is-open .zn-lp-code-chevron { transform: rotate(180deg); }
.zn-lp-code-copy {
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  font-family: var(--zn-font-stack, inherit);
  font-size: 11px;
  line-height: 1;
  padding: 3px 7px;
  /* Optical: match the -5px on the language pill, on the other side. */
  margin-right: -7px;
  cursor: pointer;
}
.zn-lp-code-copy:hover {
  color: var(--text-primary);
  background: var(--zn-float-hover, rgba(128, 128, 128, 0.12));
}

/* The language menu. Built from the same surfaces as the table context menu
   rather than a native <select>, whose popup the platform draws itself and
   which therefore ignores the app's theme. */
.zn-lp-code-menu {
  position: fixed;
  z-index: 1250;
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 150px;
  max-height: 288px;
  overflow-y: auto;
  background: var(--zn-float-bg, #fff);
  border: 1px solid var(--zn-float-border, #ddd);
  border-radius: var(--zn-radius-menu, 8px);
  box-shadow: var(--shadow-popover, 0 6px 20px rgba(0, 0, 0, 0.12));
}
.zn-lp-code-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--zn-font-code, monospace);
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}
.zn-lp-code-menu-item:hover,
.zn-lp-code-menu-item:focus-visible {
  background: var(--zn-float-hover, rgba(128, 128, 128, 0.14));
  color: var(--text-primary);
  outline: none;
}
.zn-lp-code-menu-item.is-selected { color: var(--text-primary); }
/* A fixed gutter keeps every label on one left edge, selected row or not, so
   the tick never shifts the text sideways. */
.zn-lp-code-menu-tick {
  display: inline-flex;
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--text-accent);
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

const themeSpec = {  "&": {
    height: "100%",
    background: "var(--bg-editor)",
    color: "var(--zn-editor-text)",
    fontFamily: LIVE_PREVIEW_FONT,
    fontSize: "var(--zn-editor-font-size, 16px)",
  },

  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.75",
    padding: "40px calc(var(--zn-lp-margin, 80px))",
  },
  ".cm-content": {
    maxWidth: "var(--zn-editor-content-width, 860px)",
    margin: "0 auto",
    caretColor: "var(--text-accent)",
    padding: "0",
  },
  ".cm-line": { padding: "0" },

  // Selection uses the theme's warm selection colour, not CodeMirror's default.
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--selection-bg)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text-accent)", borderLeftWidth: "2px" },

  // The active line gets no band: Typora does not shade it, and a full-width
  // band fights the "the page is the document" illusion.
  ".cm-activeLine": { backgroundColor: "transparent" },

  /* ---- revealed syntax marks (the line the caret is on) ---- */
  ".cm-zn-mark": { color: "var(--text-markdown-mark)" },
  // While a range is selected the marks must clear contrast against the
  // selection background, which the dim token does not (~2:1).
  ".cm-zn-mark-on": { color: "var(--text-primary)" },

  /* ---- inline marks ---- */
  ".cm-zn-inline-strong": { fontWeight: "700", color: "var(--zn-editor-heading)" },
  ".cm-zn-inline-em": { fontStyle: "italic" },
  ".cm-zn-inline-strike": { textDecoration: "line-through", color: "var(--zn-editor-muted)" },
  ".cm-zn-inline-mark": {
    // Translucent so the selection layer behind stays visible: an opaque inline
    // background completely hides the selection, making it impossible to tell
    // what is selected.
    backgroundColor: "color-mix(in srgb, var(--text-accent) 26%, transparent)",
    borderRadius: "3px",
    padding: "0 2px",
  },
  ".cm-zn-inline-code": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.88em",
    color: "var(--zn-editor-code-fg)",
    backgroundColor: "color-mix(in srgb, var(--zn-editor-code-bg) 72%, transparent)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-zn-inline-link": {
    color: "var(--zn-editor-link)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--zn-editor-link) 40%, transparent)",
  },
  // Selected variants: restore full contrast so nothing dims into the selection.
  ".cm-zn-inline-link-on": { color: "var(--text-primary)" },
  ".cm-zn-inline-code-on": { color: "var(--text-primary)" },
  ".cm-zn-inline-strike-on": { color: "var(--zn-editor-text)" },

  /* ---- task list ---- */
  ".cm-zn-task": { marginRight: "0.45em" },
  ".cm-zn-task-box": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "0.95em",
    height: "0.95em",
    border: "1.5px solid var(--text-tertiary)",
    borderRadius: "3px",
    fontSize: "0.7em",
    lineHeight: "1",
    verticalAlign: "-0.08em",
    color: "var(--text-primary)",
  },
  ".cm-zn-task-on": {
    background: "var(--text-accent)",
    borderColor: "var(--text-accent)",
    // A tick on a saturated accent fill; every theme's accent is dark enough
    // for white to clear contrast.
    color: "#FFFFFF",
  },

  /* ---- images ---- */
  ".cm-zn-image": { display: "block", padding: "0.6em 0", textAlign: "center" },
  ".cm-zn-image img": {
    maxWidth: "100%",
    borderRadius: "6px",
    display: "inline-block",
    verticalAlign: "top",
  },
  ".cm-zn-image-empty": { color: "var(--text-tertiary)", fontStyle: "italic" },

  /* ---- tables ---- */
  ".cm-zn-table-wrap": { overflowX: "auto", padding: "0.5em 0" },
  ".cm-zn-table": {
    borderCollapse: "collapse",
    width: "100%",
    tableLayout: "fixed",
    fontSize: "0.95em",
  },
  ".cm-zn-table th, .cm-zn-table td": {
    border: "1px solid var(--zn-editor-rule)",
    padding: "6px 10px",
    verticalAlign: "top",
    overflowWrap: "anywhere",
  },
  ".cm-zn-table th": {
    background: "color-mix(in srgb, var(--bg-code) 55%, transparent)",
    fontWeight: "600",
    color: "var(--zn-editor-heading)",
  },
  ".cm-zn-table .cm-zn-inline-code": { fontSize: "0.85em" },
  /* A cell being edited shows its raw markdown; make that state obvious. */
  ".cm-zn-cell-editing": {
    outline: "2px solid var(--text-accent)",
    outlineOffset: "-2px",
    background: "var(--bg-editor)",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.92em",
    cursor: "text",
  },
  ".cm-zn-table td, .cm-zn-table th": { cursor: "text" },

  /* ---- `[TOC]` outline ----
     Lives here rather than in the chrome stylesheet: it is document content, and
     `livePreviewThemeSpec` is what the geometry regression test inspects. */
  ".cm-zn-toc": {
    // padding not margin — margins are invisible to CodeMirror's block-widget
    // height measurement (see the note in the test).
    padding: "12px 18px",
    margin: "0",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    background: "color-mix(in srgb, var(--bg-code) 40%, transparent)",
  },
  ".cm-zn-toc-title": {
    fontWeight: "600",
    fontSize: "0.95em",
    color: "var(--text-primary)",
    marginBottom: "6px",
  },
  ".cm-zn-toc-empty": {
    fontSize: "0.88em",
    color: "var(--text-tertiary)",
    fontStyle: "italic",
  },
  ".cm-zn-toc-list": { display: "flex", flexDirection: "column" },
  ".cm-zn-toc-item": {
    fontSize: "0.9em",
    lineHeight: "1.9",
    color: "var(--text-accent)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-zn-toc-item:hover": { textDecoration: "underline" },
  ".cm-zn-toc-level-1": { fontWeight: "600" },
  ".cm-zn-toc-level-2": { paddingLeft: "1.2em" },
  ".cm-zn-toc-level-3": { paddingLeft: "2.4em" },
  ".cm-zn-toc-level-4": { paddingLeft: "3.6em" },
  ".cm-zn-toc-level-5": { paddingLeft: "4.8em" },
  ".cm-zn-toc-level-6": { paddingLeft: "6em" },

  /* ---- raw HTML blocks ---- */
  // Mirrors the Crepe editor's `.zn-html-render` rules so the same document
  // looks the same in both. The list/paragraph rules matter because the editor
  // resets default list styling, so rendered HTML would otherwise lose bullets.
  ".cm-zn-html-block": { display: "block", padding: "0.5em 0", color: "inherit" },
  ".cm-zn-html-block cite": {
    display: "block",
    fontStyle: "normal",
    padding: "10px 16px",
    borderLeft: "3px solid var(--border)",
    background: "var(--bg-code)",
    borderRadius: "0 6px 6px 0",
    color: "var(--text-secondary)",
    fontSize: "0.92em",
  },
  ".cm-zn-html-block kbd": {
    padding: "2px 6px",
    border: "1px solid var(--border)",
    borderBottomWidth: "2px",
    borderRadius: "4px",
    background: "var(--bg-code)",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.85em",
  },
  ".cm-zn-html-block mark": { background: "#FEF08A", padding: "0 2px", borderRadius: "2px" },
  /* Inline HTML that got a direct visual treatment. */
  ".cm-zn-html-kbd": {
    padding: "2px 6px",
    border: "1px solid var(--border)",
    borderBottomWidth: "2px",
    borderRadius: "4px",
    background: "var(--bg-code)",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.85em",
  },
  ".cm-zn-html-mark": { background: "#FEF08A", color: "#141413", padding: "0 2px", borderRadius: "2px" },
  ".cm-zn-html-sup": { verticalAlign: "super", fontSize: "0.75em" },
  ".cm-zn-html-sub": { verticalAlign: "sub", fontSize: "0.75em" },
  ".cm-zn-html-block ul, .cm-zn-html-block ol": {
    paddingLeft: "1.6em",
    margin: "0.3em 0",
    listStyle: "revert",
  },
  ".cm-zn-html-block li": { listStyle: "revert", margin: "0.15em 0" },
  ".cm-zn-html-block p": { margin: "0.35em 0" },
  ".cm-zn-html-block a": { color: "var(--zn-editor-link)", textDecoration: "underline" },
  ".cm-zn-html-block code": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.88em",
    background: "color-mix(in srgb, var(--zn-editor-code-bg) 72%, transparent)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-zn-html-block table": { borderCollapse: "collapse", margin: "0.4em 0" },
  ".cm-zn-html-block th, .cm-zn-html-block td": {
    border: "1px solid var(--zn-editor-rule)",
    padding: "4px 10px",
  },

  /* ---- math ---- */
  ".cm-zn-math-inline": { display: "inline-block", verticalAlign: "middle" },
  ".cm-zn-math-display": { display: "block", padding: "0.6em 0", textAlign: "center", overflowX: "auto" },

  /* ---- YAML frontmatter ---- */
  ".cm-zn-frontmatter": {
    // padding, not margin: CodeMirror measures a block widget's height with
    // getBoundingClientRect(), which excludes margins — so a vertical margin
    // makes every later line's hit-testing drift by that amount.
    padding: "0.2em 0 0.8em",
    border: "1px dashed var(--border)",
    borderRadius: "8px",
    background: "color-mix(in srgb, var(--bg-code) 40%, transparent)",
    overflow: "hidden",
  },
  ".cm-zn-frontmatter-label": {
    padding: "4px 12px 0",
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  ".cm-zn-frontmatter-body": {
    margin: "2px 0 0",
    padding: "4px 12px 10px",
    background: "transparent",
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.85em",
    lineHeight: "1.6",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
  },

  /* ---- mermaid ---- */
  ".cm-zn-mermaid": { display: "flex", justifyContent: "center", padding: "0.6em 0" },
  ".cm-zn-mermaid svg": { maxWidth: "100%", height: "auto" },
  ".cm-zn-mermaid-pending": { color: "var(--text-tertiary)", fontStyle: "italic", fontSize: "0.9em" },

  /* ---- rendered blocks (marks hidden) ---- */
  ".cm-zn-h1, .cm-zn-h2, .cm-zn-h3, .cm-zn-h4, .cm-zn-h5, .cm-zn-h6": {
    fontFamily: LIVE_PREVIEW_SERIF,
    color: "var(--zn-editor-heading)",
  },
  // Sizes match the Crepe scale the app shipped before, so nothing reflows.
  ".cm-zn-h1": { fontSize: "2.1em", fontWeight: "600", lineHeight: "1.3", padding: "0.5em 0 0.3em" },
  ".cm-zn-h2": {
    fontSize: "1.65em",
    fontWeight: "600",
    lineHeight: "1.35",
    padding: "0.5em 0 0.25em",
    borderBottom: "1px solid var(--zn-editor-rule-soft)",
  },
  ".cm-zn-h3": { fontSize: "1.35em", fontWeight: "600", lineHeight: "1.4", padding: "0.4em 0 0.2em" },
  ".cm-zn-h4": { fontSize: "1.15em", fontWeight: "600", padding: "0.35em 0 0.15em" },
  ".cm-zn-h5": { fontSize: "1.02em", fontWeight: "600", padding: "0.3em 0 0.1em" },
  ".cm-zn-h6": {
    fontSize: "0.94em",
    fontWeight: "600",
    color: "var(--zn-editor-muted)",
    padding: "0.3em 0 0.1em",
  },

  ".cm-zn-quote": {
    borderLeft: "3px solid var(--zn-float-handle)",
    paddingLeft: "0.9em",
    marginLeft: "0",
    color: "var(--zn-editor-muted)",
  },
  // Muted prose sits at ~3:1 against a selection; restore full contrast when a
  // range is selected so it does not grey out.
  ".cm-zn-quote-on": { color: "var(--zn-editor-text)" },
  ".cm-zn-footnote-def-on": { color: "var(--zn-editor-text)" },

  ".cm-zn-li": {},

  ".cm-zn-bullet": { color: "var(--text-tertiary)", marginRight: "0.5em" },

  ".cm-zn-rule": {
    border: "none",
    borderTop: "1px solid var(--zn-editor-rule)",
    margin: "1.1em 0",
  },

  /* ---- fenced code blocks ----
     Three line classes (`-open` / `-body` / `-close`) so a single continuous box
     can be drawn: fence lines are siblings among ALL lines, so `:first-child`
     style selectors cannot identify a fence's own first and last line. */
  ".cm-zn-fence": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.9em",
    lineHeight: "1.6",
    background: "var(--zn-editor-surface, var(--bg-code))",
  },
  // Fence-symbol lines stay dim; the code body keeps normal contrast.
  ".cm-zn-fence-open, .cm-zn-fence-close": { color: "var(--text-tertiary)" },
  // The opening fence line is the block's header row: language and Copy sit in
  // their own strip, with air above and below so the header does not read as the
  // first line of code.
  ".cm-zn-fence-open": {
    padding: "6px 12px 7px",
    borderTopLeftRadius: "8px",
    borderTopRightRadius: "8px",
    border: "1px solid var(--zn-editor-rule)",
    borderBottom: "none",
  },
  // Horizontal padding, not margin: the code must not touch the frame. Padding
  // is included in a line's measured box, so this cannot reintroduce the
  // hit-testing drift that vertical margins caused in the block widgets.
  ".cm-zn-fence-body": {
    padding: "0 12px",
    borderLeft: "1px solid var(--zn-editor-rule)",
    borderRight: "1px solid var(--zn-editor-rule)",
  },
  // The closing fence line holds no visible text (its backticks are hidden), so
  // it is the block's footer spacing.
  ".cm-zn-fence-close": {
    padding: "6px 12px 10px",
    borderBottomLeftRadius: "8px",
    borderBottomRightRadius: "8px",
    border: "1px solid var(--zn-editor-rule)",
    borderTop: "none",
  },
  // A fence with no body (an empty block) must still look like one box.
  ".cm-zn-fence-open.cm-zn-fence-close": {
    borderRadius: "8px",
    border: "1px solid var(--zn-editor-rule)",
    padding: "6px 12px 10px",
  },
};

/**
 * The raw style spec, exported so a test can assert invariants about it. The
 * block-widget margin rule below is easy to reintroduce and produces a subtle,
 * hard-to-diagnose click-drift, so it is pinned rather than trusted.
 */
export const livePreviewThemeSpec = themeSpec;
export const livePreviewTheme = EditorView.theme(themeSpec);
