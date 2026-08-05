import { describe, it, expect } from 'vitest';
import { caretCenterScrollTop } from '../lib/typewriter';

describe('caretCenterScrollTop (typewriter centering math)', () => {
  const base = {
    scrollTop: 500,
    viewportTop: 100,
    viewportHeight: 600, // viewport center = 400 in client coords
  };

  it('scrolls down when the caret line is below the viewport center', () => {
    // caret center = 560, viewport center = 400 -> scroll +160
    const top = caretCenterScrollTop({ ...base, caretTop: 550, caretBottom: 570 });
    expect(top).toBe(660);
  });

  it('scrolls up when the caret line is above the viewport center', () => {
    // caret center = 200, viewport center = 400 -> scroll -200
    const top = caretCenterScrollTop({ ...base, caretTop: 190, caretBottom: 210 });
    expect(top).toBe(300);
  });

  it('keeps scrollTop unchanged when the caret is already centered', () => {
    const top = caretCenterScrollTop({ ...base, caretTop: 390, caretBottom: 410 });
    expect(top).toBe(500);
  });

  it('clamps to 0 near the top of the document', () => {
    const top = caretCenterScrollTop({
      scrollTop: 10, viewportTop: 100, viewportHeight: 600,
      caretTop: 110, caretBottom: 130, // caret center 120 -> target = 10 + (120-400) < 0
    });
    expect(top).toBe(0);
  });

  it('uses the caret line center, not its top edge', () => {
    // A tall line (e.g. wrapped paragraph line rendering): center matters.
    const a = caretCenterScrollTop({ ...base, caretTop: 500, caretBottom: 540 });
    const b = caretCenterScrollTop({ ...base, caretTop: 520, caretBottom: 560 });
    expect(b - a).toBe(20); // shifted by exactly the line-center delta
  });
});
