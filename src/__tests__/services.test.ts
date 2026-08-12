import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock, convertFileSrcMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  convertFileSrcMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (...args: unknown[]) => convertFileSrcMock(...args),
}));

import {
  readFile,
  writeFile,
  createFile,
  createFolder,
  renameFile,
  deleteFile,
  openWorkspace,
  readDir,
  saveImage,
  resolveImageUrl,
} from '../services';

describe('fileService IPC wrappers', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('readFile calls the read_file command and returns its payload', async () => {
    invokeMock.mockResolvedValueOnce('content');
    await expect(readFile('C:\\note.md')).resolves.toBe('content');
    expect(invokeMock).toHaveBeenCalledWith('read_file', { path: 'C:\\note.md' });
  });

  it('writeFile calls the write_file command with content', async () => {
    await writeFile('C:\\note.md', '# hello');
    expect(invokeMock).toHaveBeenCalledWith('write_file', { path: 'C:\\note.md', content: '# hello' });
  });

  it('createFile/createFolder/renameFile/deleteFile use the expected commands', async () => {
    await createFile('C:\\note.md');
    await createFolder('C:\\folder');
    await renameFile('C:\\a.md', 'C:\\b.md');
    await deleteFile('C:\\b.md');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'create_file', { path: 'C:\\note.md' });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'create_folder', { path: 'C:\\folder' });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'rename_file', { oldPath: 'C:\\a.md', newPath: 'C:\\b.md' });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'delete_file', { path: 'C:\\b.md' });
  });

  it('openWorkspace and readDir call their commands and return tree nodes', async () => {
    invokeMock
      .mockResolvedValueOnce([{ name: 'a.md', path: '/ws/a.md', isDir: false }])
      .mockResolvedValueOnce([{ name: 'dir', path: '/ws/dir', isDir: true }]);

    await expect(openWorkspace('/ws')).resolves.toEqual([{ name: 'a.md', path: '/ws/a.md', isDir: false }]);
    await expect(readDir('/ws/dir')).resolves.toEqual([{ name: 'dir', path: '/ws/dir', isDir: true }]);
    expect(invokeMock).toHaveBeenCalledWith('open_workspace', { path: '/ws' });
    expect(invokeMock).toHaveBeenCalledWith('read_dir', { path: '/ws/dir' });
  });
});

describe('imageService', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    convertFileSrcMock.mockReset();
  });

  describe('saveImage', () => {
    it('writes the image next to the note and returns a relative assets path', async () => {
      invokeMock.mockResolvedValue(undefined);
      const file = new File(['abc'], 'photo.PNG');

      const rel = await saveImage(file, 'C:\\notes\\note.md');

      expect(rel).toMatch(/^assets\/img-\d+-[a-z0-9]+\.png$/i);
      expect(invokeMock).toHaveBeenCalledTimes(1);
      const [cmd, args] = invokeMock.mock.calls[0];
      expect(cmd).toBe('write_file_binary');
      expect(args.path).toContain('C:\\notes/assets/img-');
      expect(args.path).toMatch(/img-\d+-[a-z0-9]+\.png$/i);
      expect(args.bytes).toBeInstanceOf(Uint8Array);
      expect(Array.from(args.bytes as Uint8Array)).toEqual([97, 98, 99]);
    });

    it('uses a top-level assets folder when there is no note path', async () => {
      invokeMock.mockResolvedValue(undefined);
      const rel = await saveImage(new File(['abc'], 'image.png'), null);
      expect(rel).toMatch(/^assets\/img-\d+-[a-z0-9]+\.png$/i);
      expect((invokeMock.mock.calls[0] as any[])[1].path).toMatch(/^assets\/img-\d+-[a-z0-9]+\.png$/i);
    });
  });

  describe('resolveImageUrl', () => {
    beforeEach(() => {
      convertFileSrcMock.mockImplementation(p => 'asset://' + p);
    });

    it('passes through web/data/blob URLs unchanged', () => {
      expect(resolveImageUrl('https://example.com/a.png', null)).toBe('https://example.com/a.png');
      expect(resolveImageUrl('data:image/png;base64,abc', null)).toBe('data:image/png;base64,abc');
      expect(resolveImageUrl('blob:http://x/y', null)).toBe('blob:http://x/y');
    });

    it('passes through existing asset URLs unchanged', () => {
      expect(resolveImageUrl('asset://localhost/foo', null)).toBe('asset://localhost/foo');
      expect(resolveImageUrl('http://asset.localhost/foo', null)).toBe('http://asset.localhost/foo');
    });

    it('resolves relative paths against the note directory', () => {
      expect(resolveImageUrl('assets/a.png', 'C:\\notes\\note.md')).toBe('asset://C:/notes/assets/a.png');
      expect(convertFileSrcMock).toHaveBeenCalledWith('C:/notes/assets/a.png');
    });

    it('returns relative paths unchanged without a note path', () => {
      expect(resolveImageUrl('assets/a.png', null)).toBe('assets/a.png');
      expect(convertFileSrcMock).not.toHaveBeenCalled();
    });

    it('normalises absolute windows, UNC, and POSIX paths', () => {
      expect(resolveImageUrl('C:\\img\\a.png', null)).toBe('asset://C:/img/a.png');
      expect(resolveImageUrl('\\\\server\\share\\a.png', null)).toBe('asset:////server/share/a.png');
      expect(resolveImageUrl('/img/a.png', null)).toBe('asset:///img/a.png');
    });

    it('returns empty input unchanged', () => {
      expect(resolveImageUrl('', null)).toBe('');
    });
  });
});
