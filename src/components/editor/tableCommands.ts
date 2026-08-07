/**
 * Table command execution for the table context menu.
 *
 * IMPORTANT: Milkdown's `editor.action(fn)` calls `fn(ctx)` with the Milkdown
 * Ctx. ProseMirror table commands (prosemirror-tables) however expect
 * `(state, dispatch?, view?)`. Passing a PM command directly to
 * `editor.action` — i.e. `editor.action(addRowBefore)` — would invoke
 * `addRowBefore(ctx)`, which throws on `ctx.selection` and silently does
 * nothing. The command must therefore be run against the live EditorView
 * obtained from `editorViewCtx`.
 */

export const TABLE_COMMAND_KEYS = [
  "addRowBefore",
  "addRowAfter",
  "deleteRow",
  "addColumnBefore",
  "addColumnAfter",
  "deleteColumn",
  "deleteTable",
] as const;

export type TableCommandName = (typeof TABLE_COMMAND_KEYS)[number];

export type TableSelectArea = "row" | "col" | "table";

/**
 * A CellSelection captured at the moment the table context menu opened, stored
 * as the two cell NODE start positions the CellSelection constructor expects.
 *
 * Why it exists: Crepe's tableBlock node view turns any mousedown inside a
 * cell into a single-node selection (see tableDragSelect.ts). Even with the
 * capture-phase guard there, we re-apply the captured selection right before a
 * command runs — a belt-and-braces guarantee that row/column/table actions
 * operate on the cells the user actually chose, never on a silently-wiped one.
 */
export interface SavedCellSelection {
  anchor: number;
  head: number;
}

/**
 * Resolve the live ProseMirror EditorView behind a Crepe instance.
 * Returns null when the editor/view is not available yet.
 */
export async function getTableEditorView(crepe: any): Promise<any | null> {
  if (!crepe?.editor?.action) return null;
  const { editorViewCtx } = await import("@milkdown/kit/core");
  return crepe.editor.action((ctx: any) => ctx.get(editorViewCtx) ?? null);
}

/**
 * Re-apply a previously captured CellSelection onto the live view unless it is
 * already active. Returns true when the view ends up carrying that selection.
 * `tableMod` is the dynamically-imported "prose/tables" module (CellSelection).
 */
function restoreCellSelection(view: any, saved: SavedCellSelection, tableMod: any): boolean {
  try {
    const doc = view.state.doc;
    const max = doc.content.size;
    if (saved.anchor < 0 || saved.anchor > max || saved.head < 0 || saved.head > max) return false;
    const sel = new tableMod.CellSelection(doc.resolve(saved.anchor), doc.resolve(saved.head));
    if (view.state.selection.eq(sel)) return true; // already the intended selection
    // Restoring a lost highlight is bookkeeping, not an editable step — keep
    // it out of the undo history so "undo" still reverses only real edits.
    view.dispatch(view.state.tr.setSelection(sel).setMeta("addToHistory", false));
    return true;
  } catch {
    return false; // stale/invalid positions — leave the current selection alone
  }
}

/**
 * Run a prosemirror-tables command on the editor behind `crepe`.
 * Returns true when the command was found and actually applied.
 *
 * `saved` (optional) is the CellSelection captured when the context menu
 * opened; when provided it is re-applied first so the command sees the
 * multi-cell selection even if something collapsed it meanwhile.
 */
export async function executeTableCommand(
  crepe: any,
  cmdName: TableCommandName,
  saved?: SavedCellSelection | null
): Promise<boolean> {
  const view = await getTableEditorView(crepe);
  if (!view) return false;
  const tableMod = await import("@milkdown/kit/prose/tables");
  // Guarded lookup: unknown names must degrade to a no-op, never throw.
  let cmd: unknown;
  try {
    cmd = (tableMod as Record<string, unknown>)[cmdName];
  } catch {
    return false;
  }
  if (typeof cmd !== "function") return false;
  if (saved) restoreCellSelection(view, saved, tableMod);
  // Always read the CURRENT state/dispatch: the command must act on the
  // selection that is live right now (restored above), not a stale snapshot.
  return (cmd as (state: any, dispatch?: any, view?: any) => boolean)(view.state, view.dispatch, view);
}

/**
 * Select the row / column / whole table containing the current selection.
 *
 * Uses preset-gfm's `selectRow`/`selectCol`/`selectTable` transaction helpers,
 * which produce a prosemirror-tables CellSelection spanning the chosen area.
 * Returns true when a selection was actually dispatched.
 */
export async function selectTableArea(
  crepe: any,
  area: TableSelectArea,
  saved?: SavedCellSelection | null
): Promise<boolean> {
  const view = await getTableEditorView(crepe);
  if (!view) return false;
  const [gfmMod, tableMod] = await Promise.all([
    import("@milkdown/kit/preset/gfm"),
    import("@milkdown/kit/prose/tables"),
  ]);
  // If the menu opened over an existing multi-cell selection, re-apply it so
  // `selection.from` points inside a real cell — otherwise a collapsed
  // single-node selection would make findTable/cellAround fail below.
  if (saved) restoreCellSelection(view, saved, tableMod);
  const tr = view.state.tr;
  // The selection must be inside a table for row/column selection to work.
  const $pos = tr.doc.resolve(tr.selection.from);
  const table = tableMod.findTable($pos);
  if (!table) return false;

  let nextTr: any;
  if (area === "table") {
    if (typeof gfmMod.selectTable !== "function") return false;
    nextTr = gfmMod.selectTable(tr);
  } else {
    const selectLine = area === "row" ? gfmMod.selectRow : gfmMod.selectCol;
    if (typeof selectLine !== "function") return false;
    // selectLine(index, pos) needs the ROW/COL index of the current cell.
    // Compute it from the table map (cellAround gives the cell start offset).
    let index = 0;
    try {
      const $cell = tableMod.cellAround($pos);
      if (!$cell) return false;
      const map = tableMod.TableMap.get(table.node);
      const rect = map.findCell($cell.pos - table.start);
      index = area === "row" ? rect.top : rect.left;
    } catch {
      return false;
    }
    nextTr = selectLine(index, tr.selection.from)(tr);
  }
  if (!nextTr || nextTr === tr) return false; // not inside a table
  view.dispatch(nextTr);
  return true;
}
