// Shared note-export helpers (HTML / PDF), used by both the titlebar menu and shortcuts.
//
// The body is rendered from the markdown source (see markdownToHtml.ts) rather
// than taken from the editor: CodeMirror renders only its viewport, so the
// editor's DOM holds about one screenful of the note and cloning it dropped
// everything below. Colour and type come from the app's own resolved custom
// properties, embedded with a stylesheet written for the exported document.

import { currentFontStack } from "./fontStack";
import { resolveImageUrl } from "../services";
import { sanitizeSvg } from "./sanitize";
import { useStore } from "../store";
import { t } from "../i18n";
import { renderMarkdownToHtml } from "./markdownToHtml";

/**
 * Styles for the exported document.
 *
 * Written for the export rather than copied out of the running app. Copying used
 * to work because the editor produced plain semantic HTML; it cannot work now,
 * because CodeMirror scopes every theme rule to a generated class on its own
 * element, so none of those selectors match a standalone file.
 *
 * Nothing here is a hard-coded colour — `collectResolvedVariables` emits the
 * app's own custom properties, so this follows whichever theme is active.
 */
const EXPORT_STYLES = `
*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
html,body{margin:0;padding:0;background:var(--bg-editor,#fff);color:var(--text-primary,#1a1a1a);}
body{max-width:800px;margin:0 auto;padding:56px 28px;font-family:var(--zn-font-stack,'Microsoft YaHei',sans-serif);font-size:16px;line-height:1.75;}
h1,h2,h3,h4,h5,h6{font-weight:600;line-height:1.35;color:var(--zn-editor-heading,var(--text-primary));margin:1.6em 0 .6em;}
h1{font-size:2.1em;margin-top:0;padding-bottom:.3em;border-bottom:1px solid var(--zn-editor-rule,#e5e5e5);}
h2{font-size:1.65em;padding-bottom:.25em;border-bottom:1px solid var(--zn-editor-rule,#e5e5e5);}
h3{font-size:1.35em;}h4{font-size:1.15em;}h5{font-size:1.02em;}
h6{font-size:.94em;color:var(--text-secondary);}
p{margin:.9em 0;}
a{color:var(--text-accent,#C2603F);text-decoration:none;}
strong,b{font-weight:700;color:var(--zn-editor-heading,var(--text-primary));}
del,s{text-decoration:line-through;color:var(--zn-editor-muted,var(--text-secondary));}
mark{background:color-mix(in srgb,var(--text-accent) 26%,transparent);color:inherit;padding:0 2px;border-radius:3px;}
hr{border:none;border-top:1px solid var(--zn-editor-rule,#e5e5e5);margin:2em 0;}
blockquote{margin:1em 0;padding:.1em 0 .1em 1em;border-left:3px solid var(--zn-editor-rule-strong,#d5d5d5);color:var(--text-secondary);}
ul,ol{margin:.75em 0;padding-left:1.6em;}
li{margin:.25em 0;}
li>ul,li>ol{margin:.25em 0;}
li.zn-task{list-style:none;margin-left:-1.4em;}
li.zn-task input{margin-right:.4em;}
/* The same mono stack and code colours the preview uses (livePreviewTheme.ts), so
   the export matches what was on screen rather than a generic monospace. */
code{font-family:"Cascadia Code","JetBrains Mono","Fira Code",Consolas,"Microsoft YaHei",monospace;font-size:.88em;background:color-mix(in srgb,var(--zn-editor-code-bg) 72%,transparent);color:var(--zn-editor-code-fg,inherit);padding:0 4px;border-radius:4px;}
pre{margin:1.1em 0;padding:14px 16px;background:var(--zn-editor-surface,var(--bg-code,#f6f6f4));border:1px solid var(--zn-editor-rule,#e5e5e5);border-radius:8px;overflow-x:auto;}
pre code{background:none;padding:0;font-size:.9em;line-height:1.6;}
table{border-collapse:collapse;width:100%;margin:1.1em 0;font-size:.95em;}
th,td{border:1px solid var(--zn-editor-rule,#e5e5e5);padding:6px 10px;vertical-align:top;text-align:left;overflow-wrap:anywhere;}
th{background:color-mix(in srgb,var(--bg-code,#f6f6f4) 55%,transparent);font-weight:600;color:var(--zn-editor-heading,var(--text-primary));}
img{max-width:100%;height:auto;border-radius:6px;}
.zn-fm-block{margin:0 0 1.6em;padding:10px 14px;background:var(--zn-editor-surface,var(--bg-code,#f6f6f4));border:1px solid var(--zn-editor-rule,#e5e5e5);border-radius:8px;font-size:.85em;color:var(--text-secondary);}
.zn-export-mermaid{margin:1.2em 0;text-align:center;overflow-x:auto;}
/* Formulas are emitted as MathML, which the browser typesets itself — no
   stylesheet and no webfont are needed for the file to stand alone.
   A formula's ink (superscripts, tall delimiters) reaches past its line box, so
   the block gets padding to hold it and no vertical scroller: without that even a
   plain E = mc² reports overflow and grows a scrollbar. */
.zn-export-latex{margin:1.2em 0;overflow-x:auto;overflow-y:hidden;text-align:center;padding:6px 0;}
math{font-size:1.06em;}
.zn-export-latex math[display="block"]{margin:0;}
.zn-fn-ref{font-size:.72em;vertical-align:super;line-height:0;}
.zn-fn-ref a{text-decoration:none;padding:0 .15em;border-radius:3px;background:color-mix(in srgb,var(--text-accent,#C2603F) 14%,transparent);}
.zn-export-footnotes{margin-top:2.4em;font-size:.9em;color:var(--text-secondary);}
.zn-export-footnotes ol{padding-left:1.4em;}
.zn-fn-back{text-decoration:none;opacity:.7;}
.zn-html-render{margin:1em 0;}
.zn-toc{margin:1.2em 0;padding:12px 16px;border:1px solid var(--zn-editor-rule,#e5e5e5);border-radius:8px;}
.zn-toc-title{font-weight:600;margin-bottom:.4em;color:var(--zn-editor-heading,var(--text-primary));}
.zn-toc-list{list-style:none;padding-left:0;margin:0;}
.zn-toc-list ul{list-style:none;padding-left:1.1em;}
.zn-toc-list a{color:var(--text-secondary);text-decoration:none;}
@page{margin:14mm;}
@media print{body{max-width:none;padding:0;}}
`;

