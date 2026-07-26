import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../../store";
import { FindReplaceBar } from "./FindReplaceBar";
import { TableContextMenu } from "./TableContextMenu";
import { t } from "../../i18n";
import "@milkdown/crepe/theme/common/style.css";

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
  const mermaidCleanupRef = useRef<(() => void) | null>(null);
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

        safeRef.current = true;
        editorReadyRef.current = true;
        setEditorReady(true);
        setEditorRef(crepeRef);

        // ---- Mermaid rendering setup ----
        // Uses ProseMirror state directly (bypasses DOM — works even with CodeMirror)
        let mermaidTimer = 0;
        const renderedMermaidKeys = new Set<string>();

        const renderMermaidBlocks = async () => {
          try {
            const mermaidMod = await import("mermaid");
            mermaidMod.default.initialize({
              startOnLoad: false,
              theme: useStore.getState().resolvedMode === "dark" ? "dark" : "default",
              securityLevel: "loose",
            });

            let view: any = null;
            try {
              const { editorViewCtx } = await import("@milkdown/core");
              view = crepe.editor?.ctx?.get(editorViewCtx);
            } catch {
              view = (crepe.editor as any)?.view;
            }
            if (!view?.state?.doc) { console.warn('[ZenNote] No ProseMirror view available'); return; }

            const mermaidNodes: Array<{ pos: number; text: string }> = [];
            view.state.doc.descendants((node: any, pos: number) => {
              if (node.type.name === "code_block" && node.attrs?.language === "mermaid") {
                mermaidNodes.push({ pos, text: node.textContent });
              }
            });

            // Clean previous renders
            document.querySelectorAll(".zn-mermaid-wrapper").forEach(w => {
              const bw = (w as any).__blockWrapper as HTMLElement | undefined;
              if (bw) bw.style.display = "";
              w.remove();
            });

            for (const { pos, text } of mermaidNodes) {
              if (!text.trim()) continue;
              const key = text.substring(0, 80);
              if (renderedMermaidKeys.has(key)) continue;
              renderedMermaidKeys.add(key);

              try {
                const id = "mermaid-" + Math.random().toString(36).slice(2, 10);
                const { svg } = await mermaidMod.default.render(id, text);
                const domPos = view.domAtPos(pos);
                let el: HTMLElement =
                  domPos.node instanceof HTMLElement
                    ? domPos.node
                    : (domPos.node.parentElement as HTMLElement);
                const blockWrapper = el?.closest(".milkdown-code-block") as HTMLElement | null;
                const isDark = useStore.getState().resolvedMode === "dark";

                const wrapper = document.createElement("div");
                wrapper.className = "zn-mermaid-wrapper";
                wrapper.innerHTML = svg;
                wrapper.style.cssText =
                  "display:flex;justify-content:center;padding:16px 0;overflow-x:auto;background:" +
                  (isDark ? "#2A2A2A" : "#F8F8F8") + ";border-radius:8px;margin:8px 0;";

                if (blockWrapper) {
                  blockWrapper.style.display = "none";
                  (wrapper as any).__blockWrapper = blockWrapper;
                  blockWrapper.insertAdjacentElement("afterend", wrapper);
                }
              } catch { /* render failed */ }
            }
          } catch {
            // ProseMirror approach failed — fall back to DOM selection
            // (works when CodeMirror is not active, e.g. placeholder visible)
            try {
              const allPres = container.querySelectorAll("pre[data-language='mermaid']");
              allPres.forEach(pre => {
                const preEl = pre as HTMLElement;
                const text = preEl.textContent?.trim() || "";
                if (!text) return;
                const key = text.substring(0, 80);
                if (renderedMermaidKeys.has(key)) return;
                renderedMermaidKeys.add(key);
                // We can't render here (async), mark for next cycle
              });
            } catch { /* all approaches failed */ }
          }
        };

        // Use MutationObserver to detect code blocks being added/changed
        const mermaidObserver = new MutationObserver(() => {
          if (!safeRef.current || tokenRef.current !== token) return;
          if (mermaidTimer) clearTimeout(mermaidTimer);
          mermaidTimer = window.setTimeout(() => renderMermaidBlocks(), 400);
        });
        mermaidObserver.observe(container, { childList: true, subtree: true, characterData: true });

        // Initial render
        if (mermaidTimer) clearTimeout(mermaidTimer);
        mermaidTimer = window.setTimeout(() => renderMermaidBlocks(), 800);

        // Store cleanup in ref for access outside init scope
        const mermaidCleanup = () => {
          mermaidObserver.disconnect();
          if (mermaidTimer) clearTimeout(mermaidTimer);
          document.querySelectorAll(".zn-mermaid-wrapper").forEach(w => {
            const bw = (w as any).__blockWrapper as HTMLElement | undefined;
            if (bw) bw.style.display = "";
            w.remove();
          });
          renderedMermaidKeys.clear();
        };
        mermaidCleanupRef.current = mermaidCleanup;


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
          requestAnimationFrame(updateFocusBlock);
        };
        container.addEventListener("keyup", onFocusInput, { passive: true });
        container.addEventListener("pointerup", onFocusInput, { passive: true });
        container.addEventListener("click", onFocusInput, { passive: true });
        container.addEventListener("focusin", onFocusInput, { passive: true });
        // Throttle selectionchange 鈥?fires very frequently during typing
        let selChangeTimer = 0;
        const onSelChange = () => {
          if (selChangeTimer) return;
          selChangeTimer = requestAnimationFrame(() => {
            selChangeTimer = 0;
            onFocusInput();
          });
        };
        document.addEventListener("selectionchange", onSelChange);

        requestAnimationFrame(onFocusInput);

        focusCleanupRef.current = () => {
          mermaidCleanupRef.current?.();
          container.removeEventListener("keyup", onFocusInput);
          container.removeEventListener("pointerup", onFocusInput);
          container.removeEventListener("click", onFocusInput);
          container.removeEventListener("focusin", onFocusInput);
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
      mermaidCleanupRef.current?.();
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
