// Shared note-export helpers (HTML / PDF), used by both the titlebar menu and shortcuts.
//
// The exported document reuses the LIVE editor styles: we walk the app's loaded
// stylesheets, keep the rules that style the editor content (plus the theme
// variable blocks), and embed them together with the current theme/font
// attributes. This makes the export match the on-screen preview closely.

import { currentFontStack } from "./fontStack";

// Selectors worth copying: theme variable blocks + anything that styles content.
const KEEP_RE = /:root|\[data-theme|\[data-font|\.dark|\.milkdown|\.ProseMirror|(^|[\s,>+~(])(h[1-6]|p|blockquote|pre|code|table|thead|tbody|tr|th|td|ul|ol|li|dl|dt|dd|a|strong|em|del|s|hr|img|mark|sub|sup|figure|figcaption|\.katex|\.cm-|\.zn-html-render|\.zn-toc|\.zn-fm)/;

function collectEditorCss(): string {
  const out: string[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (KEEP_RE.test(rule.selectorText)) out.push(rule.cssText);
      } else if (rule instanceof CSSMediaRule) {
        const inner: string[] = [];
        for (const r of Array.from(rule.cssRules)) {
          if (r instanceof CSSStyleRule && KEEP_RE.test(r.selectorText)) inner.push(r.cssText);
        }
        if (inner.length) out.push("@media " + rule.media.mediaText + " {\n" + inner.join("\n") + "\n}");
      } else if (rule instanceof CSSSupportsRule) {
        const inner: string[] = [];
        for (const r of Array.from(rule.cssRules)) {
          if (r instanceof CSSStyleRule && KEEP_RE.test(r.selectorText)) inner.push(r.cssText);
        }
        if (inner.length) out.push("@supports " + rule.conditionText + " {\n" + inner.join("\n") + "\n}");
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules); } catch { /* cross-origin sheet, skip */ }
  }
  return out.join("\n");
}

// Detect whether a code block is a mermaid diagram and return its source.
// Rendered blocks expose the language via the .language-button text; unrendered
// (lazy placeholder) blocks have no language UI, so fall back to matching the
// source against known mermaid diagram-type keywords.
const MERMAID_KEYWORDS = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|zenuml|sankey|xychart|block)\b/;
function getMermaidSource(cb: Element): string | null {
  const codeEl = cb.querySelector(".cm-content") || cb.querySelector(".milkdown-code-block-placeholder code") || cb.querySelector("code");
  const source = codeEl ? (codeEl.textContent || "") : "";
  const langBtn = cb.querySelector(".language-button");
  if (langBtn) {
    return langBtn.textContent && langBtn.textContent.trim().toLowerCase() === "mermaid" ? source : null;
  }
  return MERMAID_KEYWORDS.test(source) ? source : null;
}

// Render any mermaid diagram that has not been rendered yet in the editor.
// Code blocks are lazily initialised (only when scrolled into view), so a
// diagram below the fold would otherwise be exported as raw source. This runs
// on the DETACHED clone, so it never disturbs the live ProseMirror document.
async function ensureMermaidRendered(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll(".milkdown-code-block"));
  const pending = blocks.filter(cb => !cb.querySelector(".preview svg") && getMermaidSource(cb) != null);
  if (!pending.length) return;
  try {
    const mermaidMod = await import("mermaid");
    const { useStore } = await import("../store");
    const isDark = useStore.getState().resolvedMode === "dark";
    mermaidMod.default.initialize({ startOnLoad: false, theme: isDark ? "dark" : "default", securityLevel: "loose", fontFamily: currentFontStack() });
    for (const cb of pending) {
      const source = getMermaidSource(cb);
      if (source == null) continue;
      try {
        const id = "zn-exp-" + Math.random().toString(36).slice(2, 8);
        const { svg } = await mermaidMod.default.render(id, source.trim());
        let preview = cb.querySelector(".preview");
        if (!preview) {
          let panel = cb.querySelector(".preview-panel");
          if (!panel) {
            panel = document.createElement("div");
            panel.className = "preview-panel";
            cb.appendChild(panel);
          }
          preview = document.createElement("div");
          preview.className = "preview";
          panel.appendChild(preview);
        }
        preview.innerHTML = svg;
      } catch { /* leave this block as source code */ }
    }
  } catch { /* mermaid unavailable; blocks stay as source */ }
}