/**
 * Build the export body for a note.
 *
 * Rendering happens from the markdown source. It cannot be taken from the editor
 * any more: CodeMirror renders only its viewport — the visible area plus a
 * hard-coded 1000px that no option can widen — so the editor's DOM holds roughly
 * one screenful of the note. Reading it exported the visible part and silently
 * dropped the rest.
 *
 * Everything async is supplied here rather than inside the renderer, so the
 * renderer itself stays a pure function of the markdown and can be unit tested.
 */
async function buildExportBody(markdown: string): Promise<string> {
  const { resolvedMode, currentFilePath } = useStore.getState();

  // Loaded up front so the renderer's maths callback can stay synchronous.
  let katex: typeof import("katex") | null = null;
  try { katex = await import("katex"); } catch { /* formulas stay as source */ }
  let mermaid: typeof import("mermaid")["default"] | null = null;
  try { mermaid = (await import("mermaid")).default; } catch { /* diagrams stay as source */ }

  return renderMarkdownToHtml(markdown, {
    tocTitle: t().editor.tocTitle,
    resolveImage: src => {
      try { return resolveImageUrl(src, currentFilePath); } catch { return src; }
    },
    renderMath: (source, display) => {
      if (!katex) return null;
      try {
        // MathML, not KaTeX's HTML. KaTeX's HTML needs its stylesheet AND its
        // webfonts, which it references by relative path — a standalone export has
        // no such folder beside it, so every formula would fall back to a
        // substitute face. MathML is typeset by the browser itself, so the file
        // stays self-contained. The preview keeps the HTML form, which does have
        // the fonts alongside it.
        return katex.renderToString(source, { displayMode: display, throwOnError: true, output: "mathml" });
      } catch {
        return null;
      }
    },
    renderMermaid: async source => {
      if (!mermaid) return null;
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedMode === "dark" ? "dark" : "default",
          securityLevel: "antiscript",
          fontFamily: currentFontStack(),
        });
        const id = "zn-exp-" + Math.random().toString(36).slice(2, 8);
        const { svg } = await mermaid.render(id, source);
        return sanitizeSvg(svg);
      } catch {
        return null;
      }
    },
  });
}

