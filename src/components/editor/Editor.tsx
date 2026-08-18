import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../../store";
import { FindReplaceBar } from "./FindReplaceBar";
import { TableContextMenu } from "./TableContextMenu";
import { startTableDragSelect } from "./tableDragSelect";
import type { SavedCellSelection } from "./tableCommands";
import { SourceEditor } from "./SourceEditor";
import { znFindKey, emptyFindState, type ZnFindState, type ZnFindMeta } from "./findState";
import { isHttpUrl, collectMatchesFromDoc } from "../../lib/findQuery";
import { fitContainScale } from "../../lib/imageZoom";
import { znCodeHighlightStyle } from "./codeHighlight";
import { t } from "../../i18n";
import { writeFile } from "../../services";
import { saveImage, resolveImageUrl } from "../../services";
import { currentFontStack } from "../../lib/fontStack";
import "@milkdown/crepe/theme/common/style.css";
// KaTeX 字体/排版样式：Crepe 的 Latex feature 已启用，但公式渲染依赖此 CSS。
import "katex/dist/katex.min.css";
import { LanguageDescription, LanguageSupport, StreamLanguage, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";
import { EditorState as CMEditorState } from "@codemirror/state";

// 代码块高亮样式已迁移至 ./codeHighlight（与源码模式编辑器共用）。

// Mermaid 无需语法高亮（内容会被渲染为图表），用纯文本占位语言。
// 将其注入 @codemirror/language-data 的共享语言列表（Crepe 默认配置直接引用该列表），
// 从而使代码块语言选择器可选 mermaid。name 小写会被 LanguageDescription 自动加入 alias。
const mermaidLanguage = LanguageDescription.of({
  name: "mermaid",
  alias: ["mmd"],
  support: new LanguageSupport(
    StreamLanguage.define<unknown>({
      token: (stream) => {
        stream.skipToEnd();
        return null;
      },
    }),
  ),
});
if (!codeMirrorLanguages.some((l) => l.name === "mermaid")) {
  codeMirrorLanguages.unshift(mermaidLanguage);
}

// Sanitize raw HTML before rendering (local notes, but strip obvious hazards).
// Uses <template> so nothing executes during parsing.
function sanitizeHtml(html: string): string {
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

// Render simple markdown (links/bold/italic/code/lists) inside an HTML block's
// inner text — Typora also processes markdown within block-level HTML tags.
function renderInnerMarkdown(text: string): string {
  let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = s.split("\n");
  let out = "", inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { out += "<ul>"; inList = true; }
      out += "<li>" + trimmed.replace(/^[-*]\s+/, "") + "</li>";
    } else {
      if (inList) { out += "</ul>"; inList = false; }
      if (trimmed) out += "<p>" + trimmed + "</p>";
    }
  }
  if (inList) out += "</ul>";
  return out;
}

// Whether a raw-HTML value is block-level (multi-line or starts with a block tag).
function isBlockHtml(value: string): boolean {
  return /\n/.test(value) || /^<(div|p|h[1-6]|ul|ol|dl|table|blockquote|pre|section|article|cite|figure|details|header|footer|nav|aside|hr|form|fieldset|address|center)/i.test(value.trim());
}

// Produce the innerHTML for a rendered raw-HTML node. If the block is a single
// tag pair whose inner content is pure markdown (no nested HTML), render the
// inner markdown too (Typora processes markdown inside block-level HTML).
function renderHtmlValue(value: string): string {
  const block = isBlockHtml(value);
  const m = block ? value.trim().match(/^<(\w+)([^>]*)>([\s\S]*)<\/\1>\s*$/) : null;
  if (m && !m[3].includes("<")) {
    return sanitizeHtml("<" + m[1] + m[2] + ">" + renderInnerMarkdown(m[3]) + "</" + m[1] + ">");
  }
  return sanitizeHtml(value);
}

// Typora-style node view for the raw-HTML node: shows the RENDERED html by
// default; clicking it swaps in an editable <textarea> of the raw source;
// blurring the textarea saves the edited source back to the node and re-renders.
// This makes html blocks selectable/editable without the "typing replaces
// everything" data-loss of a plain atom node.
function createHtmlNodeView(node: any, view: any, getPos: any) {
  let currentNode = node;
  let editing = false;
  const dom = document.createElement("span");
  dom.setAttribute("data-type", "html");

  const renderPreview = () => {
    editing = false;
    dom.className = "zn-html-node zn-html-render" + (isBlockHtml(currentNode.attrs.value) ? " zn-html-block" : "");
    dom.innerHTML = renderHtmlValue(currentNode.attrs.value);
  };

  const enterEdit = () => {
    editing = true;
    dom.className = "zn-html-node zn-html-source" + (isBlockHtml(currentNode.attrs.value) ? " zn-html-block" : "");
    dom.innerHTML = "";
    const ta = document.createElement("textarea");
    ta.className = "zn-html-textarea";
    ta.value = currentNode.attrs.value;
    ta.spellcheck = false;
    ta.addEventListener("blur", () => {
      if (!editing) return;
      editing = false;
      const newValue = ta.value;
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos != null && newValue !== currentNode.attrs.value) {
        // Persist the edited source; update() will re-render the preview.
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { value: newValue }));
      } else {
        renderPreview();
      }
    });
    dom.appendChild(ta);
    ta.focus();
  };

  dom.addEventListener("mousedown", (e) => {
    if (!editing) {
      // Stop ProseMirror from selecting/replacing the atom; we handle the click.
      e.stopPropagation();
      e.preventDefault();
      enterEdit();
    }
  });

  renderPreview();

  return {
    dom,
    update: (newNode: any) => {
      if (newNode.type !== currentNode.type) return false;
      currentNode = newNode;
      if (!editing) renderPreview();
      return true;
    },
    // While editing, let the textarea handle all events (ProseMirror ignores them).
    stopEvent: () => editing,
    // ProseMirror must not react to our DOM changes inside the node view.
    ignoreMutation: () => true,
    destroy: () => { editing = false; },
  };
}

// ── Typora-parity extras: [TOC] table of contents, YAML frontmatter, footnote nav ──

// TextSelection class used by TOC click-to-jump (assigned once init loads prose/state).
let pmTextSelection: any = null;

// Registry of live TOC views in the current editor; refreshed together on doc changes.
const tocRefreshers = new Set<() => void>();

// Find the editor's REAL scroll container. Crepe wraps .ProseMirror in
// non-scrolling divs (.milkdown), so `.ProseMirror.parentElement` is NOT the
// scroll element — reading/writing its scrollTop silently does nothing, which
// broke scroll save/restore and made the page jump to the top whenever the
// editor was re-created (observed as random auto-scrolling while idle).
function editorScrollEl(root: ParentNode): HTMLElement | null {
  let el = root.querySelector(".ProseMirror") as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
    el = el.parentElement;
  }
  return null;
}

// Collect all heading nodes (position + level + text) for TOC rendering.
function collectHeadingInfos(doc: any): Array<{ pos: number; level: number; text: string }> {
  const out: Array<{ pos: number; level: number; text: string }> = [];
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === "heading") {
      out.push({ pos: pos + 1, level: node.attrs.level || 1, text: node.textContent || "" });
    }
  });
  return out;
}

// Typora-style TOC node view: renders the clickable heading list. A ProseMirror
// plugin (znTocRefresh) calls refresh() whenever the document changes.
function createTocNodeView(node: any, view: any) {
  const dom = document.createElement("div");
  dom.setAttribute("data-type", "zn-toc");
  dom.className = "zn-toc";

  const refresh = () => {
    try {
      const headings = collectHeadingInfos(view.state.doc);
      dom.innerHTML = "";
      const title = document.createElement("div");
      title.className = "zn-toc-title";
      title.textContent = t().editor.tocTitle;
      dom.appendChild(title);
      const ul = document.createElement("ul");
      ul.className = "zn-toc-list";
      if (!headings.length) {
        const li = document.createElement("li");
        li.className = "zn-toc-empty";
        li.textContent = t().outline.noHeadings;
        ul.appendChild(li);
      } else {
        for (const h of headings) {
          const li = document.createElement("li");
          li.className = "zn-toc-item zn-toc-level-" + Math.min(Math.max(h.level, 1), 6);
          li.dataset.pos = String(h.pos);
          li.textContent = h.text || "\u2026";
          ul.appendChild(li);
        }
      }
      dom.appendChild(ul);
    } catch (err) { console.warn("toc-refresh-failed", err); }
  };

  dom.addEventListener("mousedown", (e) => {
    const li = (e.target as HTMLElement).closest("li.zn-toc-item") as HTMLElement | null;
    if (!li || !pmTextSelection) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = Number(li.dataset.pos);
    if (!Number.isFinite(pos) || pos < 0 || pos > view.state.doc.content.size) return;
    try {
      // Move the caret into the heading WITHOUT scrollIntoView, then scroll the
      // heading itself to the TOP of the viewport — same behavior as clicking an
      // entry in the Outline panel (ProseMirror's default scroll may leave the
      // heading at the bottom edge of the view).
      view.dispatch(view.state.tr.setSelection(pmTextSelection.create(view.state.doc, pos)));
      const headingDom = view.nodeDOM(pos - 1) as HTMLElement | null;
      window.requestAnimationFrame(() => {
        if (headingDom && typeof headingDom.scrollIntoView === "function") {
          headingDom.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      });
      view.focus();
    } catch (err) { console.warn("toc-jump-failed", err); }
  });

  tocRefreshers.add(refresh);
  refresh();

  return {
    dom,
    // Content is derived from the doc (refresh-driven); only type identity matters.
    update: (newNode: any) => newNode.type === node.type,
    stopEvent: (e: Event) => !!((e.target as HTMLElement | null)?.closest?.("li")),
    ignoreMutation: () => true,
    destroy: () => { tocRefreshers.delete(refresh); },
  };
}

// YAML frontmatter node view: rendered as a compact card by default; clicking
// swaps in an editable <textarea> of the raw YAML; blurring saves it back into
// attrs.value (the serializer emits proper `---` fences).
function createFrontmatterNodeView(node: any, view: any, getPos: any) {
  let currentNode = node;
  let editing = false;
  const dom = document.createElement("div");
  dom.setAttribute("data-type", "frontmatter");

  const renderPreview = () => {
    editing = false;
    dom.className = "zn-fm-node zn-fm-preview";
    dom.innerHTML = "";
    const label = document.createElement("div");
    label.className = "zn-fm-label";
    label.textContent = "YAML";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = currentNode.attrs.value || "";
    pre.appendChild(code);
    dom.appendChild(label);
    dom.appendChild(pre);
  };

  const enterEdit = () => {
    editing = true;
    dom.className = "zn-fm-node zn-fm-source";
    dom.innerHTML = "";
    const ta = document.createElement("textarea");
    ta.className = "zn-fm-textarea";
    ta.value = currentNode.attrs.value;
    ta.spellcheck = false;
    ta.addEventListener("blur", () => {
      if (!editing) return;
      editing = false;
      const newValue = ta.value;
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos != null && newValue !== currentNode.attrs.value) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { value: newValue }));
      } else {
        renderPreview();
      }
    });
    dom.appendChild(ta);
    ta.focus();
  };

  dom.addEventListener("mousedown", (e) => {
    if (!editing) {
      e.stopPropagation();
      e.preventDefault();
      enterEdit();
    }
  });

  renderPreview();

  return {
    dom,
    update: (newNode: any) => {
      if (newNode.type !== currentNode.type) return false;
      currentNode = newNode;
      if (!editing) renderPreview();
      return true;
    },
    stopEvent: () => editing,
    ignoreMutation: () => true,
    destroy: () => { editing = false; },
  };
}

