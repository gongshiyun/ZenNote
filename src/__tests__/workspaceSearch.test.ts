import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted — keep the shared mock in vi.hoisted so it is
// initialized before the factory runs.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

// Mock the Tauri invoke bridge (Rust command path).
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Mock the file service (legacy JS fallback path).
vi.mock('../services', () => ({
  readFile: vi.fn(),
  openWorkspace: vi.fn(),
}));

import { searchWorkspace, clearWorkspaceSearchCache } from '../lib/workspaceSearch';
import * as fs from '../services';

const mockedInvoke = invokeMock;
const mockedReadFile = fs.readFile as ReturnType<typeof vi.fn>;
const mockedOpenWorkspace = fs.openWorkspace as ReturnType<typeof vi.fn>;

describe('workspaceSearch', () => {
  beforeEach(() => {
    clearWorkspaceSearchCache();
    mockedInvoke.mockReset();
    mockedReadFile.mockReset();
    mockedOpenWorkspace.mockReset();
  });

  it('returns [] for empty query or workspace', async () => {
    expect(await searchWorkspace('', 'q')).toEqual([]);
    expect(await searchWorkspace('/ws', '')).toEqual([]);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('uses the Rust command and passes camelCase args', async () => {
    const hits = [{ filePath: '/ws/a.md', fileName: 'a.md', line: 3, content: 'hello' }];
    mockedInvoke.mockResolvedValueOnce(hits);

    const res = await searchWorkspace('/ws', 'hello', { caseSensitive: true });
    expect(res).toEqual(hits);
    expect(mockedInvoke).toHaveBeenCalledWith('search_workspace', {
      path: '/ws',
      query: 'hello',
      caseSensitive: true,
    });
  });

  it('caches results per workspace+query (no second IPC call)', async () => {
    mockedInvoke.mockResolvedValue([{ filePath: '/ws/a.md', fileName: 'a.md', line: 1, content: 'x' }]);

    await searchWorkspace('/ws', 'x');
    await searchWorkspace('/ws', 'x');
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache when the workspace changes', async () => {
    mockedInvoke.mockResolvedValue([]);
    await searchWorkspace('/ws1', 'x');
    await searchWorkspace('/ws2', 'x');
    // Back to the FIRST workspace: cache was dropped when /ws2 was used.
    await searchWorkspace('/ws1', 'x');
    expect(mockedInvoke).toHaveBeenCalledTimes(3);
  });

  it('falls back to the JS traversal when the Rust command is unavailable', async () => {
    // v0.8.1 backends don't register search_workspace -> invoke rejects.
    mockedInvoke.mockRejectedValue(new Error('command not found'));
    mockedOpenWorkspace.mockResolvedValue([
      {
        name: 'notes', path: '/ws/notes', isDir: true, children: [
          { name: 'guide.md', path: '/ws/notes/guide.md', isDir: false },
        ],
      },
      { name: 'todo.md', path: '/ws/todo.md', isDir: false },
    ]);
    mockedReadFile.mockImplementation(async (p: string) => {
      if (p === '/ws/todo.md') return 'buy milk\nhello world';
      return 'nested hello line';
    });

    const res = await searchWorkspace('/ws', 'hello');

    // File-name traversal reached the NESTED folder (the old pre-fix JS search
    // never descended because it checked is_dir instead of isDir).
    expect(mockedReadFile).toHaveBeenCalledWith('/ws/notes/guide.md');
    const contentHits = res.filter(r => r.line > 0);
    expect(contentHits.map(r => r.filePath)).toContain('/ws/todo.md');
    expect(contentHits.map(r => r.filePath)).toContain('/ws/notes/guide.md');
    const hit = res.find(r => r.filePath === '/ws/todo.md');
    expect(hit?.line).toBe(2);
    expect(hit?.content).toBe('hello world');
  });

  it('legacy fallback reports file-name matches with line=0', async () => {
    mockedInvoke.mockRejectedValue(new Error('nope'));
    mockedOpenWorkspace.mockResolvedValue([
      { name: 'hello-note.md', path: '/ws/hello-note.md', isDir: false },
    ]);
    mockedReadFile.mockResolvedValue('no match inside');

    const res = await searchWorkspace('/ws', 'hello');
    const nameHit = res.find(r => r.line === 0);
    expect(nameHit?.fileName).toBe('hello-note.md');
    expect(nameHit?.content).toBe('');
  });
});
