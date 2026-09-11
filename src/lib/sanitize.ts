import DOMPurify from "dompurify";

const FORBIDDEN_HTML_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "style",
  "video",
  "audio",
  "source",
];

const FORBIDDEN_SVG_TAGS = FORBIDDEN_HTML_TAGS.filter((tag) => tag !== "style");

/**
 * Keep Mermaid's generated presentation CSS while removing styles that could
 * load remote resources or execute code. Internal fragment URLs such as
 * url(#gradient) are required by Mermaid's rendered SVG.
 */
function sanitizeSvgCss(css: string): string {
  return css
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/url\s*\(\s*(?!#)[^)]*\)/gi, "")
    .replace(/(?:expression|behavior)\s*\([^)]*\)/gi, "")
    .replace(/(?:behavior|-moz-binding)\s*:/gi, "")
    .replace(/(?:javascript|vbscript)\s*:/gi, "")
    .replace(/<\/?style\b[^>]*>/gi, "");
}

export function sanitizeHtmlFragment(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: FORBIDDEN_HTML_TAGS,
    FORBID_ATTR: ["srcdoc"],
  });
}

export function sanitizeSvg(svg: string): string {
  const safeSvg = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: FORBIDDEN_SVG_TAGS,
    ADD_TAGS: ["foreignObject", "style"],
    FORBID_ATTR: ["srcdoc"],
    ADD_ATTR: ["style"],
  });

  // DOMPurify intentionally strips HTML element wrappers inside
  // <foreignObject>. Mermaid uses that structure for flow-chart and state
  // labels, so restore the sanitized HTML content after the SVG pass.
  if (typeof document === "undefined") return safeSvg;
  const source = document.createElement("template");
  const target = document.createElement("template");
  source.innerHTML = svg.trim();
  target.innerHTML = safeSvg;
  const sourceObjects = source.content.querySelectorAll("foreignObject");
  const targetObjects = target.content.querySelectorAll("foreignObject");
  target.content.querySelectorAll("style").forEach((style) => {
    style.textContent = sanitizeSvgCss(style.textContent || "");
  });
  targetObjects.forEach((targetObject, index) => {
    const sourceObject = sourceObjects[index];
    if (!sourceObject) return;
    targetObject.innerHTML = sanitizeHtmlFragment(sourceObject.innerHTML);
  });
  return target.innerHTML;
}
