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

  it("preserves Mermaid node labels rendered through foreignObject", () => {
    const clean = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <foreignObject width="100" height="40">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <span class="nodeLabel">Visible label</span>
          </div>
        </foreignObject>
      </svg>
    `);
    expect(clean).toContain("foreignObject");
    expect(clean).toContain("Visible label");
  });

  it("preserves Mermaid inline presentation styles", () => {
    const clean = sanitizeSvg(
      '<svg><text style="fill:#333;font-family:serif">Styled text</text></svg>',
    );
    expect(clean).toContain("Styled text");
    expect(clean).toContain("style=");
  });

  it("preserves Mermaid embedded theme styles and internal gradient URLs", () => {
    const clean = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <style>
          #diagram .commit-label { fill: #ddd; }
          #diagram .node { stroke: url(#diagram-gradient); }
        </style>
        <text class="commit-label">Visible label</text>
      </svg>
    `);

    expect(clean).toContain("<style>");
    expect(clean).toContain(".commit-label");
    expect(clean).toContain("url(#diagram-gradient)");
  });

  it("removes remote and executable CSS while sanitizing SVG", () => {
    const clean = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <style>
          @import url(https://evil.example/theme.css);
          .remote { fill: url(https://evil.example/pixel); }
          .legacy { behavior: url(#default#time2); }
          .script { background: url(javascript:alert(1)); }
        </style>
      </svg>
    `);

    expect(clean).not.toContain("@import");
    expect(clean).not.toContain("https://evil.example");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("behavior:");
  });

  it("still removes scripts and event handlers inside foreignObject labels", () => {
    const clean = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <foreignObject>
          <div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">
            Safe label<script>alert(2)</script>
          </div>
        </foreignObject>
      </svg>
    `);
    expect(clean).toContain("Safe label");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("<script");
  });
});