// ---- Document find matching (znFind plugin) ----
// Match collection lives in lib/findQuery (collectMatchesFromDoc) so it is
// unit-testable without ProseMirror.

export function Editor() {
  const currentFilePath = useStore(s => s.currentFilePath);
  const sourceMode = useStore(s => s.sourceMode);
  // Bumped by the workspace watcher when the CURRENT file is reloaded from
  // disk (external change): re-runs this effect so the reuse path swaps the
  // document in place.
  const reloadTick = useStore(s => s.reloadTick);
  const setCursorPosition = useStore(s => s.setCursorPosition);
  // NOTE: scrollPosition is intentionally NOT subscribed here — reading it via
  // useStore would re-run the editor init effect every time the periodic scroll
  // saver updates the store, which re-creates the editor and force-scrolls the
  // page (observed as random auto-scrolling while idle).
  const setScrollPosition = useStore(s => s.setScrollPosition);
  const setEditorRef = useStore(s => s.setEditorRef);
  const editorPadding = useStore(s => s.editorPadding);
  const resolvedMode = useStore(s => s.resolvedMode);
  const fontFamily = useStore(s => s.fontFamily);
  const setSourceMode = useStore(s => s.setSourceMode);
  const [error, setError] = useState<string | null>(null);
  const [findVisible, setFindVisible] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  // Table context menu state
  const [tableMenuVisible, setTableMenuVisible] = useState(false);
  const [tableMenuPos, setTableMenuPos] = useState({ x: 0, y: 0 });
  // The multi-cell selection active when the table menu opened (re-applied
  // before each command so row/column actions target the chosen cells).
  const [tableMenuSel, setTableMenuSel] = useState<SavedCellSelection | null>(null);
  // Copy context menu state (right-click with text selected)
  const [copyMenuVisible, setCopyMenuVisible] = useState(false);
  const [copyMenuPos, setCopyMenuPos] = useState({ x: 0, y: 0 });
  // Image alignment toolbar state (click an image to align it)
  const [imgAlignMenu, setImgAlignMenu] = useState<{ visible: boolean; x: number; y: number; pos: number; align: string }>({ visible: false, x: 0, y: 0, pos: -1, align: "center" });

  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<any>(null);
  // CodeMirror source editor instance (exposed to FindReplaceBar).
  const cmViewRef = useRef<any>(null);
  const safeRef = useRef<boolean>(true);
  const tokenRef = useRef<object | null>(null);
  const scrollSaveTimer = useRef<number>(0);
  const focusCleanupRef = useRef<(() => void) | null>(null);
  const editorReadyRef = useRef(false);
  // ProseMirror view ref (set after editor init) so effects can dispatch transactions.
  const pmViewRef = useRef<any>(null);
  // Preset query for the find bar (set when jumping in from global search).
  const [findPreset, setFindPreset] = useState<{ query: string; ts: number } | null>(null);
  // Large-document hint: suggest source mode for very long notes.
  const [bigFileHint, setBigFileHint] = useState(false);
  // Bumped when instance-reuse fails so the init effect re-runs a full create.
  const [reuseFailTick, setReuseFailTick] = useState(0);
  // Zoom overlay opener (assigned inside the init closure; used by image click).
  const openZoomRef = useRef<(el: SVGElement | HTMLImageElement) => void>(() => {});
  // True while tryReuse() is swapping the document: replaceAll fires
  // markdownUpdated with the RE-SERIALIZED markdown, which can differ from the
  // raw file (formatting normalization). Without this guard the new file would
  // be marked dirty and autosaved with the normalized content — silently
  // rewriting the user's file just because they switched tabs.
  const reuseInProgressRef = useRef(false);
  // In-flight Crepe teardown. Crepe.destroy() is async — destroy/create on the
  // same container MUST be serialized, otherwise the old instance's teardown
  // wipes the freshly mounted DOM (the editor area turns blank after closing a
  // tab). Every destroy is chained through this promise; init awaits it before
  // creating a new instance.
  const pendingDestroyRef = useRef<Promise<void> | null>(null);

  // Registry of rendered mermaid blocks: applyPreview callback -> mermaid source.
  // applyPreview updates Milkdown's internal preview ref (the source of truth),
  // so re-rendering through it survives theme/font changes without being reverted.
  const mermaidApplyPreviews = useRef(new Map<(v: null | string | HTMLElement) => void, string>());

  // Initialize Milkdown Crepe editor
  useEffect(() => {
    const path = currentFilePath;
    const container = containerRef.current;
    if (!container) return;

    // Chain every teardown: the async destroy of a previous instance must
    // finish before the next destroy/create touches the same container.
    const destroyCrepe = (crepe: any): Promise<void> => {
      const prev = pendingDestroyRef.current ?? Promise.resolve();
      pendingDestroyRef.current = prev.then(() =>
        Promise.resolve(crepe.destroy()).catch((err: any) => { console.warn("editor-destroy-failed", err); })
      );
      return pendingDestroyRef.current;
    };

    const invalidate = () => {
      tokenRef.current = null;
      safeRef.current = false;
      editorReadyRef.current = false;
      focusCleanupRef.current?.();
    };

    // Nothing to show (no file open, or source mode): tear the editor down.
    // This also covers "closing the current tab left no other tab".
    if (!path || sourceMode) {
      invalidate();
      setEditorReady(false);
      setEditorRef(null);
      if (crepeRef.current) {
        const old = crepeRef.current;
        crepeRef.current = null;
        pmViewRef.current = null;
        void destroyCrepe(old);
      }
      container.innerHTML = "";
      return;
    }

    // Full teardown, used by the reuse-failure fallback and by init().
    const destroyEditor = () => {
      invalidate();
      if (crepeRef.current) {
        const old = crepeRef.current;
        crepeRef.current = null;
        pmViewRef.current = null;
        void destroyCrepe(old);
      }
    };

    // ---- Instance reuse (performance) ----
    // Switching files in WYSIWYG mode swaps the document in place instead of
    // destroying/re-creating Crepe — avoids rebuilding the ProseMirror view,
    // node views and all plugins. The undo history is reset so the new file
    // never inherits the previous file's history. On any failure we tear down
    // and bump reuseFailTick so the effect re-runs the full init path.
    const tryReuse = async () => {
      const prevCrepe = crepeRef.current;
      try {
        const docContent = useStore.getState().content || "";
        mermaidApplyPreviews.current.clear();
        const { replaceAll } = await import("@milkdown/kit/utils");
        reuseInProgressRef.current = true;
        try {
          prevCrepe.editor.action(replaceAll(docContent));
        } finally {
          reuseInProgressRef.current = false;
        }
        // Rebuild the EditorState with the SAME plugins: plugin states (history,
        // decorations) are re-initialized, selection moves to the doc start.
        const { EditorState: PMState, Selection } = await import("@milkdown/kit/prose/state");
        const pmView = pmViewRef.current;
        if (!pmView) throw new Error("pm-view-lost");
        pmView.updateState(PMState.create({
          doc: pmView.state.doc,
          selection: Selection.atStart(pmView.state.doc),
          plugins: pmView.state.plugins,
        }));
        // Restore this file's saved scroll position (per-file cache first).
        const st = useStore.getState();
        const saved = st.fileStates.get(path)?.scrollPos ?? st.scrollPosition;
        if (saved > 0) {
          setTimeout(() => {
            const scrollEl = editorScrollEl(container);
            if (scrollEl) scrollEl.scrollTop = saved;
          }, 120);
        }
        setBigFileHint(docContent.split("\n").length > 5000);
      } catch (err) {
        console.warn("editor-reuse-failed", err);
        destroyEditor();
        setReuseFailTick(v => v + 1);
      }
    };

    const token = {};
    tokenRef.current = token;
    safeRef.current = false;
    setError(null);

    // A fully-initialized instance survived the switch (tab switch, or
    // closing the current tab while other tabs remain): swap the document in
    // place — no destroy/rebuild, no blank/loading flash. editorReadyRef is
    // true only after init() completed, so a half-created instance (init
    // still awaiting create()) falls through to init(), which tears it down
    // first.
    if (crepeRef.current && editorReadyRef.current && pmViewRef.current) {
      void tryReuse();
      return () => {
        // Abort any in-flight async init work from this run; the instance
        // itself is NOT destroyed here — the next effect run decides whether
        // to reuse it (file switch) or tear it down (no file left / source
        // mode / unmount).
        tokenRef.current = null;
        safeRef.current = false;
      };
    }

    editorReadyRef.current = false;
    setEditorReady(false);
    // Fresh editor: drop any stale mermaid applyPreview registrations.
    mermaidApplyPreviews.current.clear();
    setBigFileHint(false);

    const init = async () => {
      if (crepeRef.current) {
        // A half-created instance from an interrupted init — tear it down
        // first (destroyCrepe chains onto any pending teardown).
        await destroyCrepe(crepeRef.current);
        crepeRef.current = null;
      } else if (pendingDestroyRef.current) {
        // NEVER create while the previous instance is still being torn down —
        // concurrent destroy/create on the same container races and leaves
        // the editor blank.
        await pendingDestroyRef.current;
      }
      if (tokenRef.current !== token) return;

      container.innerHTML = "";

      try {
        const { Crepe, CrepeFeature } = await import("@milkdown/crepe");
        if (tokenRef.current !== token) return;

        const docContent = useStore.getState().content || "";
        const crepe = new Crepe({
          root: container,
          defaultValue: docContent,
          features: {
            [CrepeFeature.Placeholder]: true,
            [CrepeFeature.BlockEdit]: true,
            [CrepeFeature.Cursor]: true,
            [CrepeFeature.ListItem]: true,
            [CrepeFeature.LinkTooltip]: true,
            [CrepeFeature.ImageBlock]: true,
            [CrepeFeature.Table]: true,
            [CrepeFeature.Toolbar]: true,
            [CrepeFeature.TopBar]: false,
            [CrepeFeature.AI]: false,
            [CrepeFeature.CodeMirror]: true,
            [CrepeFeature.Latex]: true,
          },
          featureConfigs: {
            [CrepeFeature.CodeMirror]: {
              // Show the rendered diagram by default; toggle button reveals source
              previewOnlyByDefault: true,
              // Replace Crepe's oneDark default theme (see znCodeHighlightStyle).
              theme: syntaxHighlighting(znCodeHighlightStyle),
              // Crepe ships a built-in code-block copy button — localize its label
              // (do NOT inject a second custom copy button; they would overlap).
              copyText: t().editor.copyCode,
              // Honor the user's indent setting inside code blocks
              extensions: [
                CMEditorState.tabSize.of(useStore.getState().tabSize),
                indentUnit.of(" ".repeat(useStore.getState().tabSize)),
              ],
              // Native Milkdown code-block preview — rendered inside the node view,
              // so ProseMirror never parses the SVG back into the document.
              renderPreview: (language: string, content: string, applyPreview: (v: null | string | HTMLElement) => void) => {
                if (language.trim().toLowerCase() !== "mermaid") return null;
                // Register this block so we can re-render it on theme/font changes.
                mermaidApplyPreviews.current.set(applyPreview, content.trim());
                void (async () => {
                  try {
                    const mermaidMod = await import("mermaid");
                    if (tokenRef.current !== token) return;
                    const isDark = useStore.getState().resolvedMode === "dark";
                    mermaidMod.default.initialize({
                      startOnLoad: false,
                      theme: isDark ? "dark" : "default",
                      securityLevel: "loose",
                      // Follow the user's selected UI font
                      fontFamily: currentFontStack(),
                    });
                    const id = "m-" + Math.random().toString(36).slice(2, 8);
                    const { svg } = await mermaidMod.default.render(id, content.trim());
                    if (tokenRef.current !== token) return;
                    applyPreview(svg);
                  } catch (err) {
                    console.warn("mermaid-render-failed", err);
                    if (tokenRef.current === token) applyPreview(null);
                  }
                })();
                // Returning undefined signals async preview (shows "Loading..." meanwhile)
                return undefined;
              },
            },
            [CrepeFeature.ImageBlock]: {
              // Persist pasted/dropped/uploaded images to the note's assets folder
              // and embed them by relative path (survives restarts, portable).
              onUpload: async (file: File) => saveImage(file, useStore.getState().currentFilePath),
              inlineOnUpload: async (file: File) => saveImage(file, useStore.getState().currentFilePath),
              blockOnUpload: async (file: File) => saveImage(file, useStore.getState().currentFilePath),
              // Resolve stored (relative/absolute) paths to webview-loadable asset URLs.
              proxyDomURL: (url: string) => resolveImageUrl(url, useStore.getState().currentFilePath),
            },
          },
        });

        // Safety: only update content when editor is alive
        crepe.on((api: any) => {
          api.markdownUpdated((_ctx: any, markdown: string) => {
            if (tokenRef.current !== token) return;
            if (reuseInProgressRef.current) return; // doc swap, not a user edit
            const state = useStore.getState();
            if (markdown !== state.content && editorReadyRef.current) {
              state.setContent(markdown);
            }
          });
        });

        crepeRef.current = crepe;
        if (tokenRef.current !== token) return;

        // Override the commonmark "html" node to RENDER raw HTML (Typora-like)
        // instead of showing escaped tag text, and register a node view that lets
        // the user click the rendered block to edit its raw source. Must be done
        // before create().
        try {
          const { htmlSchema } = await import("@milkdown/kit/preset/commonmark");
          (crepe as any).editor.config((ctx: any) => {
            ctx.update((htmlSchema as any).key, (prev: any) => (ctx2: any) => {
              const spec = prev(ctx2);
              return {
                ...spec,
                toDOM: (node: any) => {
                  const value: string = node.attrs.value || "";
                  const el = document.createElement("span");
                  el.setAttribute("data-type", "html");
                  el.setAttribute("data-value", value);
                  el.className = isBlockHtml(value) ? "zn-html-render zn-html-block" : "zn-html-render";
                  el.innerHTML = renderHtmlValue(value);
                  return el;
                },
              };
            });
          });
          // Node view: click rendered html to edit its source (Typora-like).
          // Register directly via nodeViewCtx with the literal "html" type name
          // ($view relies on slice.id which is only set once its plugin runs and
          // can be a different module instance under bundling, so it may register
          // under an undefined key and silently not apply).
          const { nodeViewCtx, SchemaReady } = await import("@milkdown/kit/core");
          (crepe as any).editor.use((ctx: any) => async () => {
            await ctx.wait(SchemaReady);
            ctx.update(nodeViewCtx, (ps: any) => [
              ...ps.filter((p: any) => p[0] !== "html" && p[0] !== "frontmatter" && p[0] !== "zn_toc"),
              ["html", (node: any, view: any, getPos: any) => createHtmlNodeView(node, view, getPos)],
              ["frontmatter", (node: any, view: any, getPos: any) => createFrontmatterNodeView(node, view, getPos)],
              ["zn_toc", (node: any, view: any) => createTocNodeView(node, view)],
            ]);
          });
        } catch (err) { console.warn("html-override-failed", err); }

        // Extend the "image-block" node with an `align` attribute (left/center/right).
        // Alignment is persisted by encoding it into the markdown image alt text
        // alongside the existing resize ratio: !["1.00|center"](src "caption").
        // (Milkdown already stores the resize ratio in the alt text the same way.)
        try {
          const { imageBlockSchema } = await import("@milkdown/kit/component/image-block");
          (crepe as any).editor.config((ctx: any) => {
            ctx.update((imageBlockSchema as any).key, (prev: any) => (ctx2: any) => {
              const spec = prev(ctx2);
              return {
                ...spec,
                attrs: {
                  ...spec.attrs,
                  align: { default: "center", validate: "string" },
                },
                parseMarkdown: {
                  ...spec.parseMarkdown,
                  runner: (state: any, node: any, type: any) => {
                    const src = node.url;
                    const caption = node.title;
                    // alt may be "ratio" (legacy) or "ratio|align"
                    const parts = String(node.alt || "1").split("|");
                    let ratio = Number(parts[0]);
                    if (Number.isNaN(ratio) || ratio === 0) ratio = 1;
                    const align = parts[1] || "center";
                    state.addNode(type, { src, caption, ratio, align });
                  },
                },
                toMarkdown: {
                  ...spec.toMarkdown,
                  runner: (state: any, node: any) => {
                    state.openNode("paragraph");
                    state.addNode("image", void 0, void 0, {
                      title: node.attrs.caption,
                      url: node.attrs.src,
                      alt: Number.parseFloat(node.attrs.ratio).toFixed(2) + "|" + (node.attrs.align || "center"),
                    });
                    state.closeNode();
                  },
                },
              };
            });
          });
        } catch (err) { console.warn("image-block-override-failed", err); }

        // ---- Typora-parity extras: YAML frontmatter + [TOC] auto table of contents ----
        try {
          const { $nodeSchema, $remark } = await import("@milkdown/kit/utils");
          const remarkFrontmatter = (await import("remark-frontmatter")).default;

          // YAML frontmatter node (remark-frontmatter parses the leading `---` fence
          // into a `yaml` mdast node; serialization emits the fences back).
          const frontmatterSchema = $nodeSchema("frontmatter", () => ({
            group: "block",
            atom: true,
            attrs: { value: { default: "", validate: "string" } },
            toDOM: () => ["div", { "data-type": "frontmatter" }],
            parseMarkdown: {
              match: (mdNode: any) => mdNode.type === "yaml",
              runner: (state: any, mdNode: any, type: any) => {
                state.addNode(type, { value: mdNode.value || "" });
              },
            },
            toMarkdown: {
              match: (pmNode: any) => pmNode.type.name === "frontmatter",
              runner: (state: any, pmNode: any) => {
                state.addNode("yaml", void 0, pmNode.attrs.value);
              },
            },
          }));

          // [TOC] node. A remark transformer converts a paragraph whose only text is
          // "[TOC]" into a zn_toc mdast node when parsing (parsed nodes carry `position`).
          // Serialization emits a zn_toc mdast node directly, and a custom to-markdown
          // handler writes the literal "[TOC]" back — a plain text node would get its
          // opening bracket escaped ("\[TOC]") by mdast-util-to-markdown's unsafe rules.
          const tocSchema = $nodeSchema("zn_toc", () => ({
            group: "block",
            atom: true,
            toDOM: () => ["div", { "data-type": "zn-toc" }],
            parseMarkdown: {
              match: (mdNode: any) => mdNode.type === "zn_toc",
              runner: (state: any, _mdNode: any, type: any) => {
                state.addNode(type);
              },
            },
            toMarkdown: {
              match: (pmNode: any) => pmNode.type.name === "zn_toc",
              runner: (state: any) => {
                state.addNode("zn_toc");
              },
            },
          }));

          const tocMdastTransformer = () => (tree: any) => {
            const visit = (mdNode: any) => {
              if (!mdNode || !mdNode.children) return;
              for (let i = 0; i < mdNode.children.length; i++) {
                const child = mdNode.children[i];
                if (child.type === "paragraph" && child.position) {
                  const c = child.children;
                  if (c && c.length === 1 && c[0].type === "text" && /^[[【［]\s*toc\s*[\]】］]$/i.test(String(c[0].value).trim())) {
                    mdNode.children[i] = { type: "zn_toc" };
                    continue;
                  }
                }
                visit(child);
              }
            };
            visit(tree);
          };

          // to-markdown handler for the zn_toc mdast node: emit the literal "[TOC]".
          const tocToMarkdownHandler = function (this: any) {
            const data = this.data();
            const extensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
            extensions.push({
              handlers: { zn_toc: () => "[TOC]" },
            });
          };

          // NOTE: the "[TOC]" input rule is installed after crepe.create() (see
          // tocInputRulePlugin below) — plugins registered via $prose are dropped by
          // Crepe's internal state reconfiguration, so direct injection is required.

          (crepe as any).editor
            .use(frontmatterSchema)
            .use(tocSchema)
            .use($remark("zn-frontmatter", () => remarkFrontmatter, { type: "yaml", marker: "-" }))
            .use($remark("zn-toc-mdast", () => tocMdastTransformer))
            .use($remark("zn-toc-stringify", () => tocToMarkdownHandler));
        } catch (err) { console.warn("frontmatter-toc-extras-failed", err); }

        await crepe.create();
        if (tokenRef.current !== token) return;

        // Obtain the ProseMirror view. The focus highlight is implemented as a ProseMirror
        // DECORATION (not an external DOM class): adding a class directly to a ProseMirror-managed
        // element is detected as an external mutation and gets re-rendered away, whereas a
        // decoration is applied by ProseMirror itself on every render and thus persists.
        const { editorViewCtx } = await import("@milkdown/kit/core");
        const { Plugin, PluginKey, EditorState, TextSelection } = await import("@milkdown/kit/prose/state");
        pmTextSelection = TextSelection;
        const { Decoration, DecorationSet } = await import("@milkdown/kit/prose/view");
        const pmView = (crepe as any).editor.action((ctx: any) => ctx.get(editorViewCtx));

        const FOCUS_TYPES = new Set(["heading", "paragraph", "list_item", "blockquote", "code_block"]);
        // Only reveal the markdown source of the focused block AFTER the user has
        // actually interacted (clicked/typed). On first open the cursor lands at the
        // start of the doc, but we don't want the heading to show its "#" source yet.
        let hasInteracted = false;
        const computeFocusDecos = (state: any) => {
          const decos: any[] = [];
          const sel = state.selection;
          if (!sel) return DecorationSet.empty;
          const $head = sel.$head;
          // Tables always stay fully rendered (no source-reveal).
          let inTable = false;
          for (let d = $head.depth; d >= 1; d--) {
            const tn = $head.node(d).type.name;
            if (tn === "table_cell" || tn === "table_header") { inTable = true; break; }
          }
          if (inTable) return DecorationSet.empty;

          if (!hasInteracted) return DecorationSet.empty;

          // Reveal the focused block enclosing the given resolved position
          // (preferring the enclosing list_item / blockquote so the whole
          // item/quote is highlighted).
          const seen = new Set<number>();
          const revealBlockAt = ($pos: any) => {
            let from = -1, nodeSize = 0;
            for (let d = $pos.depth; d >= 1 && from < 0; d--) {
              const name = $pos.node(d).type.name;
              if (name === "list_item" || name === "blockquote") { from = $pos.before(d); nodeSize = $pos.node(d).nodeSize; }
            }
            if (from < 0) {
              for (let d = $pos.depth; d >= 1 && from < 0; d--) {
                const name = $pos.node(d).type.name;
                if (FOCUS_TYPES.has(name)) { from = $pos.before(d); nodeSize = $pos.node(d).nodeSize; }
              }
            }
            if (from >= 0 && !seen.has(from)) {
              seen.add(from);
              decos.push(Decoration.node(from, from + nodeSize, { class: "zn-block-focused" }));
            }
          };

          revealBlockAt($head);
          if (!sel.empty) {
            // While text is SELECTED keep the reveal STABLE — the user is
            // picking a range to edit, and hiding the "#" marks mid-selection
            // would reflow the text under the pointer. Keep the blocks at
            // both selection ends revealed (deduped above when they match).
            revealBlockAt(sel.$from);
            revealBlockAt(sel.$to);
          }

          return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
        };
        const focusDecoPlugin = new Plugin({
          key: new PluginKey("znFocusBlockDeco"),
          state: {
            init: (_: any, state: any) => computeFocusDecos(state),
            apply: (_: any, _prev: any, _old: any, newState: any) => computeFocusDecos(newState),
          },
          props: {
            decorations(state: any) { return (this as any).getState(state); },
          },
        });
        // Image alignment: decorate each image-block node with a class reflecting
        // its `align` attribute so CSS can position it (left/center/right).
        const computeImageAlignDecos = (state: any) => {
          const decos: any[] = [];
          state.doc.descendants((node: any, pos: number) => {
            if (node.type.name === "image-block") {
              const align = node.attrs.align || "center";
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "zn-img-align-" + align }));
            }
          });
          return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
        };
        const imageAlignPlugin = new Plugin({
          key: new PluginKey("znImageAlignDeco"),
          state: {
            init: (_: any, state: any) => computeImageAlignDecos(state),
            apply: (_: any, _prev: any, _old: any, newState: any) => computeImageAlignDecos(newState),
          },
          props: {
            decorations(state: any) { return (this as any).getState(state); },
          },
        });
        // TOC sync: refresh every TOC node view whenever the document changes.
        const tocRefreshPlugin = new Plugin({
          key: new PluginKey("znTocRefresh"),
          view: () => ({
            update: (view: any, prevState: any) => {
              if (!tocRefreshers.size || view.state.doc === prevState.doc) return;
              tocRefreshers.forEach((r) => { try { r(); } catch (err) { console.warn("toc-refresh-callback-failed", err); } });
            },
          }),
        });
        // Footnote jump flash: implemented as a node DECORATION, not a DOM class —
        // adding a class directly to a ProseMirror-managed element is detected as an
        // external mutation and triggers an endless re-render/replace loop.
        const fnFlashKey = new PluginKey("znFootnoteFlash");
        let fnFlashTimer: number | null = null;
        const footnoteFlashPlugin = new Plugin({
          key: fnFlashKey,
          state: {
            init: () => ({ label: "", target: "" }),
            apply: (tr: any, prev: any) => tr.getMeta(fnFlashKey) ?? prev,
          },
          props: {
            decorations(state: any) {
              const cur = fnFlashKey.getState(state) as { label: string; target: string };
              if (!cur.label || !cur.target) return DecorationSet.empty;
              const want = cur.target === "def" ? "footnote_definition" : "footnote_reference";
              const decos: any[] = [];
              state.doc.descendants((node: any, pos: number) => {
                if (node.type.name === want && node.attrs.label === cur.label) {
                  decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "zn-flash" }));
                }
              });
              return DecorationSet.create(state.doc, decos);
            },
          },
        });
        // ---- Document find plugin (FindReplaceBar drives it via metas) ----
        // Matches are rendered as ProseMirror inline decorations — never raw
        // DOM mutation — so highlights survive re-renders and serialization.
        const findPlugin = new Plugin({
          key: znFindKey,
          state: {
            init: () => emptyFindState(),
            apply: (tr: any, prev: ZnFindState, _old: any, newState: any) => {
              const meta = tr.getMeta(znFindKey) as ZnFindMeta | undefined;
              if (meta?.type === "clear") return emptyFindState();
              let query = prev.query, opts = prev.opts, current = prev.current;
              if (meta?.type === "query") { query = meta.query; opts = meta.opts; current = 0; }
              else if (meta?.type === "goto") current = meta.index;
              if (!query) return { ...prev, query, opts, matches: [], current: -1, deco: null };
              if (!meta && !tr.docChanged) return prev;
              // Navigation without doc changes keeps the existing match list
              // (only decorations are rebuilt) — avoids re-scanning big docs.
              const matches = (meta?.type === "goto" && !tr.docChanged)
                ? prev.matches
                : collectMatchesFromDoc(newState.doc, query, opts);
              if (matches.length === 0) current = -1;
              else if (current < 0 || current >= matches.length) current = 0;
              let deco: any = null;
              try {
                deco = DecorationSet.create(newState.doc, matches.map((m, i) =>
                  Decoration.inline(m.from, m.to, { class: i === current ? "zn-find-hl zn-find-hl-current" : "zn-find-hl" })));
              } catch { deco = null; }
              return { query, opts, matches, current, deco };
            },
          },
          props: {
            decorations(state: any) { return (znFindKey.getState(state) as ZnFindState | undefined)?.deco ?? null; },
          },
        });
        // ---- Paste a URL over a text selection -> wrap as markdown link ----
        const urlPastePlugin = new Plugin({
          key: new PluginKey("znUrlPaste"),
          props: {
            handlePaste: (view: any, event: ClipboardEvent) => {
              const sel = view.state.selection;
              if (sel.empty) return false;
              const text = event.clipboardData?.getData("text/plain")?.trim();
              if (!text || !isHttpUrl(text)) return false;
              const linkMark = view.state.schema.marks.link;
              if (!linkMark) return false;
              const selected = view.state.doc.textBetween(sel.from, sel.to);
              if (!selected) return false;
              try {
                const node = view.state.schema.text(selected, [linkMark.create({ href: text })]);
                view.dispatch(view.state.tr.replaceSelectionWith(node, false));
                return true;
              } catch { return false; }
            },
          },
        });
        const flashFootnote = (label: string, target: "def" | "ref") => {
          pmView.dispatch(pmView.state.tr.setMeta(fnFlashKey, { label, target }));
          if (fnFlashTimer !== null) window.clearTimeout(fnFlashTimer);
          fnFlashTimer = window.setTimeout(() => {
            fnFlashTimer = null;
            pmView.dispatch(pmView.state.tr.setMeta(fnFlashKey, { label: "", target: "" }));
          }, 1200);
        };
        // TOC input rule: typing "[TOC]" converts the paragraph into the TOC block.
        // textblockTypeInputRule can't be used (zn_toc is an atom node, not a
        // textblock) — replace the whole paragraph via a custom transaction instead.
        let tocInputRulePlugin: any = null;
        if (pmView.state.schema.nodes.zn_toc) {
          const { inputRules, InputRule } = await import("@milkdown/kit/prose/inputrules");
          const tocNodeType = pmView.state.schema.nodes.zn_toc;
          tocInputRulePlugin = inputRules({
            rules: [
              // Fullwidth brackets (【［】］) are accepted too — they are easy to
              // type by accident under a Chinese IME.
              new InputRule(/^[[【［]\s*toc\s*[\]】］]$/i, (state: any, _match: any, start: number, end: number) => {
                const $start = state.doc.resolve(start);
                if ($start.parent.type.name !== "paragraph") return null;
                const paraStart = $start.before();
                const paraEnd = state.doc.resolve(end).after();
                return state.tr.replaceRangeWith(paraStart, paraEnd, tocNodeType.create());
              }),
            ],
          });
        }
        // Robust [TOC] conversion: input rules may not fire under every IME /
        // paste scenario, so a doc watcher converts any remaining top-level
        // "[TOC]" paragraph into the TOC block right after the change. (This is
        // also why re-opening the tab used to "fix" it — the parse path always
        // converts; now the live editor does too.)
        let tocAutoConvertPlugin: any = null;
        if (pmView.state.schema.nodes.zn_toc) {
          const tocType = pmView.state.schema.nodes.zn_toc;
          const TOC_PARA_RE = /^[[【［]\s*toc\s*[\]】］]$/i;
          tocAutoConvertPlugin = new Plugin({
            key: new PluginKey("znTocAutoConvert"),
            view: () => ({
              update: (view: any, prevState: any) => {
                if (view.state.doc === prevState.doc) return;
                const matches: Array<{ from: number; to: number }> = [];
                view.state.doc.forEach((child: any, offset: number) => {
                  if (child.type.name === "paragraph" && TOC_PARA_RE.test(child.textContent.trim())) {
                    matches.push({ from: offset, to: offset + child.nodeSize });
                  }
                });
                if (!matches.length) return;
                let tr = view.state.tr;
                // Replace back-to-front so earlier positions stay valid.
                for (let i = matches.length - 1; i >= 0; i--) {
                  tr = tr.replaceRangeWith(matches[i].from, matches[i].to, tocType.create());
                }
                view.dispatch(tr);
              },
            }),
          });
        }
        // Inject the plugins by reconfiguring the state. Safe to do right after create():
        // the undo history and all plugin states are still empty.
        pmView.updateState(EditorState.create({
          doc: pmView.state.doc,
          selection: pmView.state.selection,
          plugins: [...pmView.state.plugins, focusDecoPlugin, imageAlignPlugin, tocRefreshPlugin, footnoteFlashPlugin, findPlugin, urlPastePlugin, ...(tocInputRulePlugin ? [tocInputRulePlugin] : []), ...(tocAutoConvertPlugin ? [tocAutoConvertPlugin] : [])],
        }));
        pmViewRef.current = pmView;

        // Mark interaction in the CAPTURE phase so the flag is set before
        // ProseMirror's own handlers dispatch the selection transaction.
        const markInteracted = () => { hasInteracted = true; };
        container.addEventListener("pointerdown", markInteracted, { capture: true, passive: true });
        container.addEventListener("keydown", markInteracted, { capture: true, passive: true });

        // ---- Fullwidth Chinese punctuation auto-pairing ----
        // IME commits land as beforeinput/insertText; insert the matching
        // closing bracket and keep the caret between the pair.
        const CN_PAIRS: Record<string, string> = { "（": "）", "【": "】", "「": "」", "『": "』" };
        const onBeforeInput = (e: Event) => {
          const ie = e as InputEvent;
          if (ie.inputType !== "insertText" || !ie.data) return;
          const closing = CN_PAIRS[ie.data];
          if (!closing) return;
          const sel = pmView.state.selection;
          if (!sel.empty) return;
          try {
            const next = pmView.state.doc.textBetween(sel.from, Math.min(sel.from + 1, pmView.state.doc.content.size), "");
            if (next === closing) return; // already closed right after the caret
            ie.preventDefault();
            const tr = pmView.state.tr.insertText(ie.data + closing, sel.from);
            tr.setSelection(TextSelection.create(tr.doc, sel.from + 1));
            pmView.dispatch(tr);
          } catch { /* never break typing on a pairing error */ }
        };
        container.addEventListener("beforeinput", onBeforeInput);

        safeRef.current = true;
        editorReadyRef.current = true;
        setEditorReady(true);
        setEditorRef(crepeRef);
        // Large document: suggest source mode (ProseMirror full-DOM gets slow).
        setBigFileHint((useStore.getState().content || "").split("\n").length > 5000);


