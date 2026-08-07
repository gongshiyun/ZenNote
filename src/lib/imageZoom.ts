/**
 * Image zoom viewer math — pure functions so sizing logic is unit-testable.
 */

/**
 * Compute the "contain" fit scale for an image inside a box: the largest
 * uniform scale at which the image fits fully inside the box without
 * cropping. Capped at 1 so small images render at their true (natural) size
 * instead of being upscaled. Returns 0 when any dimension is missing.
 */
export function fitContainScale(boxW: number, boxH: number, natW: number, natH: number): number {
  if (!boxW || !boxH || !natW || !natH) return 0;
  return Math.min(boxW / natW, boxH / natH, 1);
}
