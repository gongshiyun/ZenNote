/**
 * System Slice — locale, updater, and UI panel visibility.
 */
import type { StateCreator } from "zustand";
import type { UpdateState } from "../../domain";
import { getLocale } from "../../i18n";

export interface LocaleSlice {
  locale: string;
  setLocale: (locale: string) => void;
}

export interface UpdateSlice {
  autoCheckUpdate: boolean;
  updateCheckInterval: number; // minutes
  updateState: UpdateState;
  updateVersion: string | null;
  /** 最近一次更新检查/下载/安装失败的错误信息（null = 无错误）；持续展示直到下次重试，不再静默清除 */
  updateError: string | null;
  /** 下载进度（0-100）；null = 未知或非下载中 */
  updateProgress: number | null;
  setAutoCheckUpdate: (v: boolean) => void;
  setUpdateCheckInterval: (n: number) => void;
  setUpdateState: (s: UpdateState) => void;
  setUpdateVersion: (v: string | null) => void;
  setUpdateError: (msg: string | null) => void;
  setUpdateProgress: (p: number | null) => void;
}

export interface UISlice {
  sidebarVisible: boolean;
  outlineVisible: boolean;
  /** Persisted px widths of the two side panels. */
  sidebarWidth: number;
  outlineWidth: number;
  searchVisible: boolean;
  settingsVisible: boolean;
  saveError: string | null;
  imageUploadCount: number;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  setSidebarWidth: (width: number) => void;
  setOutlineWidth: (width: number) => void;
  setSearchVisible: (visible: boolean) => void;
  setSettingsVisible: (visible: boolean) => void;
  setSaveError: (message: string | null) => void;
  beginImageUpload: () => void;
  endImageUpload: () => void;
}

export const createLocaleSlice: StateCreator<LocaleSlice, [], [], LocaleSlice> = (set) => ({
  locale: getLocale(),
  setLocale: (locale) => set({ locale }),
});

export const createUpdateSlice: StateCreator<UpdateSlice, [], [], UpdateSlice> = (set) => ({
  autoCheckUpdate: true,
  updateCheckInterval: 60,
  updateState: "idle",
  updateVersion: null,
  updateError: null,
  updateProgress: null,
  setAutoCheckUpdate: (v) => set({ autoCheckUpdate: v }),
  setUpdateCheckInterval: (n) => set({ updateCheckInterval: n }),
  setUpdateState: (s) => set({ updateState: s }),
  setUpdateVersion: (v) => set({ updateVersion: v }),
  setUpdateError: (msg) => set({ updateError: msg }),
  setUpdateProgress: (p) => set({ updateProgress: p }),
});

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  // A note app should open with its workspace tree visible; the outline panel is
  // an opt-in reading aid. Both settings are restored from the session.
  sidebarVisible: true,
  outlineVisible: false,
  // Defaults mirror --zn-sidebar-w / --zn-outline-w in tokens.css. Once the user
  // drags a handle the resolved px width is stored here so it survives panel
  // toggles and relaunches.
  sidebarWidth: 260,
  outlineWidth: 200,
  searchVisible: false,
  settingsVisible: false,
  saveError: null,
  imageUploadCount: 0,
  toggleSidebar: () => set(s => ({ sidebarVisible: !s.sidebarVisible })),
  toggleOutline: () => set(s => ({ outlineVisible: !s.outlineVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(480, width)) }),
  setOutlineWidth: (width) => set({ outlineWidth: Math.max(150, Math.min(360, width)) }),
  setSearchVisible: (visible) => set({ searchVisible: visible }),
  setSettingsVisible: (visible) => set({ settingsVisible: visible }),
  setSaveError: (message) => set({ saveError: message }),
  beginImageUpload: () => set(s => ({ imageUploadCount: s.imageUploadCount + 1 })),
  endImageUpload: () => set(s => ({ imageUploadCount: Math.max(0, s.imageUploadCount - 1) })),
});
