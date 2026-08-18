import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('Appearance slices', () => {
  beforeEach(() => {
    useStore.setState({
      mode: 'system',
      resolvedMode: 'light',
      themeId: 'zen',
      fontFamily: 'sans',
      fontSize: 16,
      tabSize: 2,
      editorPadding: 80,
      autoSaveDelay: 0,
      showHiddenFiles: false,
      showFileExtensions: true,
      defaultSourceMode: false,
    });
  });

  it('exposes theme defaults', () => {
    const s = useStore.getState();
    expect(s.mode).toBe('system');
    expect(s.resolvedMode).toBe('light');
    expect(s.themeId).toBe('zen');
    expect(s.fontFamily).toBe('sans');
  });

  it('updates theme state', () => {
    const s = useStore.getState();
    s.setMode('dark');
    s.setResolvedMode('dark');
    s.setThemeId('ocean');
    s.setFontFamily('serif');

    const next = useStore.getState();
    expect(next.mode).toBe('dark');
    expect(next.resolvedMode).toBe('dark');
    expect(next.themeId).toBe('ocean');
    expect(next.fontFamily).toBe('serif');
  });

  it('updates editor configuration', () => {
    const s = useStore.getState();
    s.setFontSize(20);
    s.setTabSize(4);
    s.setEditorPadding(120);
    s.setAutoSaveDelay(1500);
    s.setShowHiddenFiles(true);
    s.setShowFileExtensions(false);
    s.setDefaultSourceMode(true);

    const next = useStore.getState();
    expect(next.fontSize).toBe(20);
    expect(next.tabSize).toBe(4);
    expect(next.editorPadding).toBe(120);
    expect(next.autoSaveDelay).toBe(1500);
    expect(next.showHiddenFiles).toBe(true);
    expect(next.showFileExtensions).toBe(false);
    expect(next.defaultSourceMode).toBe(true);
  });
});

describe('System slices', () => {
  beforeEach(() => {
    useStore.setState({
      locale: 'zh-CN',
      autoCheckUpdate: true,
      updateCheckInterval: 60,
      updateState: 'idle',
      updateVersion: null,
      sidebarVisible: false,
      outlineVisible: false,
      searchVisible: false,
      settingsVisible: false,
    });
  });

  it('updates locale and updater settings', () => {
    const s = useStore.getState();
    s.setLocale('en-US');
    s.setAutoCheckUpdate(false);
    s.setUpdateCheckInterval(1440);
    s.setUpdateState('ready');
    s.setUpdateVersion('1.0.0');

    const next = useStore.getState();
    expect(next.locale).toBe('en-US');
    expect(next.autoCheckUpdate).toBe(false);
    expect(next.updateCheckInterval).toBe(1440);
    expect(next.updateState).toBe('ready');
    expect(next.updateVersion).toBe('1.0.0');
  });

  it('toggles the UI panels', () => {
    const s = useStore.getState();
    s.toggleSidebar();
    s.toggleOutline();
    s.setSearchVisible(true);
    s.setSettingsVisible(true);

    const next = useStore.getState();
    expect(next.sidebarVisible).toBe(true);
    expect(next.outlineVisible).toBe(true);
    expect(next.searchVisible).toBe(true);
    expect(next.settingsVisible).toBe(true);
  });
});

describe('Outline slice', () => {
  beforeEach(() => {
    useStore.setState({ headings: [], activeHeadingId: null });
  });

  it('stores and replaces headings', () => {
    const headings = [
      { level: 1, text: 'A', pos: 0 },
      { level: 2, text: 'B', pos: 2 },
    ];
    useStore.getState().setHeadings(headings);
    expect(useStore.getState().headings).toEqual(headings);
  });

  it('stores the active heading id', () => {
    useStore.getState().setActiveHeading('2');
    expect(useStore.getState().activeHeadingId).toBe('2');
  });
});

describe('Editor slice edge cases', () => {
  beforeEach(() => {
    useStore.setState({
      currentFilePath: null,
      content: '',
      isDirty: false,
      cursorLine: 1,
      cursorCol: 1,
      scrollPosition: 0,
      lastSavedAt: null,
      fileStates: new Map(),
      openTabs: [],
    });
  });

  it('sets the last saved timestamp', () => {
    useStore.getState().setLastSavedAt(12345);
    expect(useStore.getState().lastSavedAt).toBe(12345);
    useStore.getState().setLastSavedAt(null);
    expect(useStore.getState().lastSavedAt).toBeNull();
  });

  it('caches and restores per-file state including the dirty flag', () => {
    const s = useStore.getState();
    s.setCurrentFile('/notes/a.md', 'alpha');
    s.setContent('alpha edited');
    s.setCursorPosition(4, 2);
    s.setScrollPosition(80);
    s.cacheCurrentFileState();

    const cached = useStore.getState().fileStates.get('/notes/a.md');
    expect(cached).toEqual({
      content: 'alpha edited',
      scrollPos: 80,
      cursorLine: 4,
      cursorCol: 2,
      dirty: true,
    });

    useStore.getState().setCurrentFile('/notes/b.md', 'beta');
    const restored = useStore.getState().restoreFileState('/notes/a.md');
    expect(restored).toEqual(cached);
  });

  it('setCurrentFile restores cached state when switching back', () => {
    const s = useStore.getState();
    s.setCurrentFile('/notes/a.md', 'alpha');
    s.setContent('alpha edited');
    s.setCursorPosition(3, 1);
    s.setScrollPosition(42);
    s.setCurrentFile('/notes/b.md', 'beta');
    s.setCurrentFile('/notes/a.md', 'ignored-fresh-content');

    const next = useStore.getState();
    expect(next.content).toBe('alpha edited');
    expect(next.cursorLine).toBe(3);
    expect(next.cursorCol).toBe(1);
    expect(next.scrollPosition).toBe(42);
    expect(next.isDirty).toBe(true);
  });

  it('switchTab switches to a cached tab without reading disk', () => {
    const s = useStore.getState();
    s.setCurrentFile('/notes/a.md', 'alpha');
    s.setCurrentFile('/notes/b.md', 'beta');

    useStore.getState().switchTab('/notes/a.md');
    expect(useStore.getState().currentFilePath).toBe('/notes/a.md');
    expect(useStore.getState().content).toBe('alpha');
  });

  it('closeTab removes a non-current tab and leaves the current tab active', () => {
    const s = useStore.getState();
    s.setCurrentFile('/notes/a.md', 'alpha');
    s.setCurrentFile('/notes/b.md', 'beta');

    useStore.getState().closeTab('/notes/a.md');
    expect(useStore.getState().openTabs).toEqual(['/notes/b.md']);
    expect(useStore.getState().currentFilePath).toBe('/notes/b.md');
  });

  it('closeTab of the current tab switches to the nearest surviving tab', () => {
    const s = useStore.getState();
    s.setCurrentFile('/notes/a.md', 'alpha');
    s.setCurrentFile('/notes/b.md', 'beta');
    s.setCurrentFile('/notes/c.md', 'gamma');

    useStore.getState().closeTab('/notes/b.md');
    expect(useStore.getState().openTabs).toEqual(['/notes/a.md', '/notes/c.md']);
    expect(useStore.getState().currentFilePath).toBe('/notes/c.md');
  });
});
