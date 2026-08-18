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
    updateError: null,
    updateProgress: null,
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

  it('is a no-op while already checking, downloading, installing or ready', async () => {
    useStore.setState({ updateState: 'checking' });
    await checkAndDownloadUpdate();
    expect(checkMock).not.toHaveBeenCalled();

    useStore.setState({ updateState: 'downloading' });
    await checkAndDownloadUpdate();
    expect(checkMock).not.toHaveBeenCalled();

    useStore.setState({ updateState: 'installing' });
    await checkAndDownloadUpdate();
    expect(checkMock).not.toHaveBeenCalled();

    useStore.setState({ updateState: 'ready' });
    await checkAndDownloadUpdate();
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('records an error that PERSISTS in the UI instead of silently reverting to idle', async () => {
    checkMock.mockRejectedValue(new Error('network down'));

    await checkAndDownloadUpdate();

    // 错误必须持续展示（含原因），直到用户手动重试或下次自动检查。
    expect(useStore.getState().updateState).toBe('error');
    expect(useStore.getState().updateError).toContain('network down');
    await new Promise(r => setTimeout(r, 20));
    expect(useStore.getState().updateState).toBe('error');
  });

  it('shows an up-to-date confirmation for manual checks, then falls back to idle', async () => {
    vi.useFakeTimers();
    checkMock.mockResolvedValue(null);

    await checkAndDownloadUpdate(true);
    expect(useStore.getState().updateState).toBe('uptodate');

    await vi.advanceTimersByTimeAsync(4000);
    expect(useStore.getState().updateState).toBe('idle');
  });

  it('retries a failed download (transient network error) before becoming ready', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const download = vi.fn().mockImplementation((onEvent?: (ev: { event: string; data: { contentLength?: number; chunkLength?: number } }) => void) => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('connection reset'));
      if (onEvent) {
        onEvent({ event: 'Started', data: { contentLength: 200 } });
        onEvent({ event: 'Progress', data: { chunkLength: 100 } });
        onEvent({ event: 'Progress', data: { chunkLength: 100 } });
      }
      return Promise.resolve();
    });
    checkMock.mockResolvedValue({ version: '1.0.0', download });

    const promise = checkAndDownloadUpdate();
    // 第一次失败 → 退避 2s → 第二次成功。
    await vi.runAllTimersAsync();
    await promise;

    expect(calls).toBe(2);
    expect(useStore.getState().updateState).toBe('ready');
    expect(useStore.getState().updateProgress).toBeNull();
  });

  it('records an install failure with its cause', async () => {
    const install = vi.fn().mockRejectedValue(new Error('installer locked'));
    checkMock.mockResolvedValue({
      version: '2.0.0',
      download: vi.fn().mockResolvedValue(undefined),
      install,
    });

    await checkAndDownloadUpdate();
    await installUpdate();

    expect(useStore.getState().updateState).toBe('error');
    expect(useStore.getState().updateError).toContain('installer locked');
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
