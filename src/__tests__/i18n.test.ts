import { describe, it, expect, afterEach } from 'vitest';
import { t, getLocale, setLocale } from '../i18n';

describe('i18n', () => {
  afterEach(() => {
    setLocale('zh-CN');
  });

  it('defaults to zh-CN', () => {
    expect(getLocale()).toBe('zh-CN');
  });

  it('returns the active translation object', () => {
    expect(t().app.title).toBe('ZenNote');
    expect(typeof t().titlebar.export).toBe('string');
  });

  it('switches to en-US and persists the choice', () => {
    setLocale('en-US');
    expect(getLocale()).toBe('en-US');
    expect(t().titlebar.export).toBe('Export');
    expect(localStorage.setItem).toHaveBeenCalledWith('zennote-locale', 'en-US');
  });

  it('ignores unsupported locales and falls back to zh-CN', () => {
    setLocale('fr-FR');
    expect(getLocale()).toBe('zh-CN');
    expect(t().app.title).toBe('ZenNote');
  });
});
