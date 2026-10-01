/**
 * Shared zoom viewer for diagrams and images.
 *
 * Extracted from the Crepe editor so the Live Preview editor gets identical
 * behaviour (click a rendered Mermaid diagram or image to enlarge it in a
 * floating, movable, resizable, zoomable box). The CSS lives in globals.css
 * under `.zn-mermaid-zoom-*` and is shared by both callers.
 *
 * Behaviour preserved from the original, deliberately:
 *   - box opens centred at 85% of the viewport, capped at 1400px wide
 *   - wheel zooms 0.2x .. 10x in 1.12 steps
 *   - dragging the diagram pans it; dragging the box background moves the box
 *   - eight resize handles, floor of 280x200
 *   - Escape or a click on the dimmed backdrop closes
 *   - SVGs scale as a percentage of the body so their viewBox keeps them
 *     undistorted; images are sized in px from their NATURAL dimensions, so a
 *     non-matching box ratio can never stretch them
 */
import { fitContainScale } from "../../lib/imageZoom";
import { t } from "../../i18n";

let overlay: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function closeZoomOverlay(): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
}

function startResize(ev: MouseEvent, box: HTMLElement, dir: string): void {
  ev.preventDefault();
  ev.stopPropagation();
  const startX = ev.clientX;
  const startY = ev.clientY;
  const r = box.getBoundingClientRect();
  const startW = r.width;
  const startH = r.height;
  const startL = r.left;
  const startT = r.top;
  const minW = 280;
  const minH = 200;

  const onMove = (e: MouseEvent) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let w = startW;
    let h = startH;
    let l = startL;
    let tp = startT;
    if (dir.includes("e")) w = Math.max(minW, startW + dx);
    if (dir.includes("s")) h = Math.max(minH, startH + dy);
    if (dir.includes("w")) {
      w = Math.max(minW, startW - dx);
      l = startL + (startW - w);
    }
    if (dir.includes("n")) {
      h = Math.max(minH, startH - dy);
      tp = startT + (startH - h);
    }
    box.style.width = w + "px";
    box.style.height = h + "px";
    box.style.left = l + "px";
    box.style.top = tp + "px";
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

/** Open the zoom viewer on a rendered SVG diagram or an <img>. */
export function openZoomOverlay(target: SVGElement | HTMLImageElement): void {
  closeZoomOverlay();

  const root = document.createElement("div");
  root.className = "zn-mermaid-zoom-overlay";

  const box = document.createElement("div");
  box.className = "zn-mermaid-zoom-box";
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(vw * 0.85, 1400);
  const h = vh * 0.85;
  box.style.width = `${w}px`;
  box.style.height = `${h}px`;
  box.style.left = `${(vw - w) / 2}px`;
  box.style.top = `${(vh - h) / 2}px`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "zn-mermaid-zoom-close";
  closeBtn.type = "button";
  closeBtn.title = t().editor.zoomClose;
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  closeBtn.addEventListener("click", closeZoomOverlay);

  const body = document.createElement("div");
  body.className = "zn-mermaid-zoom-body";
  const cloned = target.cloneNode(true) as SVGElement | HTMLImageElement;
  cloned.removeAttribute("width");
  cloned.removeAttribute("height");
  cloned.style.maxWidth = "none";
  cloned.style.maxHeight = "none";
  cloned.style.flexShrink = "0";
  const imgEl = target instanceof HTMLImageElement ? (cloned as HTMLImageElement) : null;
  if (imgEl) imgEl.draggable = false;

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let imgBaseW = 0;
  let imgBaseH = 0;

  const fitImageToBox = () => {
    if (!imgEl) return;
    const bodyRect = body.getBoundingClientRect();
    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;
    // Contain, never crop; small images stay at their true size.
    const scale = fitContainScale(bodyRect.width, bodyRect.height, natW, natH);
    if (!scale) return;
    imgBaseW = natW * scale;
    imgBaseH = natH * scale;
  };

  const applyZoom = () => {
    if (imgEl) {
      if (!imgBaseW) fitImageToBox();
      if (imgBaseW) {
        imgEl.style.width = `${imgBaseW * zoom}px`;
        imgEl.style.height = `${imgBaseH * zoom}px`;
      } else {
        // Metadata not ready: keep intrinsic sizing rather than distort.
        imgEl.style.width = "auto";
        imgEl.style.height = "auto";
      }
    } else {
      cloned.style.width = `${100 * zoom}%`;
      cloned.style.height = `${100 * zoom}%`;
    }
  };
  const applyPan = () => {
    cloned.style.transform = `translate(${panX}px, ${panY}px)`;
  };
  applyZoom();

  // Drag the diagram itself -> pan the diagram (the box stays put).
  cloned.addEventListener("mousedown", ev => {
    const e = ev as MouseEvent;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = panX;
    const startPanY = panY;
    const onMove = (m: MouseEvent) => {
      panX = startPanX + m.clientX - startX;
      panY = startPanY + m.clientY - startY;
      applyPan();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  body.appendChild(cloned);
  box.appendChild(closeBtn);
  box.appendChild(body);

  // Drag the box's empty area -> move the whole box.
  box.addEventListener("mousedown", e => {
    const tgt = e.target as Element;
    if (tgt.closest(".zn-mermaid-zoom-close") || tgt.closest(".zn-mermaid-zoom-handle")) return;
    if (tgt === cloned || cloned.contains(tgt)) return; // the diagram pans instead
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startL = parseFloat(box.style.left) || 0;
    const startT = parseFloat(box.style.top) || 0;
    const onMove = (m: MouseEvent) => {
      box.style.left = `${startL + m.clientX - startX}px`;
      box.style.top = `${startT + m.clientY - startY}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const handle = document.createElement("div");
    handle.className = `zn-mermaid-zoom-handle zn-mermaid-zoom-handle-${dir}`;
    handle.addEventListener("mousedown", ev => startResize(ev, box, dir));
    box.appendChild(handle);
  }

  // Wheel -> zoom the diagram, clamped so it can neither vanish nor explode.
  root.addEventListener(
    "wheel",
    e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoom = Math.min(10, Math.max(0.2, zoom * factor));
      applyZoom();
    },
    { passive: false },
  );

  root.appendChild(box);
  // Click the dimmed backdrop (outside the box) to close.
  root.addEventListener("mousedown", ev => {
    if (ev.target === root) closeZoomOverlay();
  });

  document.body.appendChild(root);
  overlay = root;

  keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeZoomOverlay();
  };
  document.addEventListener("keydown", keyHandler);

  // Images only have real dimensions once mounted; re-fit if metadata is late.
  if (imgEl) {
    fitImageToBox();
    applyZoom();
    imgEl.addEventListener("load", () => {
      fitImageToBox();
      applyZoom();
    });
  }
}
