import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TableContextMenu } from '../components/editor/TableContextMenu';

// Uses the REAL i18n module (zh-CN) — labels read from t().table.

const baseProps = () => ({
  visible: true,
  position: { x: 100, y: 100 },
  onClose: vi.fn(),
  crepeRef: { current: null } as { current: any },
});

describe('TableContextMenu', () => {
  it('renders row/column editing entries', () => {
    render(<TableContextMenu {...baseProps()} />);
    expect(screen.getByText('在上方插入行')).toBeInTheDocument();
    expect(screen.getByText('在下方插入行')).toBeInTheDocument();
    expect(screen.getByText('在左侧插入列')).toBeInTheDocument();
    expect(screen.getByText('在右侧插入列')).toBeInTheDocument();
    expect(screen.getByText('合并单元格')).toBeInTheDocument();
    expect(screen.getByText('拆分单元格')).toBeInTheDocument();
  });

  it('renders the v0.8.2 additions: header toggles and delete table', () => {
    render(<TableContextMenu {...baseProps()} />);
    expect(screen.getByText('切换表头行')).toBeInTheDocument();
    expect(screen.getByText('切换表头列')).toBeInTheDocument();
    expect(screen.getByText('删除表格')).toBeInTheDocument();
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<TableContextMenu {...baseProps()} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('closes after clicking an entry (even without a live editor)', async () => {
    const props = baseProps();
    render(<TableContextMenu {...props} />);
    fireEvent.click(screen.getByText('删除表格'));
    // runTableCmd loads prosemirror-tables asynchronously, then calls onClose.
    await waitFor(() => expect(props.onClose).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('closes on Escape', () => {
    const props = baseProps();
    render(<TableContextMenu {...props} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('keeps the menu inside the viewport (position clamping)', () => {
    const { container } = render(<TableContextMenu {...baseProps()} position={{ x: 99999, y: 99999 }} />);
    const menu = container.firstChild as HTMLElement;
    expect(menu.style.left).not.toBe('99999px');
    expect(menu.style.top).not.toBe('99999px');
  });
});
