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
          // ProseMirror-native selection tracking — reliable trigger for the
          // Typora-style focus-line source reveal (no rAF/DOM-event dependency).
          api.selectionUpdated(() => {
            if (tokenRef.current !== token || !safeRef.current) return;
            setTimeout(updateFocusBlock, 0);
          });
        });

        crepeRef.current = crepe;
        if (tokenRef.current !== token) return;

        await crepe.create();
        if (tokenRef.current !== token) return;

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

        // ---- Typora-style focus line source reveal ----
        let focusBlockEl: HTMLElement | null = null;

        const updateFocusBlock = () => {
          if (!safeRef.current || tokenRef.current !== token) return;
          const pm = container.querySelector(".ProseMirror") as HTMLElement | null;
          if (!pm) return;

          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
            if (focusBlockEl) { focusBlockEl.classList.remove("zn-block-focused"); focusBlockEl = null; }
            return;
          }

          // Get element at cursor; use closest() to find the nearest
          // semantic block regardless of Milkdown wrapper divs
          const startNode = sel.getRangeAt(0).startContainer;
          const cursorEl: HTMLElement | null =
            startNode instanceof HTMLElement ? startNode : startNode.parentElement;
          if (!cursorEl) return;

          const BLOCK_SEL = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre";
          let blockEl = cursorEl.closest(BLOCK_SEL) as HTMLElement | null;
          if (!blockEl || !pm.contains(blockEl)) {
            if (focusBlockEl) { focusBlockEl.classList.remove("zn-block-focused"); focusBlockEl = null; }
            return;
          }

          // Tables always stay fully rendered
          if (blockEl.closest("th, td")) {
            if (focusBlockEl) { focusBlockEl.classList.remove("zn-block-focused"); focusBlockEl = null; }
            return;
          }

          // For content nested inside list items / blockquotes, target the outer
          // semantic block so the whole item/quote gets highlighted.
          const outerLi = blockEl.closest("li") as HTMLElement | null;
          const outerBq = blockEl.closest("blockquote") as HTMLElement | null;
          if (outerLi && pm.contains(outerLi)) {
            blockEl = outerLi;
          } else if (outerBq && pm.contains(outerBq)) {
            blockEl = outerBq;
          }

          if (blockEl !== focusBlockEl) {
            if (focusBlockEl) focusBlockEl.classList.remove("zn-block-focused");
            focusBlockEl = blockEl;
            focusBlockEl.classList.add("zn-block-focused");
          }
        };;

        // Multiple event sources for robust tracking
        const onFocusInput = () => {
          if (!safeRef.current) return;
          updateCursor();
          setTimeout(updateFocusBlock, 0);
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

        focusCleanupRef.current = () => {
          container.removeEventListener("keyup", onFocusInput);
          container.removeEventListener("pointerup", onFocusInput);
          container.removeEventListener("click", onFocusInput);
          container.removeEventListener("focusin", onFocusInput);
          container.removeEventListener("click", onPreviewClick);
          container.removeEventListener("focusout", onCodeBlockBlur);
          document.removeEventListener("selectionchange", onSelChange);
          if (focusBlockEl) focusBlockEl.classList.remove("zn-block-focused");
          focusBlockEl = null;
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
