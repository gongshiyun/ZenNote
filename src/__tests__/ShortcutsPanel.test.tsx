import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsPanel } from '../components/dialogs/ShortcutsPanel';

// Uses the REAL i18n module (zh-CN by default) — also guards against missing
// translation keys, since every label is read from t().shortcuts.

describe('ShortcutsPanel (PRD 3.13)', () => {
  it('renders the title and grouped shortcut entries', () => {
    render(<ShortcutsPanel onClose={() => {}} />);
    expect(screen.getByText('快捷键')).toBeInTheDocument();
    // Groups
    expect(screen.getByText('文件')).toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
    expect(screen.getByText('视图')).toBeInTheDocument();
    expect(screen.getByText('格式与导出')).toBeInTheDocument();
    // Representative entries incl. features added in this iteration
    expect(screen.getByText('查找替换')).toBeInTheDocument();
    expect(screen.getByText('全局搜索')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Shift+F')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+`')).toBeInTheDocument();
    expect(screen.getByText('F1')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Shift+E')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ShortcutsPanel onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on panel click', () => {
    const onClose = vi.fn();
    const { container } = render(<ShortcutsPanel onClose={onClose} />);
    // Click the panel body -> should NOT close.
    fireEvent.click(screen.getByText('快捷键'));
    expect(onClose).not.toHaveBeenCalled();
    // Click the backdrop (outermost overlay div) -> closes.
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