// ---- Cursor tracking ----
        const updateCursor = () => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const node = sel.anchorNode;
            if (node) {
              const text = node.textContent || "";
              const pos = Math.min(sel.anchorOffset, text.length);
              const lines = text.substring(0, pos).split("\n");
              setCursorPosition(lines.length, lines[lines.length - 1].length + 1);
            }
          }
        };

        // The Typora-style focus highlight is now handled by the ProseMirror decoration
        // plugin installed above (see focusDecoPlugin), which persists across re-renders.
        // Only cursor-position (Ln/Col) tracking remains here.
        // Multiple event sources for robust cursor-position tracking
        const onFocusInput = () => {
          if (!safeRef.current) return;
          updateCursor();
        };
        container.addEventListener("keyup", onFocusInput, { passive: true });
        container.addEventListener("pointerup", onFocusInput, { passive: true });
        container.addEventListener("click", onFocusInput, { passive: true });
        container.addEventListener("focusin", onFocusInput, { passive: true });
        // Throttle selectionchange — fires on EVERY mousemove during drag selection;
        // 80ms keeps the status bar responsive without per-frame store churn.
        let selChangeTimer = 0;
        const onSelChange = () => {
          if (selChangeTimer) return;
          selChangeTimer = window.setTimeout(() => {
            selChangeTimer = 0;
            onFocusInput();
          }, 80);
        };
        document.addEventListener("selectionchange", onSelChange);

        requestAnimationFrame(onFocusInput);

        // ---- Code block (mermaid etc.): click preview to edit, blur to re-render ----
        // Crepe renders a preview panel + a toggle button inside each code block.
        // preview-only mode  -> .codemirror-host has the "hidden" class (diagram only)
        // edit mode          -> .codemirror-host visible (source shown)
        const isPreviewOnly = (cb: HTMLElement) => {
          const host = cb.querySelector(".codemirror-host");
          return !!host && host.classList.contains("hidden");
        };
        const togglePreview = (cb: HTMLElement) => {
          const btn = cb.querySelector(".preview-toggle-button") as HTMLElement | null;
          if (btn) btn.click();
        };

        // Click on the rendered preview (e.g. a mermaid diagram) toggles edit mode.
        const onPreviewClick = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (!target.closest(".preview-panel")) return;
          // Zoom button: open the enlarged overlay instead of toggling edit mode.
          const zoomBtn = target.closest(".zn-mermaid-zoom-btn");
          if (zoomBtn) {
            const panel = zoomBtn.closest(".preview-panel");
            const svg = panel ? panel.querySelector(".preview svg") : null;
            if (svg) openZoom(svg as SVGElement);
            return;
          }
          const cb = target.closest(".milkdown-code-block") as HTMLElement | null;
          if (!cb) return;
          const wasPreviewOnly = isPreviewOnly(cb);
          togglePreview(cb);
          // Entering edit mode: focus the CodeMirror editor for immediate typing.
          if (wasPreviewOnly) {
            setTimeout(() => {
              const cm = cb.querySelector(".cm-content") as HTMLElement | null;
              if (cm) cm.focus();
            }, 0);
          }
        };

        // When focus leaves the code block entirely, return to the rendered preview.
        const onCodeBlockBlur = (e: FocusEvent) => {
          const cb = (e.target as HTMLElement).closest(".milkdown-code-block") as HTMLElement | null;
          if (!cb) return;
          const next = e.relatedTarget as Node | null;
          // Only collapse when focus genuinely moved outside this code block.
          if (next && cb.contains(next)) return;
          if (next === null) return; // blur to nothing / non-focusable click: let click handler decide
          if (!isPreviewOnly(cb)) togglePreview(cb);
        };

        container.addEventListener("click", onPreviewClick);
        container.addEventListener("focusout", onCodeBlockBlur);

        // ---- Footnote cross-reference jump: reference (sup) ⇄ definition (dl) ----
        // The flash is a ProseMirror decoration (see footnoteFlashPlugin above).
        const onFootnoteClick = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const ref = target.closest('sup[data-type="footnote_reference"]') as HTMLElement | null;
          if (ref) {
            const label = ref.getAttribute("data-label") || "";
            if (!label) return;
            const sel = 'dl[data-type="footnote_definition"][data-label="' + CSS.escape(label) + '"]';
            const def = container.querySelector(sel) as HTMLElement | null;
            if (def) {
              e.preventDefault();
              def.scrollIntoView({ behavior: "smooth", block: "center" });
              flashFootnote(label, "def");
            }
            return;
          }
          if (target.closest("dt")) {
            const dl = target.closest('dl[data-type="footnote_definition"]') as HTMLElement | null;
            const label = dl ? dl.getAttribute("data-label") || "" : "";
            if (!dl || !label) return;
            const sel = 'sup[data-type="footnote_reference"][data-label="' + CSS.escape(label) + '"]';
            const refBack = container.querySelector(sel) as HTMLElement | null;
            if (refBack) {
              e.preventDefault();
              refBack.scrollIntoView({ behavior: "smooth", block: "center" });
              flashFootnote(label, "ref");
            }
          }
        };
        container.addEventListener("click", onFootnoteClick);

        // ---- Mermaid zoom: enlarged floating view with resizable frame ----
        let zoomOverlay: HTMLElement | null = null;

        const onZoomKeydown = (e: KeyboardEvent) => {
          if (e.key === "Escape") closeMermaidZoom();
        };

        function closeMermaidZoom() {
          if (zoomOverlay) { zoomOverlay.remove(); zoomOverlay = null; }
          document.removeEventListener("keydown", onZoomKeydown);
        }

        // Drag a handle to resize the zoom box. Directions: n/s/e/w/ne/nw/se/sw.
        const startZoomResize = (ev: MouseEvent, box: HTMLElement, dir: string) => {
          ev.preventDefault();
          ev.stopPropagation();
          const startX = ev.clientX, startY = ev.clientY;
          const r = box.getBoundingClientRect();
          const startW = r.width, startH = r.height, startL = r.left, startT = r.top;
          const minW = 280, minH = 200;
          const onMove = (e: MouseEvent) => {
            const dx = e.clientX - startX, dy = e.clientY - startY;
            let w = startW, h = startH, l = startL, t = startT;
            if (dir.includes("e")) w = Math.max(minW, startW + dx);
            if (dir.includes("s")) h = Math.max(minH, startH + dy);
            if (dir.includes("w")) { w = Math.max(minW, startW - dx); l = startL + (startW - w); }
            if (dir.includes("n")) { h = Math.max(minH, startH - dy); t = startT + (startH - h); }
            box.style.width = w + "px"; box.style.height = h + "px";
            box.style.left = l + "px"; box.style.top = t + "px";
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        };

        function openZoom(target: SVGElement | HTMLImageElement) {
          closeMermaidZoom();
          const overlay = document.createElement("div");
          overlay.className = "zn-mermaid-zoom-overlay";

          const box = document.createElement("div");
          box.className = "zn-mermaid-zoom-box";
          const vw = window.innerWidth, vh = window.innerHeight;
          const w = Math.min(vw * 0.85, 1400), h = vh * 0.85;
          box.style.width = w + "px"; box.style.height = h + "px";
          box.style.left = ((vw - w) / 2) + "px"; box.style.top = ((vh - h) / 2) + "px";

          const closeBtn = document.createElement("button");
          closeBtn.className = "zn-mermaid-zoom-close";
          closeBtn.type = "button";
          closeBtn.title = t().editor.zoomClose;
          closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
          closeBtn.addEventListener("click", closeMermaidZoom);

          const body = document.createElement("div");
          body.className = "zn-mermaid-zoom-body";
          const cloned = target.cloneNode(true) as SVGElement | HTMLImageElement;
          cloned.removeAttribute("width");
          cloned.removeAttribute("height");
          cloned.style.maxWidth = "none";
          cloned.style.maxHeight = "none";
          cloned.style.flexShrink = "0";
          const imgEl = target instanceof HTMLImageElement ? (cloned as HTMLImageElement) : null;
          if (imgEl) imgEl.draggable = false;

          // Zoom (wheel) & pan (drag diagram) state. Diagrams (SVG) are sized as
          // a percentage of the body (viewBox keeps them undistorted); IMAGES are
          // sized in px derived from their NATURAL dimensions so the intrinsic
          // aspect ratio is never stretched by the box's own ratio.
          let zoom = 1, panX = 0, panY = 0;
          let imgBaseW = 0, imgBaseH = 0;
          const fitImageToBox = () => {
            if (!imgEl) return;
            const bodyRect = body.getBoundingClientRect();
            const natW = imgEl.naturalWidth, natH = imgEl.naturalHeight;
            // Fit inside the box without cropping; small images stay at true size.
            const scale = fitContainScale(bodyRect.width, bodyRect.height, natW, natH);
            if (!scale) return;
            imgBaseW = natW * scale;
            imgBaseH = natH * scale;
          };
          const applyZoom = () => {
            if (imgEl) {
              if (!imgBaseW) fitImageToBox();
              if (imgBaseW) {
                imgEl.style.width = (imgBaseW * zoom) + "px";
                imgEl.style.height = (imgBaseH * zoom) + "px";
              } else {
                // Metadata not ready yet — keep intrinsic sizing, never distort.
                imgEl.style.width = "auto";
                imgEl.style.height = "auto";
              }
            } else {
              cloned.style.width = (100 * zoom) + "%";
              cloned.style.height = (100 * zoom) + "%";
            }
          };
          const applyPan = () => {
            cloned.style.transform = "translate(" + panX + "px, " + panY + "px)";
          };
          applyZoom();

          // Drag on the diagram itself -> pan the diagram (box stays put).
          cloned.addEventListener("mousedown", (ev) => {
            const e = ev as MouseEvent;
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX, startY = e.clientY;
            const startPanX = panX, startPanY = panY;
            const onMove = (ev: MouseEvent) => {
              panX = startPanX + ev.clientX - startX;
              panY = startPanY + ev.clientY - startY;
              applyPan();
            };
            const onUp = () => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });

          body.appendChild(cloned);

          box.appendChild(closeBtn);
          box.appendChild(body);

          // Drag on the box's empty area (not the diagram/close/handles) -> move the whole box.
          box.addEventListener("mousedown", (e) => {
            const tgt = e.target as Element;
            if (tgt.closest(".zn-mermaid-zoom-close") || tgt.closest(".zn-mermaid-zoom-handle")) return;
            if (tgt === cloned || cloned.contains(tgt)) return; // diagram pans instead
            e.preventDefault();
            const startX = e.clientX, startY = e.clientY;
            const startL = parseFloat(box.style.left) || 0;
            const startT = parseFloat(box.style.top) || 0;
            const onMove = (ev: MouseEvent) => {
              box.style.left = (startL + ev.clientX - startX) + "px";
              box.style.top = (startT + ev.clientY - startY) + "px";
            };
            const onUp = () => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });

          ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((dir) => {
            const handle = document.createElement("div");
            handle.className = "zn-mermaid-zoom-handle zn-mermaid-zoom-handle-" + dir;
            handle.addEventListener("mousedown", (ev) => startZoomResize(ev, box, dir));
            box.appendChild(handle);
          });

          // Mouse wheel -> zoom the diagram in/out (centered).
          overlay.addEventListener("wheel", (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            zoom = Math.min(10, Math.max(0.2, zoom * factor));
            applyZoom();
          }, { passive: false });

          overlay.appendChild(box);
          // Click on the dimmed background (outside the diagram box) closes the zoom view.
          overlay.addEventListener("mousedown", (ev) => {
            if (ev.target === overlay) closeMermaidZoom();
          });

          document.body.appendChild(overlay);
          zoomOverlay = overlay;
          document.addEventListener("keydown", onZoomKeydown);
          // Initial fit for images: the box only has real dimensions once it is
          // in the DOM. Re-fit if the clone's metadata arrives late.
          if (imgEl) {
            fitImageToBox();
            applyZoom();
            imgEl.addEventListener("load", () => { fitImageToBox(); applyZoom(); });
          }
        }
        // Expose zoom to effects registered outside this init closure (image click).
        openZoomRef.current = openZoom;

        // Ensure every mermaid preview panel has a zoom button (re-add after re-renders).
        // NOTE: rendered diagrams STAY mounted permanently — an earlier version
        // detached offscreen SVGs into placeholders, but the swap was visible
        // while scrolling and users found it disruptive. Once rendered, a
        // diagram never reverts to its raw state.
        const ZOOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>';
        const ensureCodeBlockExtras = () => {
          if (tokenRef.current !== token) return;
          container.querySelectorAll(".milkdown-code-block .preview-panel").forEach((panel) => {
            if (!panel.querySelector(".preview svg")) return; // only mermaid previews have an svg
            if (!panel.querySelector(".zn-mermaid-zoom-btn")) {
              const btn = document.createElement("button");
              btn.className = "zn-mermaid-zoom-btn";
              btn.type = "button";
              btn.title = t().editor.zoomOpen;
              btn.innerHTML = ZOOM_ICON;
              panel.appendChild(btn);
            }
          });
        };
        let zoomBtnTimer = 0;
        const zoomBtnObserver = new MutationObserver((mutations) => {
          // 只在有 ELEMENT 节点被加入时才重扫：纯文本编辑（插入 text 节点）、
          // 属性/删除变更都不会产生新的代码块预览面板，直接忽略，避免
          // 打字停顿 300ms 后对全树 querySelectorAll。
          for (const m of mutations) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1) {
                if (zoomBtnTimer) return;
                zoomBtnTimer = window.setTimeout(() => { zoomBtnTimer = 0; ensureCodeBlockExtras(); }, 300);
                return;
              }
            }
          }
        });
        zoomBtnObserver.observe(container, { childList: true, subtree: true });
        ensureCodeBlockExtras();

        focusCleanupRef.current = () => {
          container.removeEventListener("keyup", onFocusInput);
          container.removeEventListener("pointerup", onFocusInput);
          container.removeEventListener("click", onFocusInput);
          container.removeEventListener("focusin", onFocusInput);
          container.removeEventListener("click", onPreviewClick);
          container.removeEventListener("focusout", onCodeBlockBlur);
          container.removeEventListener("click", onFootnoteClick);
          if (fnFlashTimer !== null) window.clearTimeout(fnFlashTimer);
          container.removeEventListener("pointerdown", markInteracted, { capture: true });
          container.removeEventListener("keydown", markInteracted, { capture: true });
          container.removeEventListener("beforeinput", onBeforeInput);
          document.removeEventListener("selectionchange", onSelChange);
          zoomBtnObserver.disconnect();
          if (zoomBtnTimer) clearTimeout(zoomBtnTimer);
          closeMermaidZoom();
        };

        // Restore the saved scroll position once. The per-file cache is the
        // authoritative source (store.scrollPosition may briefly hold another
        // file's value right after a switch).
        const savedScroll = useStore.getState().fileStates.get(path)?.scrollPos
          ?? useStore.getState().scrollPosition;
        if (savedScroll > 0) {
          setTimeout(() => {
            if (tokenRef.current !== token) return;
            const scrollEl = editorScrollEl(container);
            if (scrollEl) scrollEl.scrollTop = savedScroll;
          }, 500);
        }
      } catch (err: any) {
        if (tokenRef.current === token) {
          console.error("Milkdown init failed:", err);
          setError(err?.message || t().editor.initFailed);
        }
      }
    };

    void init();

    return () => {
      // Abort this run's in-flight async init work (token guard). The
      // instance itself is NOT destroyed here — the next effect run decides
      // whether to reuse it (file switch) or tear it down (no file left /
      // source mode / unmount). Eager destruction forced a slow full rebuild
      // after every tab close and raced with the new instance's create.
      tokenRef.current = null;
      safeRef.current = false;
    };
  }, [currentFilePath, sourceMode, reuseFailTick, reloadTick, setCursorPosition, setEditorRef]);

  // Locate the enclosing image-block node of an <img> (position + alignment).
  const readImageBlockAt = useCallback((img: HTMLElement): { pos: number; align: string } => {
    const pm = pmViewRef.current;
    if (!pm) return { pos: -1, align: "center" };
    try {
      const pos = pm.posAtDOM(img, 0);
      const $pos = pm.state.doc.resolve(pos);
      for (let d = $pos.depth; d >= 0; d--) {
        const n = $pos.node(d);
        if (n.type.name === "image-block") return { pos: $pos.before(d), align: n.attrs.align || "center" };
      }
      return { pos, align: "center" };
    } catch { return { pos: -1, align: "center" }; }
  }, []);

  // Table-cell drag selection: Crepe's tableBlock node view stops ProseMirror
  // from receiving mousedown inside cells (it turns every press into a
  // NodeSelection), which breaks prosemirror-tables' built-in drag-select. We
  // bind our own capture-phase handlers on the container instead.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sourceMode || !editorReady) return;
    return startTableDragSelect(container, () => pmViewRef.current);
  }, [editorReady, sourceMode]);

  // Right-click context menu: table menu inside tables, image align menu on
  // images, copy menu on plain text selection.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sourceMode) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest("th, td") as HTMLElement | null;
      if (cell && target.closest(".milkdown-table-block")) {
        e.preventDefault();
        // Move the selection into the right-clicked cell FIRST: prosemirror
        // table commands operate on the current selection, and a right-click
        // does NOT move the caret — without this every menu command would run
        // against the previous selection (or do nothing when it was outside
        // the table).
        // EXCEPTION: keep an existing multi-cell selection (CellSelection —
        // detected via the prosemirror-tables $anchorCell getter) so
        // merge/split still see the cells the user had selected.
        const pm = pmViewRef.current;
        const sel = pm?.state?.selection;
        const isCellSelection = !!(sel && sel.$anchorCell);
        // Snapshot the multi-cell selection NOW (while it is still alive) so
        // merge/split can re-apply it at command time even if something
        // collapses it while the menu is open.
        setTableMenuSel(isCellSelection ? { anchor: sel.$anchorCell.pos, head: sel.$headCell.pos } : null);
        if (pm && !isCellSelection && pmTextSelection) {
          try {
            const pos = pm.posAtDOM(cell, 0);
            const clamped = Math.min(Math.max(pos, 0), pm.state.doc.content.size);
            pm.dispatch(pm.state.tr.setSelection(pmTextSelection.create(pm.state.doc, clamped)));
          } catch (err) { console.warn("table-menu-select-failed", err); }
        }
        setCopyMenuVisible(false);
        setTableMenuPos({ x: e.clientX, y: e.clientY });
        setTableMenuVisible(true);
        return;
      }
      // Image block: right-click opens the alignment toolbar.
      const img = target.closest('img[data-type="image-block"]') as HTMLElement | null;
      if (img) {
        e.preventDefault();
        const info = readImageBlockAt(img);
        setCopyMenuVisible(false);
        setTableMenuVisible(false);
        setImgAlignMenu({ visible: true, x: e.clientX, y: e.clientY, pos: info.pos, align: info.align });
        return;
      }
      // Non-table area: offer copy menu when there is a text selection
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().length > 0 && container.contains(sel.anchorNode)) {
        e.preventDefault();
        setTableMenuVisible(false);
        setCopyMenuPos({ x: e.clientX, y: e.clientY });
        setCopyMenuVisible(true);
      }
    };

    const closeAll = () => { setCopyMenuVisible(false); };
    container.addEventListener("contextmenu", handler);
    document.addEventListener("mousedown", closeAll);
    return () => {
      container.removeEventListener("contextmenu", handler);
      document.removeEventListener("mousedown", closeAll);
    };
  }, [sourceMode, editorReady, readImageBlockAt]);

  // Click an image to open the zoom viewer (alignment moved to right-click).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sourceMode || !editorReady) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const img = target.closest('img[data-type="image-block"]') as HTMLImageElement | null;
      if (!img) { setImgAlignMenu(m => (m.visible ? { ...m, visible: false } : m)); return; }
      openZoomRef.current(img);
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [sourceMode, editorReady]);

  // Apply an alignment to the image-block node at the given position.
  const applyImageAlign = useCallback((align: string) => {
    const pm = pmViewRef.current;
    const pos = imgAlignMenu.pos;
    if (!pm || pos < 0) return;
    try {
      const node = pm.state.doc.nodeAt(pos);
      if (node && node.type.name === "image-block") {
        pm.dispatch(pm.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, align }));
      }
    } catch (err) { console.warn("image-align-apply-failed", err); }
    setImgAlignMenu(m => ({ ...m, visible: false }));
  }, [imgAlignMenu.pos]);

  // Re-render already-drawn mermaid diagrams when the theme or font changes.
  // Milkdown only re-runs renderPreview on text/language edits, so a theme/font
  // switch would otherwise leave the old-colored SVGs in place. The .preview
  // container is opaque to ProseMirror (Milkdown itself fills it via innerHTML),
  // so replacing the SVG there is safe.
  const mermaidThemeFontFirstRun = useRef(true);
  useEffect(() => {
    if (mermaidThemeFontFirstRun.current) { mermaidThemeFontFirstRun.current = false; return; }
    if (sourceMode || !editorReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const mermaidMod = await import("mermaid");
        const isDark = useStore.getState().resolvedMode === "dark";
        mermaidMod.default.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: currentFontStack(),
        });
        // Group registered blocks by source so identical diagrams render once.
        const bySource = new Map<string, Array<(v: null | string | HTMLElement) => void>>();
        mermaidApplyPreviews.current.forEach((source, applyPreview) => {
          if (!source) return;
          const list = bySource.get(source) || [];
          list.push(applyPreview);
          bySource.set(source, list);
        });
        console.debug("[mermaid-re] re-rendering " + bySource.size + " unique mermaid sources, isDark=" + isDark);
        let reRendered = 0;
        for (const [source, applyFns] of bySource) {
          if (cancelled) return;
          try {
            const id = "m-re-" + Math.random().toString(36).slice(2, 8);
            const { svg } = await mermaidMod.default.render(id, source);
            if (cancelled) return;
            // Update Milkdown's preview ref (source of truth) — NOT the DOM directly,
            // so Milkdown's own watchEffect won't revert it back to the old SVG.
            applyFns.forEach(fn => fn(svg));
            reRendered++;
          } catch (err) { console.warn("mermaid-re-render-failed", err); }
        }
        console.debug("[mermaid-re] re-rendered " + reRendered + " mermaid diagrams via applyPreview");
      } catch (err) { console.warn("mermaid-re-init-failed", err); }
    })();
    return () => { cancelled = true; };
  }, [resolvedMode, fontFamily, sourceMode, editorReady]);

  // Copy actions for the context menu
  const copyPlainText = useCallback(() => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      navigator.clipboard.writeText(sel.toString()).catch((err) => { console.warn("clipboard-write-failed", err); });
    }
    setCopyMenuVisible(false);
  }, []);
  const copyMarkdown = useCallback(() => {
    // execCommand("copy") triggers ProseMirror/Milkdown clipboard serializer (markdown)
    document.execCommand("copy");
    setCopyMenuVisible(false);
  }, []);

  // Save scroll position on file switch / unmount.
  // NOTE: the store's currentFilePath may already point at the NEXT file when
  // this cleanup runs, so the captured `path` (from the effect closure) is the
  // only reliable key for the file actually being left.
  useEffect(() => {
    const path = currentFilePath;
    // Capture the stable container element at effect setup (the JSX node is
    // persistent across renders) so cleanup doesn't read the ref late.
    const container = containerRef.current;
    return () => {
      if (scrollSaveTimer.current) clearInterval(scrollSaveTimer.current);
      const scrollEl = container ? editorScrollEl(container) : null;
      if (!scrollEl || !path) return;
      // Write the final scroll into the PER-FILE cache only. Do NOT touch
      // store.scrollPosition here: after a file switch it already holds the
      // NEXT file's restored value and overwriting it would break the next
      // editor's scroll restoration.
      const s = useStore.getState();
      const prev = s.fileStates.get(path);
      if (prev) {
        const states = new Map(s.fileStates);
        states.set(path, { ...prev, scrollPos: scrollEl.scrollTop });
        useStore.setState({ fileStates: states });
      }
    };
  }, [currentFilePath]);

  useEffect(() => {
    scrollSaveTimer.current = window.setInterval(() => {
      const scrollEl = containerRef.current ? editorScrollEl(containerRef.current) : null;
      if (scrollEl && currentFilePath && !sourceMode) {
        setScrollPosition(scrollEl.scrollTop);
      }
    }, 3000);
    return () => { if (scrollSaveTimer.current) clearInterval(scrollSaveTimer.current); };
  }, [currentFilePath, sourceMode, setScrollPosition]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || !currentFilePath) return;
    if (e.key === "f" && !e.shiftKey) { e.preventDefault(); setFindVisible(v => !v); }
    if (e.key === "s") {
      e.preventDefault();
      const s = useStore.getState();
      if (s.content !== undefined && s.currentFilePath) {
        writeFile(s.currentFilePath, s.content)
          .then(() => {
            useStore.getState().setDirty(false);
            useStore.getState().setLastSavedAt(Date.now());
          })
          .catch((err) => { console.error("file-write-failed", err); });
      }
    }
  }, [currentFilePath]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Global event: the workspace search panel jumps into the find bar with its
  // query pre-filled (closes the "global search -> in-document locate" loop).
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent).detail?.query;
      if (typeof q === "string" && q) setFindPreset({ query: q, ts: Date.now() });
      setFindVisible(true);
    };
    window.addEventListener("zn-find-open", handler);
    return () => window.removeEventListener("zn-find-open", handler);
  }, []);

  useEffect(() => {
    return () => {
      tokenRef.current = null;
      safeRef.current = false;
      editorReadyRef.current = false;
      if (scrollSaveTimer.current) clearInterval(scrollSaveTimer.current);
      if (crepeRef.current) {
        // Chain onto any in-flight teardown so two destroys never overlap.
        const old = crepeRef.current;
        crepeRef.current = null;
        const prev = pendingDestroyRef.current ?? Promise.resolve();
        prev.then(() => Promise.resolve(old.destroy()).catch((err: any) => { console.warn("editor-destroy-failed", err); }));
      }
    };
  }, []);

  if (!currentFilePath) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-editor)", color: "var(--text-tertiary)", fontSize: 14 }}>
        {t().editor.openNote}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <FindReplaceBar visible={findVisible} onClose={() => setFindVisible(false)}
        preset={findPreset} getPmView={() => pmViewRef.current} getCmView={() => cmViewRef.current} />
      {error && (
        <div style={{ padding: "6px 12px", fontSize: 12, background: "#FEF3C7", color: "#92400E", borderBottom: "1px solid #FCD34D", flexShrink: 0 }}>
          Warning: {error}
        </div>
      )}
      {/* Large-document hint: recommend source mode for very long notes */}
      {!sourceMode && bigFileHint && (
        <div style={{
          padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-toolbar)", borderBottom: "1px solid var(--border)", flexShrink: 0,
          color: "var(--text-secondary)",
        }}>
          <span>{t().editor.bigFileHint}</span>
          <button onClick={() => setSourceMode(true)} style={{
            border: "1px solid var(--border)", background: "var(--bg-editor)", color: "var(--text-primary)",
            borderRadius: 4, padding: "2px 10px", fontSize: 12, cursor: "pointer",
          }}>{t().editor.switchToSource}</button>
          <button onClick={() => setBigFileHint(false)} style={{
            border: "none", background: "transparent", color: "var(--text-tertiary)",
            fontSize: 12, cursor: "pointer",
          }}>{t().editor.dismiss}</button>
        </div>
      )}
      {sourceMode && <SourceEditor viewRef={cmViewRef} />}
      <div
        ref={containerRef}
        style={{
          display: sourceMode ? "none" : "block",
          flex: sourceMode ? undefined : 1,
          overflow: "auto", background: "var(--bg-editor)",
          padding: "40px " + editorPadding + "px",
          opacity: editorReady ? 1 : 0.6,
          transition: "opacity 200ms ease",
          position: "relative",
        }}
      />
      {!sourceMode && !editorReady && currentFilePath && (
        <div style={{ position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)", fontSize: 13, color: "var(--text-tertiary)" }}>
          {t().editor.loading}
        </div>
      )}
      <TableContextMenu
        visible={tableMenuVisible}
        position={tableMenuPos}
        onClose={() => setTableMenuVisible(false)}
        crepeRef={crepeRef}
        savedSelection={tableMenuSel}
      />
      {/* Copy context menu (right-click with selection) */}
      {copyMenuVisible && (
        <div style={{
          position: "fixed", left: copyMenuPos.x, top: copyMenuPos.y, zIndex: 1100,
          background: "var(--bg-toolbar)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", padding: "4px 0",
          minWidth: 160,
        }} onMouseDown={e => e.stopPropagation()}>
          <CopyMenuItem label={t().editor.copyPlainText} onClick={copyPlainText} />
          <CopyMenuItem label={t().editor.copyMarkdown} onClick={copyMarkdown} />
        </div>
      )}
      {/* Image alignment toolbar (right-click an image) */}
      {imgAlignMenu.visible && (
        <div style={{
          position: "fixed", left: imgAlignMenu.x, top: imgAlignMenu.y, zIndex: 1100,
          display: "flex", gap: 2,
          background: "var(--bg-toolbar)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", padding: 4,
        }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          {(["left", "center", "right"] as const).map(a => (
            <button key={a} onClick={() => applyImageAlign(a)} title={t().editor["align_" + a as "align_left"]}
              style={{
                width: 30, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", borderRadius: 6, cursor: "pointer",
                background: imgAlignMenu.align === a ? "var(--bg-sidebar-active)" : "transparent",
                color: imgAlignMenu.align === a ? "var(--text-accent)" : "var(--text-secondary)",
              }}>
              <AlignIcon dir={a} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div onClick={onClick}
      style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", color: "var(--text-primary)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      {label}
    </div>
  );
}

// Alignment icon for the image toolbar (a short bar positioned left/center/right).
function AlignIcon({ dir }: { dir: "left" | "center" | "right" }) {
  const x = dir === "left" ? 2 : dir === "center" ? 5 : 8;
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="2" y1="3.5" x2="14" y2="3.5" />
      <line x1={x} y1="8" x2={x + 6} y2="8" />
      <line x1="2" y1="12.5" x2="14" y2="12.5" />
    </svg>
  );
}
