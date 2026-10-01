export function lineColAtText(text: string, index: number): { line: number; col: number } {
  const clamped = Math.max(0, Math.min(index, text.length));
  const prefix = text.slice(0, clamped);
  const lastBreak = prefix.lastIndexOf("\n");
  return {
    line: prefix.split("\n").length,
    col: clamped - lastBreak,
  };
}

export function offsetAtLineCol(text: string, line: number, col: number): number {
  const targetLine = Math.max(1, line);
  const lines = text.split("\n");
  if (targetLine > lines.length) return text.length;
  let offset = 0;
  for (let i = 1; i < targetLine; i++) offset += lines[i - 1].length + 1;
  return Math.min(text.length, offset + Math.max(0, col - 1));
}
