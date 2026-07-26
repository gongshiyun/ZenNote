import { useEffect, useRef } from "react";
import { useStore } from "../store";

let mermaidReady = false;
let mermaidInitializedTheme = "";

async function ensureMermaid(theme: string) {
  if (!mermaidReady || mermaidInitializedTheme !== theme) {
    mermaidReady = true;
    mermaidInitializedTheme = theme;
    try {
      const m = await import("mermaid");
      m.default.initialize({
        startOnLoad: false,
        theme: theme === "dark" ? "dark" : "default",
        securityLevel: "loose",
      });
    } catch { /* */ }
  }
}

export function useMermaid() {
  const content = useStore(s => s.content);
  const currentFilePath = useStore(s => s.currentFilePath);
  const resolvedMode = useStore(s => s.resolvedMode);
  const sourceMode = useStore(s => s.sourceMode);
  const timerRef = useRef<number>(0);

  // Init mermaid with current theme
  useEffect(() => {
    ensureMermaid(resolvedMode);
  }, [resolvedMode]);

  useEffect(() => {
    // Don't render mermaid in source mode or if no file open
    if (!currentFilePath || sourceMode) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      if (!mermaidReady) await ensureMermaid(resolvedMode);
      if (!mermaidReady) return;

      // Clean up previously rendered wrappers (mermaid content changed)
      document.querySelectorAll(".zn-mermaid-wrapper").forEach(w => {
        const pre = w.previousElementSibling;
        if (pre && pre.tagName === "PRE") {
          const preEl = pre as HTMLElement;
          preEl.style.display = "";
          delete preEl.dataset.mermaidDone;
        }
        w.remove();
      });

      // Milkdown stores language as: <pre data-language="mermaid"><code>...</code></pre>
      // Also supports: <pre><code class="language-mermaid">...</code></pre>
      const blocks = document.querySelectorAll(
        ".ProseMirror pre[data-language='mermaid'] code, .ProseMirror pre code.language-mermaid"
      );

      for (const code of blocks) {
        const pre = code.closest("pre") as HTMLElement | null;
        if (!pre || pre.dataset.mermaidDone === "1") continue;

        const text = code.textContent || "";
        if (!text.trim()) continue;

        try {
          const m = await import("mermaid");
          const id = "mermaid-" + Math.random().toString(36).slice(2, 10);
          const { svg } = await m.default.render(id, text);

          const wrapper = document.createElement("div");
          wrapper.className = "zn-mermaid-wrapper";
          wrapper.innerHTML = svg;
          wrapper.style.cssText =
            "display:flex;justify-content:center;padding:16px 0;overflow-x:auto;background:" +
            (resolvedMode === "dark" ? "#2A2A2A" : "#F8F8F8") + ";border-radius:8px;";

          // Hide <pre> (keep in DOM for ProseMirror) and insert SVG after
          pre.style.display = "none";
          pre.dataset.mermaidDone = "1";
          pre.insertAdjacentElement("afterend", wrapper);
        } catch {
          // Render failed — keep code block as fallback
        }
      }
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, currentFilePath, resolvedMode, sourceMode]);
}
