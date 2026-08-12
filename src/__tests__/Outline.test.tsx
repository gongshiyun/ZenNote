import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../store';
import { Outline } from '../components/outline/Outline';

describe('Outline', () => {
  beforeEach(() => {
    useStore.setState({
      content: '',
      sourceMode: false,
      headings: [],
      activeHeadingId: null,
    });
    document.body.innerHTML = '';
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the empty state when there are no displayable headings', () => {
    render(<Outline />);
    expect(screen.getByText('暂无标题')).toBeInTheDocument();
  });

  it('renders h1-h3 headings and hides h4+ headings', () => {
    useStore.setState({
      content: '# A\n## B\n### C\n#### D',
    });
    render(<Outline />);

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).toBeNull();
  });

  it('sets the active heading and scrolls to the matching DOM heading', () => {
    useStore.setState({
      content: '# A\n## B',
    });
    render(<Outline />);

    const pm = document.createElement('div');
    pm.className = 'ProseMirror';
    pm.innerHTML = '<h1>A</h1><h2>B</h2>';
    document.body.appendChild(pm);

    fireEvent.click(screen.getByTitle('B'));

    expect(useStore.getState().activeHeadingId).toBe('1');
    const scrollSpy = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(pm.querySelector('h2')).toBeInstanceOf(HTMLElement);
  });
});