// Collect the CURRENTLY-RESOLVED values of every CSS custom property the app
// defines, read straight from the live computed styles. Emitting them concretely
// guarantees the export uses exactly the colours and fonts the user sees,
// whichever theme is active, without copying any of the app's own rules.
function collectResolvedVariables(): string {
  const names = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule) {
          const re = /--[\w-]+/g;
          let m;
          while ((m = re.exec(rule.style.cssText))) names.add(m[0]);
        }
      }
    } catch { /* cross-origin */ }
  }
  const rootCS = getComputedStyle(document.documentElement);
  const rootVars: string[] = [];
  for (const name of names) {
    const value = rootCS.getPropertyValue(name).trim();
    if (value) rootVars.push(name + ":" + value + ";");
  }
  return ":root{" + rootVars.join("") + "}";
}

function buildExportHtml(bodyHtml: string, title: string): string {
  // Match the current theme attributes so the emitted variables resolve.
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const themeId = root.getAttribute("data-theme") || "claude";
  const dataFont = root.getAttribute("data-font") || "claude";

  return (
    "<!DOCTYPE html>\n" +
    '<html lang="zh-CN" class="' + (isDark ? "dark" : "") + '" data-theme="' + themeId + '" data-font="' + dataFont + '">\n' +
    "<head>\n" +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<title>" + title + "</title>\n" +
    "<style>\n" +
    // The app's own resolved custom properties, then the export stylesheet.
    collectResolvedVariables() + "\n" +
    EXPORT_STYLES +
    "</style>\n" +
    "</head>\n" +
    "<body>\n" +
    bodyHtml + "\n" +
    "</body>\n</html>"
  );
}

export async function exportToHtml(content: string, filePath: string) {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const bodyHtml = await buildExportBody(content);
    const name = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, "") || "Note";
    const html = buildExportHtml(bodyHtml, name);
    const defaultPath = filePath.replace(/\.md$/, ".html");
    const savePath = await save({ defaultPath, filters: [{ name: "HTML", extensions: ["html"] }] });
    if (savePath && typeof savePath === "string") {
      await invoke("write_file", { path: savePath, content: html });
    }
  } catch { /* */ }
}

// Simple toast feedback (used for export results).
function showToast(message: string, isError = false) {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.style.cssText = "padding:8px 18px;border-radius:8px;font-size:13px;color:#fff;background:" + (isError ? "#DC2626" : "#16A34A") + ";box-shadow:0 4px 12px rgba(0,0,0,0.25);opacity:0;transition:opacity 200ms ease;white-space:nowrap;";
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

// Shared toast container.
function ensureToastHost(): HTMLElement {
  let host = document.getElementById("zn-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "zn-toast-host";
    host.style.cssText = "position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;";
    document.body.appendChild(host);
  }
  return host;
}

// Persistent "loading" toast with a spinner. Returns a function that dismisses it.
function showLoadingToast(message: string): () => void {
  const host = ensureToastHost();
  if (!document.getElementById("zn-toast-spinner-style")) {
    const style = document.createElement("style");
    style.id = "zn-toast-spinner-style";
    style.textContent = "@keyframes zn-toast-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);
  }
  const el = document.createElement("div");
  el.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 18px;border-radius:8px;font-size:13px;color:#fff;background:#2563EB;box-shadow:0 4px 12px rgba(0,0,0,0.25);opacity:0;transition:opacity 200ms ease;white-space:nowrap;";
  const spinner = document.createElement("span");
  spinner.style.cssText = "width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:zn-toast-spin 0.8s linear infinite;flex-shrink:0;";
  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(spinner);
  el.appendChild(text);
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; });
  let dismissed = false;
  return () => {
    if (dismissed) return;
    dismissed = true;
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  };
}

// Debug logger: appends to a file via the Rust `export_debug_log` command so it
// works in release builds (no devtools). Returns the log file path.
let dbgLogPath = "";
async function dbg(msg: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    dbgLogPath = await invoke<string>("export_debug_log", { msg });
  } catch { /* logging must never break the export */ }
}

