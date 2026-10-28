import { useState, type ReactNode } from "react";
import { useStore, type ThemeMode } from "../../store";
import { t, setLocale } from "../../i18n";
import { checkAndDownloadUpdate, installUpdate } from "../../lib/updater";
import {
  AppMark,
  Button,
  Field,
  FolderIcon,
  FormSection,
  InfoIcon,
  Modal,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  RefreshIcon,
  Segmented,
  SettingsIcon,
  SliderField,
  Spinner,
  SunIcon,
  Switch,
  TypeIcon,
} from "../ui";
import type { SegmentedOption } from "../ui";

// Curated font styles. `stack` is a representative preview stack (the full stack
// lives in styles/tokens.css under :root[data-font="..."]).
const FONT_OPTIONS = [
  { value: "claude", labelKey: "fontClaude", stack: '"Anthropic Sans", "Inter", "Segoe UI", sans-serif' },
  { value: "sans", labelKey: "fontSans", stack: '"Microsoft YaHei", "Segoe UI", sans-serif' },
  { value: "serif", labelKey: "fontSerif", stack: 'Georgia, "Noto Serif SC", serif' },
  { value: "mono", labelKey: "fontMono", stack: '"Cascadia Code", Consolas, monospace' },
  { value: "kai", labelKey: "fontKai", stack: '"KaiTi", "楷体", serif' },
  { value: "song", labelKey: "fontSong", stack: '"SimSun", "宋体", serif' },
  { value: "heiti", labelKey: "fontHeiti", stack: '"SimHei", "黑体", sans-serif' },
  { value: "fangsong", labelKey: "fontFangsong", stack: '"FangSong", "仿宋", serif' },
  { value: "rounded", labelKey: "fontRounded", stack: '"Yuanti SC", "YouYuan", sans-serif' },
  { value: "humanist", labelKey: "fontHumanist", stack: '"Segoe UI", Verdana, sans-serif' },
  { value: "geometric", labelKey: "fontGeometric", stack: '"Century Gothic", Futura, sans-serif' },
  { value: "literary", labelKey: "fontLiterary", stack: '"Palatino Linotype", Palatino, serif' },
  { value: "slab", labelKey: "fontSlab", stack: 'Rockwell, "Roboto Slab", serif' },
];

type SectionId = "general" | "appearance" | "editor" | "fileTree" | "update" | "about";

