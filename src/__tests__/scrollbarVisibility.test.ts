import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The scrollbar must stay visible.
//
// It once shipped as `::-webkit-scrollbar-thumb { background: transparent }` with
// the colour applied only under `*:hover`, so a long note showed no scroll
// position at all until the pointer was already over the bar — you could not see
// how far through you were, and the bar had to be hunted for before it could be
// dragged.
//
// Reading the stylesheet from disk is unusual for these tests, which normally
// assert against an exported object. The scrollbar rules are global rather than
// part of `livePreviewThemeSpec`, and their failure mode is invisible, so a
// source check is the cheapest thing that actually catches a regression.

// Vitest runs from the repository root.
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

/** The declaration block of a rule, by selector. */
function blockOf(selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('scrollbar visibility', () => {
  it('sizes the scrollbar', () => {
    const rule = blockOf('::-webkit-scrollbar {');
    const width = /width:\s*(\d+)px/.exec(rule);
    expect(width, 'no scrollbar width').not.toBeNull();
    // A hairline is hard to hit with a mouse.
    expect(Number(width![1])).toBeGreaterThanOrEqual(8);
  });

  it('does not make the thumb transparent at rest', () => {
    // The whole point: the thumb must be drawn without hovering first.
    const thumb = blockOf('::-webkit-scrollbar-thumb {');
    expect(thumb).not.toMatch(/background:\s*transparent/);
    expect(thumb).toMatch(/background:/);
    // Derived from theme tokens, so every theme adapts rather than one colour
    // being hardcoded for all of them.
    expect(thumb).toMatch(/var\(--scrollbar-thumb/);
    expect(thumb).toMatch(/var\(--text-secondary/);
  });

  it('keeps the hover rule as an emphasis, not as the only colour', () => {
    // If this rule were the sole source of colour the thumb would be invisible
    // again until hovered.
    const hover = blockOf('*:hover::-webkit-scrollbar-thumb {');
    expect(hover).toMatch(/var\(--scrollbar-thumb/);
  });
});
