import { useEffect } from "react";
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
  const resolvedMode = useStore(s => s.resolvedMode);

  useEffect(() => {
    ensureMermaid(resolvedMode);
  }, [resolvedMode]);
}
