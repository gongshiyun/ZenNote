import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useStore } from "../../store";
import { t, setLocale } from "../../i18n";
import { exportToHtml, exportToPdf } from "../../lib/exportNote";
import { installUpdate } from "../../lib/updater";
import {
  AppMark,
  ArrowUpIcon,
  CloseIcon,
  ExportIcon,
  MaximizeIcon,
  MinusIcon,
  MonitorIcon,
  MoonIcon,
  PanelLeftIcon,
  PanelRightIcon,
  RestoreIcon,
  SettingsIcon,
  SunIcon,
} from "../ui/icons";
import { Button, DropdownMenu, IconButton, MenuItem, MenuLabel } from "../ui";

// Tauri window API - lazy init to survive browser dev
let _appWindow: any = null;
async function getAppWindow() {
  if (_appWindow) return _appWindow;
  try {
    const m = await import("@tauri-apps/api/window");
    _appWindow = m.getCurrentWindow();
    return _appWindow;
  } catch {
    return null;
  }
}

/**
 * Anchored-menu toggle. `DropdownMenu` dismisses itself on the same mousedown
 * that a second click on the trigger starts, so a plain `setOpen(!open)` would
 * close and instantly reopen. Remembering whether the menu was open when the
 * pointer went down distinguishes "close" from "open" across that boundary.
 */
function useAnchoredMenu() {
  const [open, setOpen] = useState(false);
  const openAtPress = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  const triggerProps = {
    onMouseDown: () => {
      openAtPress.current = open;
    },
    onClick: () => {
      if (openAtPress.current) {
        openAtPress.current = false;
        setOpen(false);
      } else {
        setOpen(v => !v);
      }
    },
  };
  return { open, close, triggerProps };
}