// Serialize the rendered editor content, stripping editing chrome (zoom buttons,
// code-block toolbars, block-edit handles) and normalising code blocks so the
// output is clean, portable HTML.
async function serializeEditorContent(fallbackContent: string): Promise<string> {
  const editorEl = document.querySelector(".ProseMirror") as HTMLElement | null;
  if (!editorEl) {
    return fallbackContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }
  const clone = editorEl.cloneNode(true) as HTMLElement;

  // Remove editing-only UI chrome.
  clone.querySelectorAll(
    '.zn-mermaid-zoom-btn, .preview-toggle-button, .language-selector, [class*="block-edit"], [class*="crepe-toolbar"], .milkdown-cursor, .ProseMirror-trailingBreak'
  ).forEach(el => el.remove());

  // Render mermaid diagrams that were not yet rendered in the editor (lazy init).
  await ensureMermaidRendered(clone);

  // Normalise code blocks: keep mermaid SVGs and rendered LaTeX, turn other
  // CodeMirror content into plain <pre><code>.
  clone.querySelectorAll(".milkdown-code-block").forEach(cb => {
    const svg = cb.querySelector(".preview svg");
    if (svg) {
      const wrap = document.createElement("div");
      wrap.className = "zn-export-mermaid";
      const clonedSvg = svg.cloneNode(true) as SVGElement;
      clonedSvg.removeAttribute("style");
      clonedSvg.setAttribute("style", "max-width:100%;height:auto;");
      wrap.appendChild(clonedSvg);
      cb.replaceWith(wrap);
      return;
    }
    // LaTeX blocks: keep the rendered KaTeX output instead of the raw source.
    const preview = cb.querySelector(".preview") as HTMLElement | null;
    if (preview && preview.querySelector(".katex")) {
      const wrap = document.createElement("div");
      wrap.className = "zn-export-latex";
      wrap.innerHTML = preview.innerHTML;
      cb.replaceWith(wrap);
      return;
    }
    const codeText = (cb.querySelector(".cm-content")?.textContent) || cb.textContent || "";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = codeText.replace(/\n$/, "");
    pre.appendChild(code);
    cb.replaceWith(pre);
  });

  // Normalise raw-HTML blocks: the editor wraps them in a <span data-type="html">,
  // but block-level content inside a <span> is invalid HTML and gets mangled when
  // the export is re-parsed for PDF. Convert block ones to <div>. If the block was
  // being edited at export time (a source <textarea> is present), render its value.
  clone.querySelectorAll('span[data-type="html"]').forEach(span => {
    const isBlock = span.classList.contains("zn-html-block");
    const ta = span.querySelector(".zn-html-textarea") as HTMLTextAreaElement | null;
    const wrap = document.createElement(isBlock ? "div" : "span");
    wrap.className = "zn-html-render" + (isBlock ? " zn-html-block" : "");
    if (ta) {
      wrap.textContent = "";
      wrap.innerHTML = renderRawHtmlForExport(ta.value);
    } else {
      wrap.innerHTML = span.innerHTML;
    }
    span.replaceWith(wrap);
  });

  return clone.innerHTML;
}

// Minimal sanitizer for the rare "html block was being edited at export time"
// case (mirrors the editor's sanitizeHtml).
function renderRawHtmlForExport(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("script, iframe, object, embed, link, meta, base").forEach(el => el.remove());
  tpl.content.querySelectorAll("*").forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name === "src") && attr.value.trim().toLowerCase().startsWith("javascript:")) el.removeAttribute(attr.name);
    }
  });
  return tpl.innerHTML;
}

// Collect the CURRENTLY-RESOLVED values of every CSS custom property used by
// the app, read straight from the live computed styles. Emitting these as
// concrete :root / .milkdown blocks guarantees the export uses exactly the
// colors/fonts the user sees, regardless of which theme rules get copied.
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
  const milkEl = document.querySelector(".milkdown");
  const milkCS = milkEl ? getComputedStyle(milkEl) : null;
  const rootVars: string[] = [];
  const milkVars: string[] = [];
  for (const name of names) {
    const rv = rootCS.getPropertyValue(name).trim();
    if (rv) rootVars.push(name + ":" + rv + ";");
    if (milkCS) {
      const mv = milkCS.getPropertyValue(name).trim();
      if (mv && mv !== rv) milkVars.push(name + ":" + mv + ";");
    }
  }
  let out = ":root{" + rootVars.join("") + "}";
  if (milkVars.length) out += "\n.milkdown{" + milkVars.join("") + "}";
  return out;
}

function buildExportHtml(bodyHtml: string, title: string): string {
  // Match the current app theme attributes so any copied theme rules resolve.
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const themeId = root.getAttribute("data-theme") || "zen";
  const dataFont = root.getAttribute("data-font") || "sans";
  const css = collectEditorCss();
  const vars = collectResolvedVariables();

  return (
    "<!DOCTYPE html>\n" +
    '<html lang="zh-CN" class="' + (isDark ? "dark" : "") + '" data-theme="' + themeId + '" data-font="' + dataFont + '">\n' +
    "<head>\n" +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<title>" + title + "</title>\n" +
    "<style>\n" +
    // Concrete resolved variables first (exact WYSIWYG colors/fonts), then the
    // copied structural rules, then a small base layout.
    vars + "\n" +
    css + "\n" +
    "*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}\n" +
    "html,body{margin:0;padding:0;background:var(--bg-editor,#fff);color:var(--text-primary,#1a1a1a);}\n" +
    "body{max-width:860px;margin:0 auto;padding:40px 24px;font-family:var(--zn-font-stack,'Microsoft YaHei',sans-serif);}\n" +
    ".zn-export-mermaid{margin:1em 0;text-align:center;}\n" +
    ".zn-export-latex{margin:1em 0;overflow-x:auto;}\n" +
    "@media print{body{max-width:none;padding:12mm;}}\n" +
    "</style>\n" +
    "</head>\n" +
    "<body>\n" +
    '<div class="milkdown"><div class="ProseMirror">' + bodyHtml + "</div></div>\n" +
    "</body>\n</html>"
  );
}

export async function exportToHtml(content: string, filePath: string) {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const bodyHtml = await serializeEditorContent(content);
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
    const bodyHtml = await serializeEditorContent(content);
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
  const bodyHtml = await serializeEditorContent(content);
  return buildExportHtml(bodyHtml, "export");
}
