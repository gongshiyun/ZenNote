import { useEffect, useRef } from "react";
import { useStore } from "../store";

let mermaidReady = false;
let mermaidTheme = "";

async function ensureMermaid(theme: string) {
  if (mermaidReady && mermaidTheme === theme) return;
  mermaidTheme = theme;
  try {
    const m = await import("mermaid");
    m.default.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "loose",
    });
    mermaidReady = true;
  } catch { /* */ }
}

export function useMermaid() {
  const content = useStore(s => s.content);
  const currentFilePath = useStore(s => s.currentFilePath);
  const resolvedMode = useStore(s => s.resolvedMode);
  const sourceMode = useStore(s => s.sourceMode);
  const editorRef = useStore(s => s.editorRef);
  const timerRef = useRef<number>(0);
  const renderedKeys = useRef(new Set<string>());

  useEffect(() => {
    ensureMermaid(resolvedMode);
  }, [resolvedMode]);

  // Reset rendered cache when file changes
  useEffect(() => {
    renderedKeys.current = new Set();
  }, [currentFilePath]);

  useEffect(() => {
    if (!currentFilePath || sourceMode) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      await ensureMermaid(resolvedMode);
      if (!mermaidReady) return;

      // Approach 1: Use ProseMirror state (preferred, works even with CodeMirror)
      const crepe = editorRef?.current;
      if (crepe?.editor) {
        try {
          // Access the ProseMirror EditorView through Milkdown's ctx
          // In Milkdown v7, the editor stores ctx, and we can get the view via ctx
          const ctx = crepe.editor.ctx;
          // Try to get the ProseMirror view
          let view: any = null;
          try {
            // Dynamic import to avoid bundling Milkdown internals
            const { editorViewCtx } = await import("@milkdown/core");
            view = ctx.get(editorViewCtx);
          } catch {
            // Fallback: try .view property
            view = (crepe.editor as any).view;
          }
          
          if (view?.state?.doc) {
            const mermaidNodes: Array<{ pos: number; text: string }> = [];
            view.state.doc.descendants((node: any, pos: number) => {
              if (node.type.name === "code_block" && node.attrs?.language === "mermaid") {
                mermaidNodes.push({ pos, text: node.textContent });
              }
            });

            // Clean up old wrappers
            document.querySelectorAll(".zn-mermaid-wrapper").forEach(w => w.remove());

            for (const { pos, text } of mermaidNodes) {
              if (!text.trim()) continue;
              const key = text.substring(0, 80);
              if (renderedKeys.current.has(key)) continue;
              renderedKeys.current.add(key);

              try {
                const m = await import("mermaid");
                const id = "mermaid-" + Math.random().toString(36).slice(2, 10);
                const { svg } = await m.default.render(id, text);

                // Find the DOM node for this position
                const domAtPos = view.domAtPos(pos);
                let targetEl = domAtPos.node as HTMLElement;
                // The node might be a text node or wrapper — find the code block wrapper
                if (targetEl.nodeType === 3) targetEl = targetEl.parentElement!;
                const blockWrapper = targetEl.closest(".milkdown-code-block") as HTMLElement;

                const wrapper = document.createElement("div");
                wrapper.className = "zn-mermaid-wrapper";
                wrapper.innerHTML = svg;
                wrapper.style.cssText =
                  "display:flex;justify-content:center;padding:16px 0;overflow-x:auto;background:" +
                  (resolvedMode === "dark" ? "#2A2A2A" : "#F8F8F8") + ";border-radius:8px;margin:8px 0;";

                if (blockWrapper) {
                  // Hide the code block content and insert SVG after
                  blockWrapper.style.display = "none";
                  blockWrapper.insertAdjacentElement("afterend", wrapper);
                  // Store reference to restore later
                  wrapper.dataset.blockId = "mermaid-" + pos;
                  (wrapper as any).__blockWrapper = blockWrapper;
                } else {
                  // Fallback: insert in the editor container
                  const editorEl = document.querySelector(".ProseMirror")?.parentElement;
                  if (editorEl) editorEl.appendChild(wrapper);
                }
              } catch {
                // Render failed — keep code block as fallback
              }
            }
          }
        } catch {
          // ProseMirror access failed — fall through to DOM approach
        }
      }

      // Approach 2: DOM fallback (for when CodeMirror is disabled or placeholder is visible)
      if (!editorRef?.current?.editor) {
        const blocks = document.querySelectorAll(
          ".ProseMirror pre[data-language='mermaid'] code, .ProseMirror pre code.language-mermaid"
        );
        for (const code of blocks) {
          const pre = code.closest("pre") as HTMLElement | null;
          if (!pre || pre.dataset.mermaidDone === "1") continue;
          const text = code.textContent?.trim() || "";
          if (!text) continue;
          const key = text.substring(0, 80);
          if (renderedKeys.current.has(key)) continue;
          renderedKeys.current.add(key);

          try {
            const m = await import("mermaid");
            const id = "mermaid-" + Math.random().toString(36).slice(2, 10);
            const { svg } = await m.default.render(id, text);
            const wrapper = document.createElement("div");
            wrapper.className = "zn-mermaid-wrapper";
            wrapper.innerHTML = svg;
            wrapper.style.cssText =
              "display:flex;justify-content:center;padding:16px 0;overflow-x:auto;background:" +
              (resolvedMode === "dark" ? "#2A2A2A" : "#F8F8F8") + ";border-radius:8px;margin:8px 0;";
            pre.style.display = "none";
            pre.dataset.mermaidDone = "1";
            pre.insertAdjacentElement("afterend", wrapper);
          } catch { /* */ }
        }
      }
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, currentFilePath, resolvedMode, sourceMode, editorRef]);

  // Cleanup: restore code blocks when unmounting
  useEffect(() => {
    return () => {
      document.querySelectorAll(".zn-mermaid-wrapper").forEach(w => {
        const blockWrapper = (w as any).__blockWrapper as HTMLElement | undefined;
        if (blockWrapper) blockWrapper.style.display = "";
        w.remove();
      });
      renderedKeys.current = new Set();
    };
  }, [currentFilePath]);
}
