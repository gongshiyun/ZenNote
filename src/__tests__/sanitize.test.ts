import { describe, expect, it } from "vitest";
import { sanitizeHtmlFragment, sanitizeSvg } from "../lib/sanitize";

describe("untrusted note sanitization", () => {
  it("removes scripts, event handlers, dangerous URLs, and form controls", () => {
    const clean = sanitizeHtmlFragment(`
      <script>alert(1)</script>
      <img src="x" onerror="alert(1)">
      <a href="javascript:alert(1)">bad</a>
      <form><input value="secret"></form>
    `);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("<form");
    expect(clean).not.toContain("<input");
  });

  it("keeps ordinary formatting markup", () => {
    expect(sanitizeHtmlFragment("<p>Hello <strong>world</strong></p>"))
      .toContain("<strong>world</strong>");
  });

  it("sanitizes Mermaid SVG before it is injected into the editor", () => {
    const clean = sanitizeSvg('<svg onload="alert(1)"><script>alert(1)</script><text>ok</text></svg>');
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("<script");
    expect(clean).toContain("<text>ok</text>");
  });
});