// Encode a UTF-8 string as base64 (for building a data: URL).
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

// PDF export (Typora-style): render the styled document into an off-screen
// webview and ask WebView2 to print it straight to a PDF file — no print dialog.
//
// The export HTML is loaded as a base64 data: URL set as the window's INITIAL
// url. (We previously loaded index.html and then called WebView2
// NavigateToString, but that navigation never completed and left a pending
// navigation that made PrintToPdf block the UI thread → the app froze.) A data:
// URL loads as a normal, self-contained document with no pending navigation.
export async function exportToPdf(content: string, filePath: string) {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await dbg("=== exportToPdf start ===");
    const bodyHtml = await buildExportBody(content);
    const name = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, "") || "Note";
    const html = buildExportHtml(bodyHtml, name);
    await dbg("html built, length=" + html.length);

    const defaultPath = filePath.replace(/\.md$/, ".pdf");
    const savePath = await save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!savePath || typeof savePath !== "string") {
      await dbg("save cancelled");
      return;
    }
    await dbg("savePath=" + savePath);

    // Show a persistent loading indicator for the duration of the export.
    const dismissLoading = showLoadingToast("正在导出 PDF…");

    const label = "pdf-export-" + Date.now();
    const dataUrl = "data:text/html;base64," + utf8ToBase64(html);
    await dbg("creating WebviewWindow label=" + label + " dataUrl length=" + dataUrl.length);

    // Guard so the export only ever starts once (created-event OR fallback timer).
    let started = false;
    const startExport = (via: string) => {
      if (started) return;
      started = true;
      dbg("startExport via " + via).then(() => {
        invoke("export_pdf", { label, path: savePath })
          .then(() => { dbg("export_pdf SUCCESS"); dismissLoading(); showToast("PDF 导出成功 ✓"); })
          .catch((err: unknown) => {
            dbg("export_pdf FAILED: " + String(err));
            dismissLoading();
            showToast("PDF 导出失败: " + String(err) + " 日志: " + dbgLogPath, true);
          });
      });
    };

    try {
      // The render window is created HIDDEN. The Rust side makes it fully
      // transparent (alpha=0) and THEN shows it, so WebView2 renders (PrintToPdf
      // works) but the user never sees any window — no flash, no popup, regardless
      // of monitor layout/DPI. (A merely off-screen window gets clamped on-screen
      // on some setups; transparency guarantees invisibility.)
      const win = new WebviewWindow(label, {
        title: name,
        width: 200,
        height: 150,
        visible: false,
        x: -2000,
        y: -2000,
        url: dataUrl,
        skipTaskbar: true,
        focus: false,
        focusable: false,
        decorations: false,
        resizable: false,
      });
      win.once("tauri://created", () => {
        dbg("window created OK");
        // Rust shows the (transparent) window and settles before printing.
        setTimeout(() => startExport("created-event"), 150);
      });
      win.once("tauri://error", (e: unknown) => {
        let detail = "";
        try {
          const anyE = e as { payload?: unknown };
          detail = JSON.stringify(anyE?.payload ?? e) || String(e);
        } catch { detail = String(e); }
        dbg("window tauri://error: " + detail).then(() => {
          dismissLoading();
          showToast("PDF 导出失败: 无法创建渲染窗口 [" + detail + "] 日志: " + dbgLogPath, true);
        });
      });
    } catch (e) {
      await dbg("WebviewWindow constructor threw: " + String(e));
      dismissLoading();
      showToast("PDF 导出失败: 无法创建渲染窗口: " + String(e), true);
      return;
    }
    // Fallback: if the created event never fires (event delivery issue), attempt
    // the export anyway — the window may still have been created.
    setTimeout(() => startExport("timeout-fallback"), 4000);
  } catch (err) {
    dbg("exportToPdf exception: " + String(err)).then(() => {
      showToast("PDF 导出失败: " + String(err), true);
    });
  }
}

// Test helper: build the full export HTML for the current editor content.
export async function generateExportHtml(content: string): Promise<string> {
  const bodyHtml = await buildExportBody(content);
  return buildExportHtml(bodyHtml, "export");
}
