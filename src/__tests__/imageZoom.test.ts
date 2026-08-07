import { describe, it, expect } from 'vitest';
import { fitContainScale } from '../lib/imageZoom';

describe('fitContainScale (image zoom contain-fit)', () => {
  it('fits a landscape image by width when the box is wide', () => {
    // 1000x500 image in a 800x600 box -> width limits: 800/1000 = 0.8
    expect(fitContainScale(800, 600, 1000, 500)).toBeCloseTo(0.8);
  });

  it('fits a portrait image by height when the box is tall-relative', () => {
    // 500x1000 image in an 800x600 box -> height limits: 600/1000 = 0.6
    expect(fitContainScale(800, 600, 500, 1000)).toBeCloseTo(0.6);
  });

  it('caps at 1 so small images are never upscaled (true-size display)', () => {
    // 100x80 image in a huge box -> natural scale would be >1, capped to 1
    expect(fitContainScale(2000, 1500, 100, 80)).toBe(1);
  });

  it('preserves aspect ratio: resulting w/h equals natural w/h', () => {
    const natW = 1600, natH = 900;
    const s = fitContainScale(1400, 850, natW, natH);
    const w = natW * s, h = natH * s;
    expect(w / h).toBeCloseTo(natW / natH);
    // fits inside the box without overflow
    expect(w).toBeLessThanOrEqual(1400 + 1e-9);
    expect(h).toBeLessThanOrEqual(850 + 1e-9);
  });

  it('returns 0 for any missing/zero dimension', () => {
    expect(fitContainScale(0, 600, 100, 80)).toBe(0);
    expect(fitContainScale(800, 0, 100, 80)).toBe(0);
    expect(fitContainScale(800, 600, 0, 80)).toBe(0);
    expect(fitContainScale(800, 600, 100, 0)).toBe(0);
  });
});
