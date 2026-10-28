import { currentFontStack } from "./fontStack";

export type MermaidRenderOutcome =
  | { status: "rendered"; svg: string }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

/**
 * Run an async Mermaid render without applying its result after the editor
 * lifecycle that requested it has been replaced.
 */
export async function runMermaidRenderTask(
  render: () => Promise<string | null>,
  isCurrent: () => boolean,
): Promise<MermaidRenderOutcome> {
  if (!isCurrent()) return { status: "stale" };

  try {
    const svg = await render();
    if (svg === null || !isCurrent()) return { status: "stale" };
    return { status: "rendered", svg };
  } catch (error) {
    return isCurrent() ? { status: "failed", error } : { status: "stale" };
  }
}

function token(name: string, fallback: string): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Mermaid theme config derived from the app's design tokens.
 *
 * Mermaid's built-in "default"/"dark" themes ship a saturated lavender palette
 * that fights the warm Claude palette (lavender nodes inside a bone canvas was
 * the single most jarring surface in the editor). We use theme "base" with
 * explicit variables: warm surfaces, ink text, clay borders/lines, and the same
 * font stack as the document.
 *
 * `darkMode` is passed explicitly by callers that already know the resolved
 * scheme; when omitted the `<html class="dark">` switch is used (jsdom has no
 * computed custom properties, so the class is the reliable signal there).
 */
export function mermaidConfig(darkMode?: boolean): Record<string, unknown> {
  const dark =
    darkMode ??
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"));
  const canvas = token("--zn-canvas", dark ? "#262624" : "#faf9f5");
  const surface = token("--zn-surface", dark ? "#30302e" : "#f3f1e9");
  const surfaceStrong = token("--zn-surface-strong", dark ? "#383835" : "#ebe8dd");
  const text = token("--zn-text", dark ? "#f5f4ed" : "#1f1e1d");
  const textSecondary = token("--zn-text-secondary", dark ? "#b8b5ac" : "#6b6862");
  const accent = token("--zn-accent", dark ? "#d97757" : "#c2603f");
  const border = token("--zn-border-strong", dark ? "rgba(250,249,245,0.18)" : "rgba(31,30,29,0.2)");

  return {
    startOnLoad: false,
    theme: "base",
    securityLevel: "antiscript",
    fontFamily: currentFontStack(),
    themeVariables: {
      darkMode: dark,
      background: canvas,
      fontFamily: currentFontStack(),
      fontSize: "14px",

      primaryColor: surface,
      primaryTextColor: text,
      primaryBorderColor: accent,
      secondaryColor: surfaceStrong,
      secondaryTextColor: text,
      secondaryBorderColor: border,
      tertiaryColor: canvas,
      tertiaryTextColor: textSecondary,
      tertiaryBorderColor: border,

      mainBkg: surface,
      nodeBorder: accent,
      nodeTextColor: text,
      clusterBkg: surface,
      clusterBorder: border,
      titleColor: text,

      lineColor: textSecondary,
      textColor: text,
      edgeLabelBackground: canvas,

      actorBkg: surface,
      actorBorder: accent,
      actorTextColor: text,
      actorLineColor: textSecondary,
      signalColor: textSecondary,
      signalTextColor: text,
      labelBoxBkgColor: surfaceStrong,
      labelBoxBorderColor: border,
      labelTextColor: text,
      loopTextColor: text,

      noteBkgColor: surfaceStrong,
      noteTextColor: text,
      noteBorderColor: border,
      activationBkgColor: surfaceStrong,
      activationBorderColor: accent,
      sequenceNumberColor: canvas,

      pie1: accent,
      pie2: "#8a6440",
      pie3: "#66794a",
      pie4: "#4e7595",
      pie5: "#8f6a26",
      pie6: "#a8402a",
      pie7: "#98948a",
      pie8: "#c99a5e",
      pie9: "#7c9a86",
      pie10: "#9a7b8f",
      pie11: "#b5a07a",
      pie12: "#6f8a9a",
      pieTitleTextColor: text,
      pieSectionTextColor: text,
      pieLegendTextColor: text,
      pieStrokeColor: canvas,
      pieOuterStrokeColor: border,

      git0: accent,
      git1: "#8a6440",
      git2: "#66794a",
      git3: "#4e7595",
      git4: "#8f6a26",
      git5: "#98948a",
      git6: "#c99a5e",
      git7: "#7c9a86",
      gitBranchLabel0: canvas,
      gitBranchLabel1: canvas,
      gitBranchLabel2: canvas,
      gitBranchLabel3: canvas,
      gitBranchLabel4: canvas,
      gitBranchLabel5: canvas,
      gitBranchLabel6: canvas,
      gitBranchLabel7: canvas,

      classText: text,
      labelColor: text,
      altBackground: surfaceStrong,
      errorBkgColor: token("--zn-danger-soft", "rgba(168,64,42,0.1)"),
      errorTextColor: token("--zn-danger", "#a8402a"),
    },
  };
}
