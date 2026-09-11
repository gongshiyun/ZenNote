import { describe, expect, it } from "vitest";
import { runMermaidRenderTask } from "../lib/mermaidRender";

describe("runMermaidRenderTask", () => {
  it("returns the rendered SVG while its editor lifecycle is current", async () => {
    const result = await runMermaidRenderTask(
      async () => "<svg>diagram</svg>",
      () => true,
    );

    expect(result).toEqual({ status: "rendered", svg: "<svg>diagram</svg>" });
  });

  it("discards a render that finishes after its editor lifecycle is replaced", async () => {
    let current = true;
    const result = await runMermaidRenderTask(
      async () => {
        current = false;
        return "<svg>stale</svg>";
      },
      () => current,
    );

    expect(result).toEqual({ status: "stale" });
  });

  it("reports failures only while the requesting editor lifecycle is current", async () => {
    const currentResult = await runMermaidRenderTask(
      async () => {
        throw new Error("bad diagram");
      },
      () => true,
    );
    expect(currentResult.status).toBe("failed");

    let current = true;
    const staleResult = await runMermaidRenderTask(
      async () => {
        current = false;
        throw new Error("bad diagram");
      },
      () => current,
    );
    expect(staleResult).toEqual({ status: "stale" });
  });

  it("skips work when the requesting lifecycle is already stale", async () => {
    let called = false;
    const result = await runMermaidRenderTask(
      async () => {
        called = true;
        return "<svg>unused</svg>";
      },
      () => false,
    );

    expect(result).toEqual({ status: "stale" });
    expect(called).toBe(false);
  });
});
