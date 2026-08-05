import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../store';
import { Titlebar } from '../components/layout/Titlebar';

// Uses the REAL store and REAL i18n (zh-CN). The Tauri window API is resolved
// lazily with try/catch inside Titlebar, so jsdom runs are safe.

const TYPEWRITER_TITLE = '打字机模式（光标行居中，弱化其他内容）';
const FOCUS_TITLE = '专注模式（弱化其他段落）';

describe('Titlebar writing-mode buttons', () => {
  beforeEach(() => {
    useStore.setState({ typewriterMode: false, focusMode: false });
  });

  it('renders both mode buttons', () => {
    render(<Titlebar />);
    expect(screen.getByTitle(TYPEWRITER_TITLE)).toBeInTheDocument();
    expect(screen.getByTitle(FOCUS_TITLE)).toBeInTheDocument();
  });

  it('toggles typewriter mode on click', () => {
    render(<Titlebar />);
    const btn = screen.getByTitle(TYPEWRITER_TITLE);
    fireEvent.click(btn);
    expect(useStore.getState().typewriterMode).toBe(true);
    fireEvent.click(btn);
    expect(useStore.getState().typewriterMode).toBe(false);
  });

  it('toggles focus mode on click', () => {
    render(<Titlebar />);
    const btn = screen.getByTitle(FOCUS_TITLE);
    fireEvent.click(btn);
    expect(useStore.getState().focusMode).toBe(true);
    fireEvent.click(btn);
    expect(useStore.getState().focusMode).toBe(false);
  });

  it('shows the active style when a mode is enabled', () => {
    useStore.setState({ typewriterMode: true });
    render(<Titlebar />);
    const btn = screen.getByTitle(TYPEWRITER_TITLE);
    expect(btn.style.background).toBe('var(--bg-sidebar-hover)');
    expect(btn.style.color).toBe('var(--text-accent)');
  });

  it('keeps an inactive style when modes are off', () => {
    render(<Titlebar />);
    const btn = screen.getByTitle(FOCUS_TITLE);
    expect(btn.style.background).toBe('transparent');
  });

  it('the two modes are independent', () => {
    render(<Titlebar />);
    fireEvent.click(screen.getByTitle(TYPEWRITER_TITLE));
    fireEvent.click(screen.getByTitle(FOCUS_TITLE));
    const s = useStore.getState();
    expect(s.typewriterMode).toBe(true);
    expect(s.focusMode).toBe(true);
  });
});
