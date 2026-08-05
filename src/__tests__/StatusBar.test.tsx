import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useStore } from '../store';
import { StatusBar } from '../components/layout/StatusBar';

describe('StatusBar', () => {
  beforeEach(() => {
    useStore.setState({
      currentFilePath: null,
      content: '',
      isDirty: false,
      lastSavedAt: null,
      cursorLine: 1,
      cursorCol: 1,
      sourceMode: false,
    });
  });

  it('shows cursor position', () => {
    useStore.setState({ cursorLine: 12, cursorCol: 7 });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('Ln 12, Col 7');
  });

  it('shows word/char/line counts', () => {
    useStore.setState({ content: '你好 world\nsecond line' });
    const { container } = render(<StatusBar />);
    const text = container.textContent ?? '';
    // 2 Chinese chars + 3 english words = 5 words total.
    expect(text).toContain('5 字');
    expect(text).toContain('2 行');
  });

  it('shows the estimated reading time for non-empty documents', () => {
    // 800 Chinese chars ~ 2 minutes at 400 chars/min.
    useStore.setState({ content: '字'.repeat(800) });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('约 2 分钟');
  });

  it('does not show reading time for empty documents', () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).not.toContain('分钟');
  });

  it('shows unsaved indicator when dirty', () => {
    useStore.setState({ currentFilePath: '/n.md', isDirty: true });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('未保存');
  });

  it('shows saved indicator with the save time when clean and saved', () => {
    const ts = new Date(2026, 0, 2, 9, 5).getTime();
    useStore.setState({ currentFilePath: '/n.md', isDirty: false, lastSavedAt: ts });
    const { container } = render(<StatusBar />);
    const text = container.textContent ?? '';
    expect(text).toContain('已保存');
    expect(text).toContain('09:05');
  });

  it('shows saved indicator without time when never saved this session', () => {
    useStore.setState({ currentFilePath: '/n.md', isDirty: false, lastSavedAt: null });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('已保存');
  });
});
