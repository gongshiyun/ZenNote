/**
 * Markdown parser extensions for the Live Preview editor.
 *
 * `@codemirror/lang-markdown` ships GFM (tables, task lists, autolinks,
 * strikethrough) but NOT `==highlight==`. The app's Crepe editor renders
 * highlight, so Live Preview needs parity. This is a direct port of the
 * Strikethrough rule from `@lezer/markdown` with `~` swapped for `=`, which is
 * why the delimiter flags look unfamiliar — they implement the same
 * "can open / can close" rules as every other emphasis-style delimiter.
 */
import { type MarkdownExtension, type InlineContext } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

/** Same punctuation class the other delimiters use. */
const Punctuation = /[!-/:-@[-`{-~]/;

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

export const Highlight: MarkdownExtension = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": tags.special(tags.content) } },
    { name: "HighlightMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 61 /* '=' */ || cx.char(pos + 1) !== 61) return -1;
        // Reject `===` and any longer run: without the second check a run of
        // three still matches at offset 1, silently turning `===x===` into a
        // highlight of `=x=`.
        if (cx.char(pos + 2) === 61) return -1;
        if (cx.char(pos - 1) === 61) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = Punctuation.test(before);
        const pAfter = Punctuation.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      // Must run after Emphasis so `**a == b**` nests the way an author expects.
      after: "Emphasis",
    },
  ],
};
