import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useStore } from '../store';

// Mock heavy dependencies (Milkdown, CodeMirror, Mermaid, etc.)
vi.mock('@milkdown/crepe', () => ({ Crepe: vi.fn() }));
vi.mock('@milkdown/crepe/theme/common/style.css', () => ({}));
vi.mock('katex/dist/katex.min.css', () => ({}));
vi.mock('@codemirror/language', () => ({
  LanguageDescription: { of: (o: unknown) => o },
  LanguageSupport: vi.fn(),
  StreamLanguage: { define: (o: unknown) => o },
  indentUnit: { of: () => [] },
}));
vi.mock('@codemirror/language-data', () => ({ languages: [] }));
vi.mock('@codemirror/state', () => ({ EditorState: {} }));
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
vi.mock('../lib/fontStack', () => ({ currentFontStack: () => 'sans-serif' }));
vi.mock('../services', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn(),
  resolveImageUrl: vi.fn(),
}));
vi.mock('../i18n', () => ({
  t: () => ({ editor: { openNote: '打开笔记以开始编辑' } }),
  getLocale: () => 'zh-CN',
  setLocale: vi.fn(),
}));

// Stub child components that pull in heavy UI
vi.mock('../components/editor/FindReplaceBar', () => ({
  FindReplaceBar: () => null,
}));
vi.mock('../components/editor/TableContextMenu', () => ({
  TableContextMenu: () => null,
}));
vi.mock('../components/editor/SourceEditor', () => ({
  SourceEditor: () => <div data-testid="source-editor" />,
}));
vi.mock('../components/editor/findState', () => ({
  znFindKey: {},
  emptyFindState: () => ({}),
}));
vi.mock('../components/editor/codeHighlight', () => ({
  znCodeHighlightStyle: {},
}));

import { Editor } from '../components/editor/Editor';

describe('Editor — smoke tests', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useStore.setState({
      currentFilePath: null,
      content: '',
      isDirty: false,
      sourceMode: false,
      cursorLine: 1,
      cursorCol: 1,
      scrollPosition: 0,
      fileStates: new Map(),
      openTabs: [],
    });
  });

  it('should render placeholder when no file is open', () => {
    render(<Editor />);
    expect(screen.getByText('打开笔记以开始编辑')).toBeInTheDocument();
  });

  it('should render the CodeMirror source editor in source mode when a file is open', () => {
    useStore.setState({
      currentFilePath: '/test/note.md',
      content: '# Hello World',
      sourceMode: true,
      openTabs: ['/test/note.md'],
    });

    render(<Editor />);
    // Source mode is now a CodeMirror 6 editor (no plain textarea).
    expect(screen.getByTestId('source-editor')).toBeInTheDocument();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('should not render placeholder when a file is open', () => {
    useStore.setState({
      currentFilePath: '/test/note.md',
      content: 'Some content',
      sourceMode: true,
      openTabs: ['/test/note.md'],
    });

    render(<Editor />);
    expect(screen.queryByText('打开笔记以开始编辑')).toBeNull();
  });
});