export function Titlebar() {
  const currentFilePath = useStore(s => s.currentFilePath);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const toggleOutline = useStore(s => s.toggleOutline);
  const setSettingsVisible = useStore(s => s.setSettingsVisible);
  const mode = useStore(s => s.mode);
  const setMode = useStore(s => s.setMode);
  const locale = useStore(s => s.locale);
  const storeSetLocale = useStore(s => s.setLocale);
  const updateState = useStore(s => s.updateState);
  const updateVersion = useStore(s => s.updateVersion);
  const [isMaximized, setIsMaximized] = useState(false);
  const appearanceMenu = useAnchoredMenu();
  const exportMenu = useAnchoredMenu();

  useEffect(() => {
    getAppWindow().then(win => {
      if (!win) return;
      win.isMaximized().then(setIsMaximized).catch(() => {});
    });
  }, []);

  const minimize = useCallback(() => {
    getAppWindow().then(win => win?.minimize().catch(() => {}));
  }, []);
  const toggleMax = useCallback(() => {
    getAppWindow().then(win => {
      if (!win) return;
      win.toggleMaximize().then(() => setIsMaximized(v => !v)).catch(() => {});
    });
  }, []);
  const close = useCallback(() => {
    getAppWindow().then(win => win?.close().catch(() => {}));
  }, []);

  const handleDoubleClick = useCallback((e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    toggleMax();
  }, [toggleMax]);

  const toggleLocale = useCallback(() => {
    const next = locale === "zh-CN" ? "en-US" : "zh-CN";
    storeSetLocale(next);
    setLocale(next);
  }, [locale, storeSetLocale]);

  const { close: closeExportMenu } = exportMenu;
  const runExport = useCallback((kind: "html" | "pdf") => {
    closeExportMenu();
    const s = useStore.getState();
    if (!s.currentFilePath || !s.content) return;
    if (kind === "pdf") void exportToPdf(s.content, s.currentFilePath);
    else void exportToHtml(s.content, s.currentFilePath);
  }, [closeExportMenu]);

  const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() || "ZenNote" : "ZenNote";
  const AppearanceIcon = mode === "light" ? SunIcon : mode === "dark" ? MoonIcon : MonitorIcon;

  return (
    <div
      className="zn-titlebar titlebar-drag"
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      <div className="zn-titlebar__lead titlebar-no-drag">
        <div className="zn-brand">
          <AppMark size={16} />
          <span className="zn-brand__wordmark">ZenNote</span>
        </div>
        <IconButton label={t().titlebar.toggleSidebar} onClick={toggleSidebar}>
          <PanelLeftIcon size={18} />
        </IconButton>
        <IconButton label={t().titlebar.toggleOutline} onClick={toggleOutline}>
          <PanelRightIcon size={18} />
        </IconButton>
        <div className="zn-titlebar__anchor">
          <IconButton
            label={t().titlebar.export}
            active={exportMenu.open}
            aria-haspopup="menu"
            aria-expanded={exportMenu.open}
            {...exportMenu.triggerProps}
          >
            <ExportIcon size={18} />
          </IconButton>
          {exportMenu.open && (
            <ExportMenu onSelect={runExport} onClose={exportMenu.close} />
          )}
        </div>
        <IconButton label={t().titlebar.settings} onClick={() => setSettingsVisible(true)}>
          <SettingsIcon size={18} />
        </IconButton>
      </div>

      {currentFilePath && <div className="zn-titlebar__doc">{fileName}</div>}

      <div className="zn-titlebar__trail titlebar-no-drag">
        {updateState === "ready" && (
          <Button
            variant="primary"
            size="sm"
            className="zn-titlebar__update"
            iconLeft={<ArrowUpIcon size={13} />}
            title={`${t().titlebar.installUpdate}${updateVersion ? ` v${updateVersion}` : ""}`}
            onClick={() => { void installUpdate(); }}
          >
            {t().titlebar.installUpdate}
            {updateVersion ? ` v${updateVersion}` : ""}
          </Button>
        )}

        <div className="zn-titlebar__anchor">
          <IconButton
            label={t().titlebar.theme}
            active={appearanceMenu.open}
            aria-haspopup="menu"
            aria-expanded={appearanceMenu.open}
            {...appearanceMenu.triggerProps}
          >
            <AppearanceIcon size={18} />
          </IconButton>
          {appearanceMenu.open && (
            <ThemeDropdown
              mode={mode}
              onSelectMode={(m) => {
                setMode(m);
                appearanceMenu.close();
              }}
              onClose={appearanceMenu.close}
            />
          )}
        </div>

        <button
          type="button"
          className="zn-titlebar__lang"
          title={locale === "zh-CN" ? "Switch to English" : "切换为中文"}
          aria-label={locale === "zh-CN" ? "Switch to English" : "切换为中文"}
          onClick={toggleLocale}
        >
          {locale === "zh-CN" ? "中" : "EN"}
        </button>

        <span className="zn-titlebar__divider" aria-hidden="true" />

        <div className="zn-titlebar__window-controls">
          <button
            type="button"
            className="zn-win-btn"
            title={t().titlebar.minimize}
            aria-label={t().titlebar.minimize}
            onClick={minimize}
          >
            <MinusIcon size={14} />
          </button>
          <button
            type="button"
            className="zn-win-btn"
            title={isMaximized ? t().titlebar.restore : t().titlebar.maximize}
            aria-label={isMaximized ? t().titlebar.restore : t().titlebar.maximize}
            onClick={toggleMax}
          >
            {isMaximized ? <RestoreIcon size={14} /> : <MaximizeIcon size={14} />}
          </button>
          <button
            type="button"
            className="zn-win-btn zn-win-btn--close"
            title={t().titlebar.close}
            aria-label={t().titlebar.close}
            onClick={close}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Export dropdown ----
function ExportMenu({ onSelect, onClose }: {
  onSelect: (kind: "html" | "pdf") => void;
  onClose: () => void;
}) {
  return (
    <DropdownMenu align="left" width={210} onClose={onClose} label={t().titlebar.export}>
      <MenuLabel>{t().titlebar.export}</MenuLabel>
      <MenuItem
        label={t().titlebar.exportPdf}
        shortcut="Ctrl+Shift+P"
        onSelect={() => onSelect("pdf")}
      />
      <MenuItem
        label={t().titlebar.exportHtml}
        shortcut="Ctrl+Shift+E"
        onSelect={() => onSelect("html")}
      />
    </DropdownMenu>
  );
}

// ---- Appearance dropdown ----
export function ThemeDropdown({ mode, onSelectMode, onClose }: {
  mode: string;
  onSelectMode: (m: "light" | "dark" | "system") => void;
  onClose: () => void;
}) {
  const options: Array<{
    value: "light" | "dark" | "system";
    label: string;
    icon: ReactNode;
  }> = [
    { value: "light", label: t().statusbar.light, icon: <SunIcon size={15} /> },
    { value: "dark", label: t().statusbar.dark, icon: <MoonIcon size={15} /> },
    { value: "system", label: t().statusbar.system, icon: <MonitorIcon size={15} /> },
  ];
  return (
    <DropdownMenu align="right" width={200} onClose={onClose} label={t().titlebar.themeMode}>
      <MenuLabel>{t().titlebar.themeMode}</MenuLabel>
      {options.map((option) => (
        <MenuItem
          key={option.value}
          icon={option.icon}
          label={option.label}
          shortcut={mode === option.value ? "✓" : undefined}
          onSelect={() => onSelectMode(option.value)}
        />
      ))}
    </DropdownMenu>
  );
}
