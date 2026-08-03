import { useStore } from "../../store";
import { noteName } from "../../domain";
import { t } from "../../i18n";

// Typora-style tab bar: one tab per open note, dirty dot, click to switch,
// middle-click or × to close (dirty tabs ask for confirmation first).
export function TabBar() {
  const openTabs = useStore(s => s.openTabs);
  const currentFilePath = useStore(s => s.currentFilePath);
  const isDirty = useStore(s => s.isDirty);
  const fileStates = useStore(s => s.fileStates);
  const switchTab = useStore(s => s.switchTab);
  const closeTab = useStore(s => s.closeTab);

  if (!openTabs.length) return null;

  const dirtyOf = (path: string): boolean => {
    if (path === currentFilePath) return isDirty;
    return !!fileStates.get(path)?.dirty;
  };

  const requestClose = (path: string) => {
    if (dirtyOf(path) && !confirm(t().tabs.unsavedClose)) return;
    closeTab(path);
  };

  return (
    <div className="zn-tabbar">
      {openTabs.map(path => {
        const active = path === currentFilePath;
        const dirty = dirtyOf(path);
        return (
          <div
            key={path}
            className={"zn-tab" + (active ? " zn-tab-active" : "")}
            title={path}
            onClick={() => switchTab(path)}
            onAuxClick={(e) => {
              // Middle-click closes the tab.
              if (e.button === 1) {
                e.preventDefault();
                requestClose(path);
              }
            }}>
            <span className="zn-tab-name">{noteName(path)}</span>
            <span
              className={"zn-tab-close" + (dirty ? " zn-tab-dirty" : "")}
              title={t().tabs.closeTab}
              onClick={(e) => {
                e.stopPropagation();
                requestClose(path);
              }}>
              <span className="zn-tab-dot" />
              <svg className="zn-tab-x" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </span>
          </div>
        );
      })}
    </div>
  );
}
