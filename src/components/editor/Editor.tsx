import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../../store";
import { FindReplaceBar } from "./FindReplaceBar";
import { TableContextMenu } from "./TableContextMenu";
import { t } from "../../i18n";
import { writeFile } from "../../services";
import { saveImage, resolveImageUrl } from "../../services";
import { currentFontStack } from "../../lib/fontStack";
import "@milkdown/crepe/theme/common/style.css";
import { LanguageDescription, LanguageSupport, StreamLanguage, indentUnit } from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";
import { EditorState as CMEditorState } from "@codemirror/state";

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

export function Editor() {
  const currentFilePath = useStore(s => s.currentFilePath);
  const sourceMode = useStore(s => s.sourceMode);
  const content = useStore(s => s.content);
  const setContent = useStore(s => s.setContent);
  const setCursorPosition = useStore(s => s.setCursorPosition);
  const scrollPosition = useStore(s => s.scrollPosition);
  const setScrollPosition = useStore(s => s.setScrollPosition);
  const setEditorRef = useStore(s => s.setEditorRef);
  const tabSize = useStore(s => s.tabSize);
  const editorPadding = useStore(s => s.editorPadding);
  const typewriterMode = useStore(s => s.typewriterMode);
  const focusMode = useStore(s => s.focusMode);
  const resolvedMode = useStore(s => s.resolvedMode);
  const fontFamily = useStore(s => s.fontFamily);
  const [error, setError] = useState<string | null>(null);
  const [findVisible, setFindVisible] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  // Table context menu state
  const [tableMenuVisible, setTableMenuVisible] = useState(false);
  const [tableMenuPos, setTableMenuPos] = useState({ x: 0, y: 0 });
  // Copy context menu state (right-click with text selected)
  const [copyMenuVisible, setCopyMenuVisible] = useState(false);
  const [copyMenuPos, setCopyMenuPos] = useState({ x: 0, y: 0 });
  // Image alignment toolbar state (click an image to align it)
  const [imgAlignMenu, setImgAlignMenu] = useState<{ visible: boolean; x: number; y: number; pos: number; align: string }>({ visible: false, x: 0, y: 0, pos: -1, align: "center" });

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const crepeRef = useRef<any>(null);
  const safeRef = useRef<boolean>(true);
  const tokenRef = useRef<object | null>(null);
  const scrollSaveTimer = useRef<number>(0);
  const focusCleanupRef = useRef<(() => void) | null>(null);
  const editorReadyRef = useRef(false);
  // ProseMirror view ref (set after editor init) so effects can dispatch transactions.
  const pmViewRef = useRef<any>(null);

  // Registry of rendered mermaid blocks: applyPreview callback -> mermaid source.
  // applyPreview updates Milkdown's internal preview ref (the source of truth),
  // so re-rendering through it survives theme/font changes without being reverted.
  const mermaidApplyPreviews = useRef(new Map<(v: null | string | HTMLElement) => void, string>());

  // Initialize Milkdown Crepe editor
  useEffect(() => {
    const path = currentFilePath;
    const container = containerRef.current;
    if (!container || !path) return;

    // In source mode, destroy any existing editor and return (no Milkdown needed)
    if (sourceMode) {
      if (crepeRef.current) {
        const oldCrepe = crepeRef.current;
        crepeRef.current = null;
        oldCrepe.destroy().catch(() => {});
      }
      tokenRef.current = null;
      safeRef.current = false;
      editorReadyRef.current = false;
      setEditorReady(false);
      setEditorRef(null);
      if (container) container.innerHTML = "";
      return;
    }

    const token = {};
    tokenRef.current = token;
    safeRef.current = false;
    editorReadyRef.current = false;
    setEditorReady(false);
    setError(null);
    // Fresh editor: drop any stale mermaid applyPreview registrations.
    mermaidApplyPreviews.current.clear();

    const init = async () => {
      if (crepeRef.current) {
        try { await crepeRef.current.destroy(); } catch { /* */ }
        crepeRef.current = null;
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
                  } catch {
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
              ...ps.filter((p: any) => p[0] !== "html"),
              ["html", (node: any, view: any, getPos: any) => createHtmlNodeView(node, view, getPos)],
            ]);
          });
        } catch { /* html override is best-effort */ }

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
        } catch { /* image-block override is best-effort */ }

        await crepe.create();
        if (tokenRef.current !== token) return;

        // Obtain the ProseMirror view. The focus highlight is implemented as a ProseMirror
        // DECORATION (not an external DOM class): adding a class directly to a ProseMirror-managed
        // element is detected as an external mutation and gets re-rendered away, whereas a
        // decoration is applied by ProseMirror itself on every render and thus persists.
        const { editorViewCtx } = await import("@milkdown/kit/core");
        const { Plugin, PluginKey, EditorState } = await import("@milkdown/kit/prose/state");
        const { Decoration, DecorationSet } = await import("@milkdown/kit/prose/view");
        const pmView = (crepe as any).editor.action((ctx: any) => ctx.get(editorViewCtx));

        const FOCUS_TYPES = new Set(["heading", "paragraph", "list_item", "blockquote", "code_block"]);
        // Only reveal the markdown source of the focused block AFTER the user has
        // actually interacted (clicked/typed). On first open the cursor lands at the
        // start of the doc, but we don't want the heading to show its "#" source yet.
        let hasInteracted = false;
        const computeFocusDecos = (state: any) => {
          const focusModeOn = useStore.getState().focusMode;
          const decos: any[] = [];
          const sel = state.selection;
          if (!sel || !sel.empty) return DecorationSet.empty;
          const $head = sel.$head;
          // Tables always stay fully rendered (neither source-reveal nor dimming).
          let inTable = false;
          for (let d = $head.depth; d >= 1; d--) {
            const tn = $head.node(d).type.name;
            if (tn === "table_cell" || tn === "table_header") { inTable = true; break; }
          }
          if (inTable) return DecorationSet.empty;

          // (A) Source-reveal highlight on the focused block (gated by interaction).
          if (hasInteracted) {
            let from = -1, nodeSize = 0;
            // Prefer the enclosing list_item / blockquote so the whole item/quote is highlighted
            for (let d = $head.depth; d >= 1 && from < 0; d--) {
              const name = $head.node(d).type.name;
              if (name === "list_item" || name === "blockquote") { from = $head.before(d); nodeSize = $head.node(d).nodeSize; }
            }
            if (from < 0) {
              for (let d = $head.depth; d >= 1 && from < 0; d--) {
                const name = $head.node(d).type.name;
                if (FOCUS_TYPES.has(name)) { from = $head.before(d); nodeSize = $head.node(d).nodeSize; }
              }
            }
            if (from >= 0) decos.push(Decoration.node(from, from + nodeSize, { class: "zn-block-focused" }));
          }

          // (B) Focus mode: dim every top-level block except the one with the cursor.
          if (focusModeOn && $head.depth >= 1) {
            const topFrom = $head.before(1);
            state.doc.forEach((node: any, offset: number) => {
              if (offset !== topFrom) {
                decos.push(Decoration.node(offset, offset + node.nodeSize, { class: "zn-dimmed" }));
              }
            });
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
        // Typewriter mode: keep the line under the cursor vertically centered.
        const typewriterPlugin = new Plugin({
          key: new PluginKey("znTypewriter"),
          view: () => ({
            update: (view: any, prevState: any) => {
              if (!useStore.getState().typewriterMode) return;
              // Only scroll when the cursor actually moved (selectionSet/docChanged
              // are Transaction props, not on EditorState — compare selections).
              if (view.state.selection.eq(prevState.selection)) return;
              try {
                const $head = view.state.selection.$head;
                if ($head.depth < 1) return;
                const blockDom = view.nodeDOM($head.before(1));
                if (blockDom && typeof blockDom.scrollIntoView === "function") {
                  // Defer to the browser's native centering (robust across layouts).
                  blockDom.scrollIntoView({ block: "center", behavior: "auto" });
                }
              } catch { /* ignore */ }
            },
          }),
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
        // Inject the plugins by reconfiguring the state. Safe to do right after create():
        // the undo history and all plugin states are still empty.
        pmView.updateState(EditorState.create({
          doc: pmView.state.doc,
          selection: pmView.state.selection,
          plugins: [...pmView.state.plugins, focusDecoPlugin, typewriterPlugin, imageAlignPlugin],
        }));
        pmViewRef.current = pmView;

        // Mark interaction in the CAPTURE phase so the flag is set before
        // ProseMirror's own handlers dispatch the selection transaction.
        const markInteracted = () => { hasInteracted = true; };
        container.addEventListener("pointerdown", markInteracted, { capture: true, passive: true });
        container.addEventListener("keydown", markInteracted, { capture: true, passive: true });

        safeRef.current = true;
        editorReadyRef.current = true;
        setEditorReady(true);
        setEditorRef(crepeRef);


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
            if (svg) openMermaidZoom(svg as SVGElement);
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

        function openMermaidZoom(svg: SVGElement) {
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
          const cloned = svg.cloneNode(true) as SVGElement;
          cloned.removeAttribute("width");
          cloned.removeAttribute("height");
          cloned.style.maxWidth = "none";
          cloned.style.maxHeight = "none";
          cloned.style.flexShrink = "0";

          // Zoom (wheel) & pan (drag diagram) state. The SVG is sized as a percentage
          // of the body so it scales with the resizable box; panning translates it.
          let zoom = 1, panX = 0, panY = 0;
          const applyZoom = () => {
            cloned.style.width = (100 * zoom) + "%";
            cloned.style.height = (100 * zoom) + "%";
          };
          const applyPan = () => {
            cloned.style.transform = "translate(" + panX + "px, " + panY + "px)";
          };
          applyZoom();

          // Drag on the diagram itself -> pan the diagram (box stays put).
          cloned.addEventListener("mousedown", (e) => {
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
        }

        // Ensure every mermaid preview panel has a zoom button (re-add after re-renders).
        const ZOOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>';
        const ensureZoomButtons = () => {
          if (tokenRef.current !== token) return;
          container.querySelectorAll(".milkdown-code-block .preview-panel").forEach((panel) => {
            if (!panel.querySelector(".preview svg")) return; // only mermaid previews have an svg
            if (panel.querySelector(".zn-mermaid-zoom-btn")) return;
            const btn = document.createElement("button");
            btn.className = "zn-mermaid-zoom-btn";
            btn.type = "button";
            btn.title = t().editor.zoomOpen;
            btn.innerHTML = ZOOM_ICON;
            panel.appendChild(btn);
          });
        };
        let zoomBtnTimer = 0;
        const zoomBtnObserver = new MutationObserver(() => {
          if (zoomBtnTimer) return;
          zoomBtnTimer = window.setTimeout(() => { zoomBtnTimer = 0; ensureZoomButtons(); }, 300);
        });
        zoomBtnObserver.observe(container, { childList: true, subtree: true });
        ensureZoomButtons();

        focusCleanupRef.current = () => {
          container.removeEventListener("keyup", onFocusInput);
          container.removeEventListener("pointerup", onFocusInput);
          container.removeEventListener("click", onFocusInput);
          container.removeEventListener("focusin", onFocusInput);
          container.removeEventListener("click", onPreviewClick);
          container.removeEventListener("focusout", onCodeBlockBlur);
          container.removeEventListener("pointerdown", markInteracted, { capture: true });
          container.removeEventListener("keydown", markInteracted, { capture: true });
          document.removeEventListener("selectionchange", onSelChange);
          zoomBtnObserver.disconnect();
          if (zoomBtnTimer) clearTimeout(zoomBtnTimer);
          closeMermaidZoom();
        };

        if (scrollPosition > 0) {
          setTimeout(() => {
            if (tokenRef.current !== token) return;
            const scrollEl = container.querySelector(".ProseMirror")?.parentElement;
            if (scrollEl) scrollEl.scrollTop = scrollPosition;
          }, 500);
        }
      } catch (err: any) {
        if (tokenRef.current === token) {
          console.error("Milkdown init failed:", err);
          setError(err?.message || t().editor.initFailed);
        }
      }
    };

    init();

    return () => {
      tokenRef.current = null;
      safeRef.current = false;
      editorReadyRef.current = false;
      focusCleanupRef.current?.();
      if (crepeRef.current) {
        try { crepeRef.current.destroy(); } catch { /* */ }
        crepeRef.current = null;
      }
    };
  }, [currentFilePath, sourceMode]);

  // Right-click context menu: table menu inside tables, copy menu on text selection
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sourceMode) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest("th, td") as HTMLElement | null;
      if (cell && target.closest(".milkdown-table-block")) {
        e.preventDefault();
        setCopyMenuVisible(false);
        setTableMenuPos({ x: e.clientX, y: e.clientY });
        setTableMenuVisible(true);
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
  }, [sourceMode, editorReady]);

  // Click an image to open the alignment toolbar (left/center/right).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sourceMode || !editorReady) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const img = target.closest('img[data-type="image-block"]') as HTMLElement | null;
      if (!img) { setImgAlignMenu(m => (m.visible ? { ...m, visible: false } : m)); return; }
      const pm = pmViewRef.current;
      if (!pm) return;
      try {
        const pos = pm.posAtDOM(img, 0);
        const $pos = pm.state.doc.resolve(pos);
        // Find the enclosing image-block node and its start position.
        let nodePos = -1, align = "center";
        for (let d = $pos.depth; d >= 0; d--) {
          const n = $pos.node(d);
          if (n.type.name === "image-block") { nodePos = $pos.before(d); align = n.attrs.align || "center"; break; }
        }
        if (nodePos < 0) { nodePos = pos; }
        const rect = img.getBoundingClientRect();
        setImgAlignMenu({ visible: true, x: rect.left + rect.width / 2, y: rect.top - 8, pos: nodePos, align });
      } catch { /* ignore */ }
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
    } catch { /* ignore */ }
    setImgAlignMenu(m => ({ ...m, visible: false }));
  }, [imgAlignMenu.pos]);

  // Re-render already-drawn mermaid diagrams when the theme or font changes.
  // Milkdown only re-runs renderPreview on text/language edits, so a theme/font
  // switch would otherwise leave the old-colored SVGs in place. The .preview
  // container is opaque to ProseMirror (Milkdown itself fills it via innerHTML),
  // so replacing the SVG there is safe.
  // When focus/typewriter mode is toggled, force the decoration plugin to
  // recompute (it only runs on transactions) and center the cursor immediately
  // for typewriter mode.
  useEffect(() => {
    if (!editorReady || sourceMode) return;
    const pm = pmViewRef.current;
    if (!pm) return;
    try {
      pm.dispatch(pm.state.tr.setMeta("znModeToggle", true));
      if (typewriterMode) {
        const $head = pm.state.selection.$head;
        if ($head.depth >= 1) {
          const blockDom = pm.nodeDOM($head.before(1));
          if (blockDom && typeof blockDom.scrollIntoView === "function") {
            blockDom.scrollIntoView({ block: "center", behavior: "auto" });
          }
        }
      }
    } catch { /* ignore */ }
  }, [focusMode, typewriterMode, editorReady, sourceMode]);

  const mermaidThemeFontFirstRun = useRef(true);
  useEffect(() => {
    // Debug logger (writes to export-debug.log so we can diagnose in release builds)
    const log = (msg: string) => {
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("export_debug_log", { msg: "[mermaid-re] " + msg })).catch(() => {});
    };
    if (mermaidThemeFontFirstRun.current) { mermaidThemeFontFirstRun.current = false; log("skip first run"); return; }
    log("effect fired: resolvedMode=" + resolvedMode + " font=" + fontFamily + " sourceMode=" + sourceMode + " editorReady=" + editorReady + " registered=" + mermaidApplyPreviews.current.size);
    if (sourceMode || !editorReady) { log("early return (sourceMode or not ready)"); return; }
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
        log("re-rendering " + bySource.size + " unique mermaid sources, isDark=" + isDark);
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
          } catch (err) { log("render failed: " + String(err)); }
        }
        log("re-rendered " + reRendered + " mermaid diagrams via applyPreview");
      } catch (err) { log("mermaid import/init failed: " + String(err)); }
    })();
    return () => { cancelled = true; };
  }, [resolvedMode, fontFamily, sourceMode, editorReady]);

  // Copy actions for the context menu
  const copyPlainText = useCallback(() => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      navigator.clipboard.writeText(sel.toString()).catch(() => {});
    }
    setCopyMenuVisible(false);
  }, []);
  const copyMarkdown = useCallback(() => {
    // execCommand("copy") triggers ProseMirror/Milkdown clipboard serializer (markdown)
    document.execCommand("copy");
    setCopyMenuVisible(false);
  }, []);

  // Save scroll position periodically and on unmount
  useEffect(() => {
    return () => {
      if (scrollSaveTimer.current) clearInterval(scrollSaveTimer.current);
      const scrollEl = containerRef.current?.querySelector(".ProseMirror")?.parentElement;
      if (scrollEl && currentFilePath) {
        setScrollPosition(scrollEl.scrollTop);
        useStore.getState().cacheCurrentFileState();
      }
    };
  }, [currentFilePath, setScrollPosition]);

  useEffect(() => {
    scrollSaveTimer.current = window.setInterval(() => {
      const scrollEl = containerRef.current?.querySelector(".ProseMirror")?.parentElement;
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
          .then(() => useStore.getState().setDirty(false))
          .catch(() => {});
      }
    }
  }, [currentFilePath]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Textarea cursor tracking
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    const pos = e.target.selectionStart;
    const lines = val.substring(0, pos).split("\n");
    setCursorPosition(lines.length, lines[lines.length - 1].length + 1);
  }, [setContent, setCursorPosition]);

  const handleTextareaClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    setTimeout(() => {
      const pos = ta.selectionStart;
      const lines = ta.value.substring(0, pos).split("\n");
      setCursorPosition(lines.length, lines[lines.length - 1].length + 1);
    }, 0);
  }, [setCursorPosition]);

  // Tab key inserts `tabSize` spaces in source mode (honors the indent setting).
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const spaces = " ".repeat(tabSize);
    const next = ta.value.slice(0, start) + spaces + ta.value.slice(end);
    setContent(next);
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + tabSize; });
  }, [tabSize, setContent]);

  useEffect(() => {
    return () => {
      tokenRef.current = null;
      safeRef.current = false;
      editorReadyRef.current = false;
      if (scrollSaveTimer.current) clearInterval(scrollSaveTimer.current);
      if (crepeRef.current) {
        try { crepeRef.current.destroy(); } catch { /* */ }
        crepeRef.current = null;
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
      <FindReplaceBar visible={findVisible} onClose={() => setFindVisible(false)} />
      {error && (
        <div style={{ padding: "6px 12px", fontSize: 12, background: "#FEF3C7", color: "#92400E", borderBottom: "1px solid #FCD34D", flexShrink: 0 }}>
          Warning: {error}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleTextareaChange}
        onClick={handleTextareaClick}
        onKeyDown={handleTextareaKeyDown}
        onKeyUp={() => {
          const ta = textareaRef.current;
          if (ta) {
            const pos = ta.selectionStart;
            const lines = ta.value.substring(0, pos).split("\n");
            setCursorPosition(lines.length, lines[lines.length - 1].length + 1);
          }
        }}
        style={{
          display: sourceMode ? "block" : "none",
          flex: sourceMode ? 1 : undefined,
          width: "100%", border: "none", outline: "none", resize: "none",
          padding: "40px " + editorPadding + "px", fontSize: 16, lineHeight: 1.85,
          fontFamily: '"Cascadia Code","Fira Code",Consolas,"Microsoft YaHei",monospace',
          background: "var(--bg-editor)", color: "var(--text-primary)",
        }}
      />
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
      {/* Image alignment toolbar (click an image) */}
      {imgAlignMenu.visible && (
        <div style={{
          position: "fixed", left: imgAlignMenu.x, top: imgAlignMenu.y, zIndex: 1100,
          transform: "translate(-50%, -100%)", display: "flex", gap: 2,
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="2" y1="3.5" x2="14" y2="3.5" />
      <line x1={x} y1="8" x2={x + 6} y2="8" />
      <line x1="2" y1="12.5" x2="14" y2="12.5" />
    </svg>
  );
}
