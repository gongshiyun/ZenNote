export function fuzzyScore(text: string, query: string): number | null {
  const source = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  let score = 0;
  let previous = -1;
  for (const char of needle) {
    const index = source.indexOf(char, previous + 1);
    if (index < 0) return null;
    const gap = previous < 0 ? index : index - previous - 1;
    score += gap === 0 ? 6 : Math.max(1, 4 - gap);
    if (index === 0 || /[\\/_\-. ]/.test(source[index - 1] || "")) score += 2;
    previous = index;
  }
  return score - source.length * 0.01;
}
