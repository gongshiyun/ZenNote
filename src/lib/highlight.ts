export interface HighlightSegment {
  text: string;
  match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitHighlight(text: string, query: string): HighlightSegment[] {
  if (!query) return [{ text, match: false }];
  const re = new RegExp(escapeRegExp(query), "gi");
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), match: false });
    }
    segments.push({ text: match[0], match: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false });
  }
  return segments.length ? segments : [{ text, match: false }];
}
