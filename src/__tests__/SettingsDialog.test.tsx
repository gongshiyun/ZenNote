import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '../store';

vi.mock('../lib/updater', () => ({
  checkAndDownloadUpdate: vi.fn(),
}));

import { SettingsDialog } from '../components/dialogs/SettingsDialog';

describe('SettingsDialog', () => {
  beforeEach(() => {
    useStore.setState({
      locale: 'zh-CN',
      mode: 'system',
      themeId: 'zen',
      fontFamily: 'sans',
      fontSize: 16,
      tabSize: 2,
      editorPadding: 80,
      autoSaveDelay: 0,
      showHiddenFiles: false,
      showFileExtensions: true,
      defaultSourceMode: false,
      autoCheckUpdate: true,
      updateCheckInterval: 60,
      updateState: 'idle',
      updateVersion: null,
    });
  });

  it('renders the dialog title and switches language', () => {
    render(<SettingsDialog onClose={vi.fn()} />);
    expect(screen.getByText('设置')).toBeInTheDocument();

    fireEvent.click(screen.getByText('English'));
    expect(useStore.getState().locale).toBe('en-US');
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SettingsDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
