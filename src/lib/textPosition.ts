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

export function lineColAtProseMirrorDoc(
  doc: { textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string },
  pos: number,
): { line: number; col: number } {
  const prefix = doc.textBetween(0, pos, "\n", "\n");
  return lineColAtText(prefix, prefix.length);
}

export function posAtLineColProseMirrorDoc(
  doc: {
    content: { size: number };
    forEach: (cb: (node: { nodeSize: number }, offset: number) => void) => void;
  },
  line: number,
  col: number,
): number {
  const target = Math.max(1, line);
  let index = 1;
  let result = Math.min(doc.content.size, Math.max(1, col));
  doc.forEach((node, offset) => {
    if (index !== target) {
      index++;
      return;
    }
    const start = offset + 1;
    const end = Math.max(start, offset + node.nodeSize - 1);
    result = Math.min(end, start + Math.max(0, col - 1));
    index++;
  });
  return result;
}
