import '@testing-library/jest-dom';

// Mock Tauri services
vi.mock('../../services', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  createFile: vi.fn(),
  createFolder: vi.fn(),
  renameFile: vi.fn(),
  deleteFile: vi.fn(),
  openWorkspace: vi.fn(),
  saveImage: vi.fn(),
  resolveImageUrl: vi.fn(),
}));

// Mock i18n
vi.mock('../../i18n', () => ({
  t: () => ({
    editor: {
      openNote: '打开笔记',
    },
  }),
  getLocale: () => 'zh-CN',
  setLocale: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});
