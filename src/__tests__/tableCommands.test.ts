import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy-commands injected in place of prosemirror-tables + the editorViewCtx
// lookup, so the tests verify the WIRING (the actual bug) without a real
// ProseMirror instance.
const spies = vi.hoisted(() => {
  const mk = () => vi.fn(() => true);
  return {
    addRowBefore: mk(), addRowAfter: mk(), deleteRow: mk(),
    addColumnBefore: mk(), addColumnAfter: mk(), deleteColumn: mk(),
    deleteTable: mk(),
    // selection helpers used by selectTableArea
    findTable: vi.fn(),
    cellAround: vi.fn(),
    TableMap: { get: vi.fn() },
  };
});

vi.mock('@milkdown/kit/prose/tables', () => spies);
vi.mock('@milkdown/kit/core', () => ({ editorViewCtx: 'editorViewCtx-key' }));

// preset-gfm's selection transaction helpers (selectRow/selectCol/selectTable)
const selSpies = vi.hoisted(() => ({
  selectRow: vi.fn(),
  selectCol: vi.fn(),
  selectTable: vi.fn(),
}));
vi.mock('@milkdown/kit/preset/gfm', () => selSpies);

import { executeTableCommand, selectTableArea, TABLE_COMMAND_KEYS, type TableCommandName } from '../components/editor/tableCommands';

function makeCrepe(view: any) {
  const ctx = { get: (key: unknown) => (key === 'editorViewCtx-key' ? view : null) };
  // Mimics @milkdown/core: action(fn) === fn(ctx)
  return { editor: { action: (fn: (c: unknown) => unknown) => fn(ctx) } };
}

describe('executeTableCommand (PM command wiring)', () => {
  let view: { state: object; dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    Object.values(spies).filter(s => typeof s === 'function').forEach(s => s.mockClear());
    view = { state: { selection: {} }, dispatch: vi.fn() };
  });

  it('runs every known command with (state, dispatch, view) — NOT the milkdown ctx', async () => {
    const crepe = makeCrepe(view);
    for (const name of TABLE_COMMAND_KEYS) {
      const ok = await executeTableCommand(crepe, name);
      expect(ok).toBe(true);
    }
    // Each of the 7 commands was invoked exactly once with the correct args.
    for (const name of TABLE_COMMAND_KEYS) {
      expect(spies[name]).toHaveBeenCalledTimes(1);
      expect(spies[name]).toHaveBeenCalledWith(view.state, view.dispatch, view);
      // Regression guard: the milkdown ctx must never be passed as the state.
      expect(spies[name]).not.toHaveBeenCalledWith(expect.objectContaining({ get: expect.any(Function) }), undefined, undefined);
      spies[name].mockClear();
    }
  });

  it('propagates the command result (false when the command refuses)', async () => {
    spies.deleteRow.mockReturnValueOnce(false); // e.g. selection outside a table
    const ok = await executeTableCommand(makeCrepe(view), 'deleteRow');
    expect(ok).toBe(false);
  });

  it('returns false for an unknown command name without throwing', async () => {
    const ok = await executeTableCommand(makeCrepe(view), 'nope' as TableCommandName);
    expect(ok).toBe(false);
    TABLE_COMMAND_KEYS.forEach(name => expect(spies[name]).not.toHaveBeenCalled());
  });

  it('returns false when crepe/editor is unavailable (editor still loading)', async () => {
    expect(await executeTableCommand(null, 'deleteRow')).toBe(false);
    expect(await executeTableCommand({}, 'deleteRow')).toBe(false);
    expect(await executeTableCommand({ editor: {} }, 'deleteRow')).toBe(false);
    expect(spies.deleteRow).not.toHaveBeenCalled();
  });

  it('returns false when the editor view cannot be resolved', async () => {
    const crepe = { editor: { action: (fn: (c: unknown) => unknown) => fn({ get: () => null }) } };
    const ok = await executeTableCommand(crepe, 'addRowAfter');
    expect(ok).toBe(false);
    expect(spies.addRowAfter).not.toHaveBeenCalled();
  });

  it('covers exactly the menu command set (no drift between menu and executor)', () => {
    expect(TABLE_COMMAND_KEYS).toEqual([
      'addRowBefore', 'addRowAfter', 'deleteRow',
      'addColumnBefore', 'addColumnAfter', 'deleteColumn',
      'deleteTable',
    ]);
  });
});

describe('selectTableArea (multi-cell selection wiring)', () => {
  let view: { state: { tr: { selection: object } }; dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    Object.values(selSpies).forEach(s => s.mockReset());
    view = {
      state: { tr: { selection: { from: 3 }, doc: { resolve: () => ({}) } } },
      dispatch: vi.fn(),
    };
    // In-table setup: selection resolves into a 2x3 table, cell at row 1 / col 2.
    spies.findTable.mockReturnValue({ node: { fake: true }, start: 0 });
    spies.cellAround.mockReturnValue({ pos: 5 });
    spies.TableMap.get.mockReturnValue({ findCell: () => ({ top: 1, left: 2 }) });
  });

  it('selects the current row via selectRow with the computed row index', async () => {
    const newTr = { selection: { isCell: true } };
    selSpies.selectRow.mockImplementation((_index: number, _pos: number) => (tr: unknown) => (tr === view.state.tr ? newTr : tr));
    const ok = await selectTableArea(makeCrepe(view), 'row');
    expect(ok).toBe(true);
    expect(spies.findTable).toHaveBeenCalled();
    expect(selSpies.selectRow).toHaveBeenCalledWith(1, 3);
    expect(view.dispatch).toHaveBeenCalledWith(newTr);
  });

  it('selects the current column via selectCol with the computed column index', async () => {
    const newTr = { selection: { isCell: true } };
    selSpies.selectCol.mockImplementation((_index: number, _pos: number) => (tr: unknown) => (tr === view.state.tr ? newTr : tr));
    const ok = await selectTableArea(makeCrepe(view), 'col');
    expect(ok).toBe(true);
    expect(selSpies.selectCol).toHaveBeenCalledWith(2, 3);
    expect(view.dispatch).toHaveBeenCalledWith(newTr);
  });

  it('selects the whole table via selectTable(tr)', async () => {
    const newTr = { selection: { isCell: true } };
    selSpies.selectTable.mockImplementation((tr: unknown) => (tr === view.state.tr ? newTr : tr));
    const ok = await selectTableArea(makeCrepe(view), 'table');
    expect(ok).toBe(true);
    expect(selSpies.selectTable).toHaveBeenCalledWith(view.state.tr);
    expect(view.dispatch).toHaveBeenCalledWith(newTr);
  });

  it('does NOT dispatch when the selection is outside a table', async () => {
    spies.findTable.mockReturnValue(undefined);
    const ok = await selectTableArea(makeCrepe(view), 'row');
    expect(ok).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('does NOT dispatch when the helper returns the same transaction', async () => {
    selSpies.selectRow.mockImplementation(() => (tr: unknown) => tr); // unchanged tr
    const ok = await selectTableArea(makeCrepe(view), 'row');
    expect(ok).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('returns false when crepe/view is unavailable', async () => {
    expect(await selectTableArea(null, 'row')).toBe(false);
    expect(await selectTableArea({ editor: {} }, 'table')).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
