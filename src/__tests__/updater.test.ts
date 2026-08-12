import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStore } from '../store';

const { checkMock, relaunchMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  relaunchMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: (...args: unknown[]) => relaunchMock(...args),
}));

import { checkAndDownloadUpdate, installUpdate } from '../lib/updater';

function resetUpdateState() {
  useStore.setState({
    updateState: 'idle',
    updateVersion: null,
  });
}

describe('updater service', () => {
  beforeEach(() => {
    checkMock.mockReset();
    relaunchMock.mockReset();
    resetUpdateState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns to idle when no update is available', async () => {
    checkMock.mockResolvedValue(null);

    await checkAndDownloadUpdate();

    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(useStore.getState().updateState).toBe('idle');
    expect(useStore.getState().updateVersion).toBeNull();
  });

  it('downloads an available update and becomes ready', async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({ version: '1.2.3', download });

    await checkAndDownloadUpdate();

    expect(download).toHaveBeenCalledTimes(1);
    expect(useStore.getState().updateState).toBe('ready');
    expect(useStore.getState().updateVersion).toBe('1.2.3');
  });

  it('is a no-op while already downloading or ready', async () => {
    useStore.setState({ updateState: 'downloading' });
    await checkAndDownloadUpdate();
    expect(checkMock).not.toHaveBeenCalled();

    useStore.setState({ updateState: 'ready' });
    await checkAndDownloadUpdate();
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('records an error and clears it after the cooldown', async () => {
    vi.useFakeTimers();
    checkMock.mockRejectedValue(new Error('network down'));

    const promise = checkAndDownloadUpdate();
    await vi.runAllTimersAsync();
    await promise;

    expect(useStore.getState().updateState).toBe('idle');
  });

  it('does nothing on install when no update was downloaded', async () => {
    await installUpdate();
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it('installs the pending update and relaunches', async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({
      version: '2.0.0',
      download: vi.fn().mockResolvedValue(undefined),
      install,
    });

    await checkAndDownloadUpdate();
    await installUpdate();

    expect(install).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });
});
