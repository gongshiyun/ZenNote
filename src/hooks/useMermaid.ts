import { useEffect } from "react";
import { useStore } from "../store";
import { mermaidConfig } from "../lib/mermaidRender";

let mermaidReady = false;
let mermaidKey = "";

async function ensureMermaid() {
  const state = useStore.getState();
  const key = `${state.resolvedMode}|${state.fontFamily}`;
  if (mermaidReady && mermaidKey === key) return;
  mermaidKey = key;
  try {
    const m = await import("mermaid");
    m.default.initialize(mermaidConfig(state.resolvedMode === "dark"));
    mermaidReady = true;
  } catch { /* mermaid unavailable */ }
}

export function useMermaid() {
  const resolvedMode = useStore(s => s.resolvedMode);
  const fontFamily = useStore(s => s.fontFamily);

  useEffect(() => {
    void ensureMermaid();
    // Re-initialise when the colour scheme or font stack changes; the config
    // itself is resolved from the live CSS tokens.
  }, [resolvedMode, fontFamily]);
}
