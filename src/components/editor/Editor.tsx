import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../../store";
import { FindReplaceBar } from "./FindReplaceBar";
import { TableContextMenu } from "./TableContextMenu";
import { t } from "../../i18n";
import "@milkdown/crepe/theme/common/style.css";
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";

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

export function Editor() {
  const currentFilePath = useStore(s => s.currentFilePath);
  const sourceMode = useStore(s => s.sourceMode);
  const content = useStore(s => s.content);
  const setContent = useStore(s => s.setContent);
  const setCursorPosition = useStore(s => s.setCursorPosition);
  const scrollPosition = useStore(s => s.scrollPosition);
  const setScrollPosition = useStore(s => s.setScrollPosition);
  const setEditorRef = useStore(s => s.setEditorRef);
  const [error, setError] = useState<string | null>(null);
  const [findVisible, setFindVisible] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  // Table context menu state
  const [tableMenuVisible, setTableMenuVisible] = useState(false);
  const [tableMenuPos, setTableMenuPos] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const crepeRef = useRef<any>(null);
  const safeRef = useRef<boolean>(true);
  const tokenRef = useRef<object | null>(null);
  const scrollSaveTimer = useRef<number>(0);
  const focusCleanupRef = useRef<(() => void) | null>(null);
  const editorReadyRef = useRef(false);

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
              // Native Milkdown code-block preview — rendered inside the node view,
              // so ProseMirror never parses the SVG back into the document.
              renderPreview: (language: string, content: string, applyPreview: (v: null | string | HTMLElement) => void) => {
                if (language.trim().toLowerCase() !== "mermaid") return null;
                void (async () => {
                  try {
                    const mermaidMod = await import("mermaid");
                    if (tokenRef.current !== token) return;
                    const isDark = useStore.getState().resolvedMode === "dark";
                    mermaidMod.default.initialize({
                      startOnLoad: false,
                      theme: isDark ? "dark" : "default",
                      securityLevel: "loose",
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
        const computeFocusDecos = (state: any) => {
          const sel = state.selection;
          if (!sel || !sel.empty) return DecorationSet.empty;
          const $head = sel.$head;
          // Tables always stay fully rendered
          for (let d = $head.depth; d >= 1; d--) {
            const tn = $head.node(d).type.name;
            if (tn === "table_cell" || tn === "table_header") return DecorationSet.empty;
          }
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
          if (from < 0) return DecorationSet.empty;
          return DecorationSet.create(state.doc, [Decoration.node(from, from + nodeSize, { class: "zn-block-focused" })]);
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
        // Inject the plugin by reconfiguring the state. Safe to do right after create():
        // the undo history and all plugin states are still empty.
        pmView.updateState(EditorState.create({
          doc: pmView.state.doc,
          selection: pmView.state.selection,
          plugins: [...pmView.state.plugins, focusDecoPlugin],
        }));

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
        // Throttle selectionchange 鈥?fires very frequently during typing
        let selChangeTimer = 0;
        const onSelChange = () => {
          if (selChangeTimer) return;
          selChangeTimer = window.setTimeout(() => {
            selChangeTimer = 0;
            onFocusInput();
          }, 0);
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
          zoomBtnTimer = window.setTimeout(() => { zoomBtnTimer = 0; ensureZoomButtons(); }, 0);
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

  // Right-click table context menu handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sourceMode) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest("th, td") as HTMLElement | null;
      if (!cell) return;
      const tableBlock = target.closest(".milkdown-table-block");
      if (!tableBlock) return;

      e.preventDefault();
      setTableMenuPos({ x: e.clientX, y: e.clientY });
      setTableMenuVisible(true);
    };

    container.addEventListener("contextmenu", handler);
    return () => container.removeEventListener("contextmenu", handler);
  }, [sourceMode, editorReady]);

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
        import("@tauri-apps/api/core").then(({ invoke }) =>
          invoke("write_file", { path: s.currentFilePath, content: s.content })
            .then(() => useStore.getState().setDirty(false))
            .catch(() => {})
        );
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
          padding: "40px 80px", fontSize: 16, lineHeight: 1.85,
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
          padding: "40px 80px",
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
    </div>
  );
}
