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

    // Headings as Live Preview renders them: styled lines inside CodeMirror's
    // scroller, not `h1`/`h2` elements.
    const preview = document.createElement('div');
    preview.className = 'zn-live-preview';
    const scroller = document.createElement('div');
    scroller.className = 'cm-scroller';
    const first = document.createElement('div');
    first.className = 'cm-line cm-zn-h1';
    first.textContent = 'A';
    const second = document.createElement('div');
    second.className = 'cm-line cm-zn-h2';
    second.textContent = 'B';
    scroller.append(first, second);
    preview.appendChild(scroller);
    document.body.appendChild(preview);

    fireEvent.click(screen.getByTitle('B'));

    expect(useStore.getState().activeHeadingId).toBe('1');
    const scrollSpy = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    // The second rendered heading is the one the second row points at.
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(second.scrollIntoView).toBeDefined();
  });
});
