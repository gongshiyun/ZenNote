import { useEffect } from "react";
import { useStore } from "../store";
import { currentFontStack } from "../lib/fontStack";

let mermaidReady = false;
let mermaidTheme = "";
let mermaidFont = "";

async function ensureMermaid(theme: string, font: string) {
  if (mermaidReady && mermaidTheme === theme && mermaidFont === font) return;
  mermaidTheme = theme;
  mermaidFont = font;
  try {
    const m = await import("mermaid");
    m.default.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "loose",
      // Follow the user's selected UI font
      fontFamily: currentFontStack(),
    });
    mermaidReady = true;
  } catch { /* */ }
}

export function useMermaid() {
  const resolvedMode = useStore(s => s.resolvedMode);
  const fontFamily = useStore(s => s.fontFamily);

  useEffect(() => {
    ensureMermaid(resolvedMode, fontFamily);
  }, [resolvedMode, fontFamily]);
}
