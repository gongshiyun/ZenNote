import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStore } from '../store';

const { mermaidInitializeMock, checkAndDownloadUpdateMock } = vi.hoisted(() => ({
  mermaidInitializeMock: vi.fn(),
  checkAndDownloadUpdateMock: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => mermaidInitializeMock(...args),
  },
}));

vi.mock('../lib/updater', () => ({
  checkAndDownloadUpdate: (...args: unknown[]) => checkAndDownloadUpdateMock(...args),
}));

import { useMermaid } from '../hooks/useMermaid';
import { useUpdater } from '../hooks/useUpdater';

describe('useMermaid', () => {
  beforeEach(() => {
    mermaidInitializeMock.mockReset();
    useStore.setState({ resolvedMode: 'light', fontFamily: 'sans' });
  });

  it('initialises mermaid with the warm base theme and the design-token font', async () => {
    renderHook(() => useMermaid());
    await waitFor(() => {
      expect(mermaidInitializeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'antiscript',
          fontFamily: expect.any(String),
          themeVariables: expect.objectContaining({ darkMode: false }),
        }),
      );
    });
  });

  it('switches the base theme to dark variables when resolved mode is dark', async () => {
    useStore.setState({ resolvedMode: 'dark', fontFamily: 'mono' });
    renderHook(() => useMermaid());
    await waitFor(() => {
      expect(mermaidInitializeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'base',
          themeVariables: expect.objectContaining({ darkMode: true }),
        }),
      );
    });
  });
});

describe('useUpdater', () => {
  beforeEach(() => {
    checkAndDownloadUpdateMock.mockReset();
    checkAndDownloadUpdateMock.mockResolvedValue(undefined);
    useStore.setState({ autoCheckUpdate: true, updateCheckInterval: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks after the startup delay and then on the configured interval', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useUpdater());

    await vi.advanceTimersByTimeAsync(5000);
    expect(checkAndDownloadUpdateMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(checkAndDownloadUpdateMock).toHaveBeenCalledTimes(2);

    unmount();
    await vi.advanceTimersByTimeAsync(60000);
    expect(checkAndDownloadUpdateMock).toHaveBeenCalledTimes(2);
  });

  it('does not schedule checks when auto-check is disabled', async () => {
    useStore.setState({ autoCheckUpdate: false });
    vi.useFakeTimers();
    renderHook(() => useUpdater());

    await vi.advanceTimersByTimeAsync(20000);
    expect(checkAndDownloadUpdateMock).not.toHaveBeenCalled();
  });
});
