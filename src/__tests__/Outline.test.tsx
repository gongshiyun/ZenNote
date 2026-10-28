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
      headingJumpRequest: null,
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

  // Navigation is by SOURCE POSITION, not by a DOM index: CodeMirror only
  // renders the viewport, so `querySelectorAll(...)[idx]` used to jump to the
  // wrong heading in any note taller than one screen.
  it('requests a document-position jump and marks the clicked row active', () => {
    useStore.setState({ content: '# A\n## B' });
    render(<Outline />);

    fireEvent.click(screen.getByTitle('B'));

    expect(useStore.getState().activeHeadingId).toBe('1');
    const request = useStore.getState().headingJumpRequest;
    expect(request).not.toBeNull();
    // `pos` is the 0-based source line of the heading (`## B` is line 2).
    expect(request?.pos).toBe(1);
  });

  it('switches out of source mode when jumping so the rendered editor can consume the request', () => {
    useStore.setState({ content: '# A\n## B', sourceMode: true });
    render(<Outline />);

    fireEvent.click(screen.getByTitle('A'));

    expect(useStore.getState().sourceMode).toBe(false);
    expect(useStore.getState().headingJumpRequest?.pos).toBe(0);
  });
});
