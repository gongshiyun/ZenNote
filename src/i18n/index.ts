import type { Translations } from "./zh-CN";
import zhCN from "./zh-CN";
import enUS from "./en-US";

export type { Translations } from "./zh-CN";

const locales: Record<string, Translations> = { "zh-CN": zhCN, "en-US": enUS };
let locale: string = "zh-CN";

export function t(): Translations { return locales[locale] ?? zhCN; }
export function getLocale(): string { return locale; }

export function setLocale(l: string) {
  if (locales[l]) { locale = l; try { localStorage.setItem("zennote-locale", l); } catch { /* */ } }
}

// Init from storage
try {
  const saved = localStorage.getItem("zennote-locale");
  if (saved && locales[saved]) locale = saved;
} catch { /* */ }
