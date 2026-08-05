/**
 * Shared state for the document find plugin (WYSIWYG mode).
 *
 * Editor.tsx installs a ProseMirror plugin under `znFindKey` that keeps the
 * current query/options/matches and renders the highlights as decorations
 * (never raw DOM mutation — ProseMirror stays the single source of truth).
 * FindReplaceBar.tsx reads the state via the same key and drives it with
 * transaction metas.
 */
import { PluginKey } from "@milkdown/kit/prose/state";
import type { DecorationSet } from "@milkdown/kit/prose/view";
import type { FindOptions, FindMatch } from "../../lib/findQuery";

export interface ZnFindState {
  query: string;
  opts: FindOptions;
  /** Match ranges in document coordinates, sorted by position. */
  matches: FindMatch[];
  /** Index of the "current" match (-1 when there is none). */
  current: number;
  deco: DecorationSet | null;
}

/** Meta payloads the bar can attach to transactions. */
export type ZnFindMeta =
  | { type: "query"; query: string; opts: FindOptions }
  | { type: "goto"; index: number }
  | { type: "clear" };

export const znFindKey = new PluginKey<ZnFindState>("znFind");

export const emptyFindState = (): ZnFindState => ({
  query: "",
  opts: { caseSensitive: false, wholeWord: false, regex: false },
  matches: [],
  current: -1,
  deco: null,
});
