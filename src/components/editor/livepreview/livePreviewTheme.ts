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
/* The [TOC] outline. Mirrors the Crepe editor's look, but scoped to its own
   class so the two implementations can never collide. */
.cm-zn-toc {
  margin: 0.6em 0;
  padding: 12px 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-code) 40%, transparent);
}
.cm-zn-toc-title {
  font-weight: 600;
  font-size: 0.95em;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.cm-zn-toc-empty {
  font-size: 0.88em;
  color: var(--text-tertiary);
  font-style: italic;
}
.cm-zn-toc-list {
  display: flex;
  flex-direction: column;
}
.cm-zn-toc-item {
  font-size: 0.9em;
  line-height: 1.9;
  color: var(--text-accent);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cm-zn-toc-item:hover {
  text-decoration: underline;
}
.cm-zn-toc-level-1 { font-weight: 600; }
.cm-zn-toc-level-2 { padding-left: 1.2em; }
.cm-zn-toc-level-3 { padding-left: 2.4em; }
.cm-zn-toc-level-4 { padding-left: 3.6em; }
.cm-zn-toc-level-5 { padding-left: 4.8em; }
.cm-zn-toc-level-6 { padding-left: 6em; }
/* Code block language chip + copy button. */
.zn-lp-code-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  user-select: none;
  vertical-align: middle;
}
.zn-lp-code-lang {
  font-family: var(--zn-font-code, monospace);
  font-size: 10.5px;
  color: var(--text-tertiary);
  text-transform: lowercase;
}
.zn-lp-code-copy {
  border: 1px solid var(--zn-float-border, #ddd);
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 10.5px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
}
.zn-lp-code-copy:hover {
  color: var(--text-primary);
  background: var(--zn-float-hover, #f0f0f0);
}
`;

/** Inject the chrome stylesheet once per document. */
export function installLivePreviewChrome(): void {
  if (document.getElementById("zn-lp-chrome")) return;
  const el = document.createElement("style");
  el.id = "zn-lp-chrome";
  el.textContent = livePreviewChromeStyles;
  document.head.appendChild(el);
}

export const livePreviewTheme = EditorView.theme({  "&": {
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

  /* ---- inline marks ---- */
  ".cm-zn-inline-strong": { fontWeight: "700", color: "var(--zn-editor-heading)" },
  ".cm-zn-inline-em": { fontStyle: "italic" },
  ".cm-zn-inline-strike": { textDecoration: "line-through", color: "var(--zn-editor-muted)" },
  ".cm-zn-inline-mark": {
    backgroundColor: "color-mix(in srgb, var(--text-accent) 26%, transparent)",
    borderRadius: "3px",
    padding: "0 2px",
  },
  ".cm-zn-inline-code": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.88em",
    color: "var(--zn-editor-code-fg)",
    backgroundColor: "var(--zn-editor-code-bg)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-zn-inline-link": {
    color: "var(--zn-editor-link)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--zn-editor-link) 40%, transparent)",
  },

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
  ".cm-zn-image": { display: "block", margin: "0.6em 0", textAlign: "center" },
  ".cm-zn-image img": {
    maxWidth: "100%",
    borderRadius: "6px",
    display: "inline-block",
    verticalAlign: "top",
  },
  ".cm-zn-image-empty": { color: "var(--text-tertiary)", fontStyle: "italic" },

  /* ---- tables ---- */
  ".cm-zn-table-wrap": { overflowX: "auto", margin: "0.5em 0" },
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

  /* ---- math ---- */
  ".cm-zn-math-inline": { display: "inline-block", verticalAlign: "middle" },
  ".cm-zn-math-display": { display: "block", margin: "0.6em 0", textAlign: "center", overflowX: "auto" },

  /* ---- YAML frontmatter ---- */
  ".cm-zn-frontmatter": {
    margin: "0.2em 0 0.8em",
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
  ".cm-zn-mermaid": { display: "flex", justifyContent: "center", margin: "0.6em 0" },
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

  ".cm-zn-quote": {    borderLeft: "3px solid var(--zn-float-handle)",
    paddingLeft: "0.9em",
    marginLeft: "0",
    color: "var(--zn-editor-muted)",
  },

  ".cm-zn-li": {},

  ".cm-zn-bullet": { color: "var(--text-tertiary)", marginRight: "0.5em" },

  ".cm-zn-rule": {
    border: "none",
    borderTop: "1px solid var(--zn-editor-rule)",
    margin: "1.1em 0",
  },

  ".cm-zn-fence": {
    fontFamily: LIVE_PREVIEW_MONO,
    fontSize: "0.9em",
    color: "var(--text-tertiary)",
  },
});
