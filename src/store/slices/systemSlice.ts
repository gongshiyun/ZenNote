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
  setAutoCheckUpdate: (v: boolean) => void;
  setUpdateCheckInterval: (n: number) => void;
  setUpdateState: (s: UpdateState) => void;
  setUpdateVersion: (v: string | null) => void;
}

export interface UISlice {
  sidebarVisible: boolean;
  outlineVisible: boolean;
  searchVisible: boolean;
  settingsVisible: boolean;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  setSearchVisible: (visible: boolean) => void;
  setSettingsVisible: (visible: boolean) => void;
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
  setAutoCheckUpdate: (v) => set({ autoCheckUpdate: v }),
  setUpdateCheckInterval: (n) => set({ updateCheckInterval: n }),
  setUpdateState: (s) => set({ updateState: s }),
  setUpdateVersion: (v) => set({ updateVersion: v }),
});

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  // 默认不展示侧边栏和大纲，由用户在会话中手动开启
  sidebarVisible: false,
  outlineVisible: false,
  searchVisible: false,
  settingsVisible: false,
  toggleSidebar: () => set(s => ({ sidebarVisible: !s.sidebarVisible })),
  toggleOutline: () => set(s => ({ outlineVisible: !s.outlineVisible })),
  setSearchVisible: (visible) => set({ searchVisible: visible }),
  setSettingsVisible: (visible) => set({ settingsVisible: visible }),
});