/** Auto-save delay formatter (0 = off, sub-second in ms, otherwise seconds). */
function formatAutoSaveDelay(value: number): string {
  if (value === 0) return "Off";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const fontSize = useStore(s => s.fontSize);
  const setFontSize = useStore(s => s.setFontSize);
  const tabSize = useStore(s => s.tabSize);
  const setTabSize = useStore(s => s.setTabSize);
  const editorPadding = useStore(s => s.editorPadding);
  const setEditorPadding = useStore(s => s.setEditorPadding);
  const autoSaveDelay = useStore(s => s.autoSaveDelay);
  const setAutoSaveDelay = useStore(s => s.setAutoSaveDelay);
  const showHiddenFiles = useStore(s => s.showHiddenFiles);
  const setShowHiddenFiles = useStore(s => s.setShowHiddenFiles);
  const showFileExtensions = useStore(s => s.showFileExtensions);
  const setShowFileExtensions = useStore(s => s.setShowFileExtensions);
  const defaultSourceMode = useStore(s => s.defaultSourceMode);
  const setDefaultSourceMode = useStore(s => s.setDefaultSourceMode);
  const mode = useStore(s => s.mode);
  const setMode = useStore(s => s.setMode);
  const fontFamily = useStore(s => s.fontFamily);
  const setFontFamily = useStore(s => s.setFontFamily);
  const locale = useStore(s => s.locale);
  const storeSetLocale = useStore(s => s.setLocale);
  const autoCheckUpdate = useStore(s => s.autoCheckUpdate);
  const setAutoCheckUpdate = useStore(s => s.setAutoCheckUpdate);
  const updateCheckInterval = useStore(s => s.updateCheckInterval);
  const setUpdateCheckInterval = useStore(s => s.setUpdateCheckInterval);
  const updateState = useStore(s => s.updateState);
  const updateVersion = useStore(s => s.updateVersion);
  const updateError = useStore(s => s.updateError);
  const updateProgress = useStore(s => s.updateProgress);

  // Modal owns Escape + backdrop dismissal; the pane is the only local state.
  const [section, setSection] = useState<SectionId>("general");

  const settings = t().settings;
  const fontLabels = settings as Record<string, string>;
  const selectedFont = FONT_OPTIONS.find(f => f.value === fontFamily) ?? FONT_OPTIONS[0];

  const navItems: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
    { id: "general", label: settings.general, icon: <SettingsIcon size={15} /> },
    { id: "appearance", label: settings.appearance, icon: <PaletteIcon size={15} /> },
    { id: "editor", label: settings.editorLabel, icon: <TypeIcon size={15} /> },
    { id: "fileTree", label: settings.fileTree, icon: <FolderIcon size={15} /> },
    { id: "update", label: settings.update, icon: <RefreshIcon size={15} /> },
    { id: "about", label: settings.about, icon: <InfoIcon size={15} /> },
  ];

  const modeOptions: Array<SegmentedOption<ThemeMode>> = [
    { value: "light", label: t().statusbar.light, icon: <SunIcon size={15} /> },
    { value: "dark", label: t().statusbar.dark, icon: <MoonIcon size={15} /> },
    { value: "system", label: t().statusbar.system, icon: <MonitorIcon size={15} /> },
  ];

  const languageOptions: Array<SegmentedOption<string>> = [
    { value: "zh-CN", label: "中文" },
    { value: "en-US", label: "English" },
  ];

  const updateBusy =
    updateState === "checking" || updateState === "downloading" || updateState === "installing";

  const updateLabel =
    updateState === "checking" ? settings.checking
      : updateState === "downloading"
        ? settings.downloading + (updateProgress != null ? " " + updateProgress + "%" : "")
        : updateState === "ready" ? settings.updateReady.replace("{v}", updateVersion || "")
          : updateState === "installing" ? settings.installing
            : updateState === "error" ? settings.retry
              : updateState === "uptodate" ? settings.uptodate
                : settings.checkNow;

  return (
    <Modal
      title={settings.title}
      onClose={onClose}
      size="lg"
      className="zn-settings"
      bodyClassName="zn-settings__body"
      closeLabel={t().titlebar.close}
    >
      <nav className="zn-settings__nav" aria-label={settings.title}>
        {navItems.map(item => (
          <button
            key={item.id}
            type="button"
            className="zn-settings__nav-item"
            data-autofocus={item.id === "general" || undefined}
            data-active={section === item.id || undefined}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => setSection(item.id)}
          >
            <span className="zn-settings__nav-icon">{item.icon}</span>
            <span className="zn-settings__nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="zn-settings__content">
        {section === "general" && (
          <div className="zn-settings__pane">
            <FormSection title={settings.general}>
              <Field label={settings.language}>
                <Segmented<string>
                  value={locale}
                  options={languageOptions}
                  onChange={(value) => { storeSetLocale(value); setLocale(value); }}
                  ariaLabel={settings.language}
                />
              </Field>
              <SliderField
                label={settings.autoSaveDelay}
                value={autoSaveDelay}
                min={0}
                max={10000}
                step={500}
                onChange={setAutoSaveDelay}
                format={formatAutoSaveDelay}
              />
            </FormSection>
          </div>
        )}

        {section === "appearance" && (
          <div className="zn-settings__pane">
            <FormSection title={settings.appearance}>
              <Field label={settings.theme}>
                <Segmented<ThemeMode>
                  value={mode}
                  options={modeOptions}
                  onChange={setMode}
                  ariaLabel={settings.theme}
                />
              </Field>
              <Field label={settings.fontFamily}>
                <select
                  className="zn-select zn-settings__select"
                  value={fontFamily}
                  title={settings.fontFamily}
                  aria-label={settings.fontFamily}
                  onChange={(event) => setFontFamily(event.target.value)}
                >
                  {FONT_OPTIONS.map(font => (
                    <option key={font.value} value={font.value}>{fontLabels[font.labelKey]}</option>
                  ))}
                </select>
              </Field>
              <SliderField
                label={settings.fontSize}
                value={fontSize}
                min={12}
                max={24}
                step={1}
                onChange={setFontSize}
                format={(value) => `${value}px`}
              />
            </FormSection>
            <div
              className="zn-settings__font-preview"
              style={{ fontFamily: selectedFont.stack }}
              title={fontLabels[selectedFont.labelKey]}
            >
              <span className="zn-settings__font-sample">{t().welcome.subtitle}</span>
              <span className="zn-settings__font-name">{fontLabels[selectedFont.labelKey]}</span>
            </div>
          </div>
        )}

        {section === "editor" && (
          <div className="zn-settings__pane">
            <FormSection title={settings.editorLabel}>
              <SliderField
                label={settings.tabSize}
                value={tabSize}
                min={2}
                max={8}
                step={2}
                onChange={setTabSize}
                format={(value) => `${value}`}
              />
              <SliderField
                label={settings.editorPadding}
                value={editorPadding}
                min={0}
                max={500}
                step={4}
                onChange={setEditorPadding}
                format={(value) => `${value}px`}
              />
              <Field label={settings.defaultSourceMode}>
                <Switch
                  checked={defaultSourceMode}
                  onChange={setDefaultSourceMode}
                  label={settings.defaultSourceMode}
                />
              </Field>
            </FormSection>
          </div>
        )}

        {section === "fileTree" && (
          <div className="zn-settings__pane">
            <FormSection title={settings.fileTree}>
              <Field label={settings.showHiddenFiles}>
                <Switch
                  checked={showHiddenFiles}
                  onChange={setShowHiddenFiles}
                  label={settings.showHiddenFiles}
                />
              </Field>
              <Field label={settings.showFileExtensions}>
                <Switch
                  checked={showFileExtensions}
                  onChange={setShowFileExtensions}
                  label={settings.showFileExtensions}
                />
              </Field>
            </FormSection>
          </div>
        )}

        {section === "update" && (
          <div className="zn-settings__pane">
            <FormSection title={settings.update}>
              <Field label={settings.autoCheckUpdate}>
                <Switch
                  checked={autoCheckUpdate}
                  onChange={setAutoCheckUpdate}
                  label={settings.autoCheckUpdate}
                />
              </Field>
              <Field label={settings.updateInterval}>
                <select
                  className="zn-select zn-settings__select zn-settings__select--short"
                  value={updateCheckInterval}
                  disabled={!autoCheckUpdate}
                  title={settings.updateInterval}
                  aria-label={settings.updateInterval}
                  onChange={(event) => setUpdateCheckInterval(Number(event.target.value))}
                >
                  <option value={30}>{settings.interval30m}</option>
                  <option value={60}>{settings.interval1h}</option>
                  <option value={360}>{settings.interval6h}</option>
                  <option value={1440}>{settings.interval24h}</option>
                </select>
              </Field>
              <Field label={settings.checkNow}>
                <Button
                  variant={updateState === "ready" ? "primary" : "secondary"}
                  size="sm"
                  className="zn-settings__update-btn"
                  disabled={updateBusy}
                  title={updateLabel}
                  onClick={() => {
                    // ready 状态点击 = 安装；其余状态点击 = （重新）检查。
                    if (updateState === "ready") void installUpdate();
                    else void checkAndDownloadUpdate(true);
                  }}
                >
                  {updateBusy ? <Spinner size={12} /> : null}
                  <span className="zn-settings__update-label">{updateLabel}</span>
                </Button>
              </Field>
            </FormSection>
            {updateError ? (
              <div className="zn-settings__error" role="alert" title={updateError}>
                {settings.updateFailed}: {updateError}
              </div>
            ) : null}
          </div>
        )}

        {section === "about" && (
          <div className="zn-settings__pane zn-settings__pane--about">
            <div className="zn-settings__about-head">
              <AppMark size={38} />
              <div className="zn-settings__about-wordmark">
                <div className="zn-settings__about-title">{t().app.title}</div>
                <div className="zn-settings__about-subtitle">{t().welcome.subtitle}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
