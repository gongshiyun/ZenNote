import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the executor — the low-level PM wiring is covered in
// tableCommands.test.ts. Here we verify the MENU drives it correctly.
const { executeSpy, selectSpy } = vi.hoisted(() => ({
  executeSpy: vi.fn().mockResolvedValue(true),
  selectSpy: vi.fn().mockResolvedValue(true),
}));
vi.mock('../components/editor/tableCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/editor/tableCommands')>();
  return {
    ...actual,
    executeTableCommand: (...args: unknown[]) => executeSpy(...args),
    selectTableArea: (...args: unknown[]) => selectSpy(...args),
  };
});

import { TableContextMenu } from '../components/editor/TableContextMenu';

const fakeCrepe = { editor: { action: vi.fn() } };

const baseProps = () => ({
  visible: true,
  position: { x: 100, y: 100 },
  onClose: vi.fn(),
  crepeRef: { current: fakeCrepe } as { current: any },
  savedSelection: null,
});

// label (zh-CN real i18n) -> command name expected by the executor
const CMD_ITEMS: Array<[string, string]> = [
  ['在上方插入行', 'addRowBefore'],
  ['在下方插入行', 'addRowAfter'],
  ['删除行', 'deleteRow'],
  ['在左侧插入列', 'addColumnBefore'],
  ['在右侧插入列', 'addColumnAfter'],
  ['删除列', 'deleteColumn'],
  ['删除表格', 'deleteTable'],
];

// label -> selection area
const SELECT_ITEMS: Array<[string, 'row' | 'col' | 'table']> = [
  ['选择行', 'row'],
  ['选择列', 'col'],
  ['选择整个表格', 'table'],
];

describe('TableContextMenu', () => {
  beforeEach(() => {
    executeSpy.mockClear();
    executeSpy.mockResolvedValue(true);
    selectSpy.mockClear();
    selectSpy.mockResolvedValue(true);
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<TableContextMenu {...baseProps()} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all 10 actions (7 commands + 3 selection entries)', () => {
    render(<TableContextMenu {...baseProps()} />);
    for (const [label] of CMD_ITEMS) expect(screen.getByText(label)).toBeInTheDocument();
    for (const [label] of SELECT_ITEMS) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('does NOT render the removed merge/split/header-toggle actions', () => {
    render(<TableContextMenu {...baseProps()} />);
    for (const label of ['合并单元格', '拆分单元格', '切换表头行', '切换表头列']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('clicking EVERY command item executes the matching command on the crepe instance and closes the menu', async () => {
    for (const [label, cmdName] of CMD_ITEMS) {
      const props = baseProps();
      const { unmount } = render(<TableContextMenu {...props} />);
      fireEvent.click(screen.getByText(label));
      await waitFor(() => {
        expect(executeSpy).toHaveBeenCalledWith(fakeCrepe, cmdName, null);
        expect(props.onClose).toHaveBeenCalledTimes(1);
      });
      unmount();
    }
    expect(executeSpy).toHaveBeenCalledTimes(CMD_ITEMS.length);
  });

  it('forwards the saved multi-cell selection to the executor (commands keep their target)', async () => {
    const saved = { anchor: 3, head: 9 };
    const props = { ...baseProps(), savedSelection: saved };
    const first = render(<TableContextMenu {...props} />);

    fireEvent.click(screen.getByText('删除行'));
    await waitFor(() => expect(executeSpy).toHaveBeenCalledWith(fakeCrepe, 'deleteRow', saved));
    first.unmount();

    // Re-render fresh for the second click (each click closes the menu).
    executeSpy.mockClear();
    const props2 = { ...baseProps(), savedSelection: saved };
    const { unmount } = render(<TableContextMenu {...props2} />);
    fireEvent.click(screen.getByText('在下方插入行'));
    await waitFor(() => expect(executeSpy).toHaveBeenCalledWith(fakeCrepe, 'addRowAfter', saved));
    unmount();
  });

  it('forwards the saved selection to selectTableArea for row/col/table selection', async () => {
    const saved = { anchor: 2, head: 6 };
    const props = { ...baseProps(), savedSelection: saved };
    render(<TableContextMenu {...props} />);
    fireEvent.click(screen.getByText('选择行'));
    await waitFor(() => expect(selectSpy).toHaveBeenCalledWith(fakeCrepe, 'row', saved));
  });

  it('clicking a selection item creates the multi-cell selection via selectTableArea', async () => {
    for (const [label, area] of SELECT_ITEMS) {
      const props = baseProps();
      const { unmount } = render(<TableContextMenu {...props} />);
      fireEvent.click(screen.getByText(label));
      await waitFor(() => {
        expect(selectSpy).toHaveBeenCalledWith(fakeCrepe, area, null);
        expect(props.onClose).toHaveBeenCalledTimes(1);
      });
      unmount();
    }
    expect(selectSpy).toHaveBeenCalledTimes(SELECT_ITEMS.length);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('still closes the menu when the executor fails', async () => {
    executeSpy.mockRejectedValueOnce(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props = baseProps();
    render(<TableContextMenu {...props} />);
    fireEvent.click(screen.getByText('删除行'));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    errorSpy.mockRestore();
  });

  it('closes on Escape', () => {
    const props = baseProps();
    render(<TableContextMenu {...props} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clamps the position into the viewport', () => {
    const { container } = render(<TableContextMenu {...baseProps()} position={{ x: 99999, y: 99999 }} />);
    const menu = container.firstChild as HTMLElement;
    expect(menu.style.left).not.toBe('99999px');
    expect(menu.style.top).not.toBe('99999px');
  });
});
