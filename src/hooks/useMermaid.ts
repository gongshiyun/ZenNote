import { useEffect, useRef } from "react";
import { useStore } from "../store";

let mermaidReady = false;

async function ensureMermaid() {
  if (mermaidReady) return;
  mermaidReady = true;
  try {
    const m = await import("mermaid");
    m.default.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
  } catch { /* */ }
}

export function useMermaid() {
  const content = useStore(s => s.content);
  const currentFilePath = useStore(s => s.currentFilePath);
  const resolvedMode = useStore(s => s.resolvedMode);
  const renderedRef = useRef(new Set<string>());
  const timerRef = useRef<number>(0);

  useEffect(() => { ensureMermaid(); }, []);

  // Reset rendered cache when file changes
  useEffect(() => {
    renderedRef.current = new Set();
  }, [currentFilePath]);

  useEffect(() => {
    if (!currentFilePath) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      if (!mermaidReady) return;

      try {
        const m = await import("mermaid");
        // Update theme based on resolved mode
        m.default.initialize({
          startOnLoad: false,
          theme: resolvedMode === "dark" ? "dark" : "default",
          securityLevel: "loose",
        });
      } catch { /* */ }

      const blocks = document.querySelectorAll(
        ".ProseMirror pre code.language-mermaid"
      );
      for (const block of blocks) {
        const text = block.textContent || "";
        const key = text.substring(0, 80);
        if (renderedRef.current.has(key)) continue;
        renderedRef.current.add(key);

        try {
          const m = await import("mermaid");
          const id = "mermaid-" + Math.random().toString(36).slice(2, 10);
          const { svg } = await m.default.render(id, text);
          const pre = block.parentElement;
          if (pre && pre.tagName === "PRE") {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = svg;
            wrapper.style.cssText =
              "display:flex;justify-content:center;padding:16px 0;overflow-x:auto;";
            // Add dark mode background for the SVG wrapper
            if (resolvedMode === "dark") {
              wrapper.style.background = "#2A2A2A";
              wrapper.style.borderRadius = "8px";
            }
            pre.replaceWith(wrapper);
          }
        } catch {
          // Render failed, keep code block as fallback
        }
      }
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, currentFilePath, resolvedMode]);
}