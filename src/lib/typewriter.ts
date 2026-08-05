/**
 * Typewriter-mode math — pure functions so the centering logic is
 * unit-testable without ProseMirror.
 */

export interface CaretCenterInput {
  /** Current scrollTop of the editor's scroll container. */
  scrollTop: number;
  /** Top of the scroll container's viewport in client coordinates. */
  viewportTop: number;
  /** Visible height of the scroll container. */
  viewportHeight: number;
  /** Top/bottom of the caret line in client coordinates (coordsAtPos). */
  caretTop: number;
  caretBottom: number;
}

/**
 * Compute the scrollTop that places the caret line at the vertical center of
 * the viewport (Typora-style typewriter behavior). Clamped to >= 0 so the
 * container never scrolls past its top edge.
 */
export function caretCenterScrollTop(v: CaretCenterInput): number {
  const caretCenter = (v.caretTop + v.caretBottom) / 2;
  const viewportCenter = v.viewportTop + v.viewportHeight / 2;
  return Math.max(0, v.scrollTop + (caretCenter - viewportCenter));
}
