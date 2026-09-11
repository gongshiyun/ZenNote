export type MermaidRenderOutcome =
  | { status: "rendered"; svg: string }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

/**
 * Run an async Mermaid render without applying its result after the editor
 * lifecycle that requested it has been replaced.
 */
export async function runMermaidRenderTask(
  render: () => Promise<string | null>,
  isCurrent: () => boolean,
): Promise<MermaidRenderOutcome> {
  if (!isCurrent()) return { status: "stale" };

  try {
    const svg = await render();
    if (svg === null || !isCurrent()) return { status: "stale" };
    return { status: "rendered", svg };
  } catch (error) {
    return isCurrent() ? { status: "failed", error } : { status: "stale" };
  }
}
