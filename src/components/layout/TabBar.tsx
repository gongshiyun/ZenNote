import { useState } from "react";
import { useStore } from "../../store";
import { noteName } from "../../domain";
import { t } from "../../i18n";
import { openDocumentWithSave } from "../../lib/openDocument";
import { ContextMenu, MenuItem, MenuSeparator } from "../ui";
import { CloseIcon } from "../ui/icons";

// Claude-style tab strip: pill tabs, one per open note, clay dirty dot that
// becomes a × on hover, click to switch, middle-click or × to close (dirty tabs
// ask for confirmation first), RIGHT-CLICK for a context menu.

interface TabMenuState {
  path: string;
  x: number;
  y: number;
}

export function TabBar() {
  const openTabs = useStore(s => s.openTabs);
  const currentFilePath = useStore(s => s.currentFilePath);
  const isDirty = useStore(s => s.isDirty);
  const fileStates = useStore(s => s.fileStates);
  const closeTab = useStore(s => s.closeTab);
  const closeOtherTabs = useStore(s => s.closeOtherTabs);
  const closeTabsToLeft = useStore(s => s.closeTabsToLeft);
  const closeTabsToRight = useStore(s => s.closeTabsToRight);
  const closeAllTabs = useStore(s => s.closeAllTabs);
  const [menu, setMenu] = useState<TabMenuState | null>(null);

  if (!openTabs.length) return null;

  const dirtyOf = (path: string): boolean => {
    if (path === currentFilePath) return isDirty;
    return !!fileStates.get(path)?.dirty;
  };

  const requestClose = (path: string) => {
    if (dirtyOf(path) && !confirm(t().tabs.unsavedClose)) return;
    closeTab(path);
  };

  // Bulk close: one confirmation when ANY of the affected tabs is dirty.
  const requestBulkClose = (paths: string[], action: () => void) => {
    if (paths.length === 0) return;
    const hasDirty = paths.some(p => dirtyOf(p));
    if (hasDirty && !confirm(t().tabs.unsavedCloseMultiple)) return;
    action();
  };

  const menuActions = menu ? {
    close: () => requestClose(menu.path),
    closeOthers: () => requestBulkClose(openTabs.filter(p => p !== menu.path), () => closeOtherTabs(menu.path)),
    closeLeft: () => requestBulkClose(openTabs.slice(0, openTabs.indexOf(menu.path)), () => closeTabsToLeft(menu.path)),
    closeRight: () => requestBulkClose(openTabs.slice(openTabs.indexOf(menu.path) + 1), () => closeTabsToRight(menu.path)),
    closeAll: () => requestBulkClose(openTabs, () => closeAllTabs()),
    copyPath: () => {
      navigator.clipboard.writeText(menu.path)
        .catch((err) => { console.warn("tab-path-copy-failed", err); });
    },
  } : null;

  /** Run a context-menu action and dismiss the menu (matches the old local menu). */
  const run = (action: () => void) => {
    action();
    setMenu(null);
  };

  const menuIndex = menu ? openTabs.indexOf(menu.path) : -1;
  const tc = t().tabs;

  return (
    <>
      <div className="zn-tabbar" role="tablist">
        {openTabs.map(path => {
          const active = path === currentFilePath;
          const dirty = dirtyOf(path);
          return (
            <div
              key={path}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className="zn-tab"
              data-active={active || undefined}
              data-dirty={dirty || undefined}
              title={path}
              onClick={() => { void openDocumentWithSave(path); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                void openDocumentWithSave(path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ path, x: e.clientX, y: e.clientY });
              }}
              onAuxClick={(e) => {
                // Middle-click closes the tab.
                if (e.button === 1) {
                  e.preventDefault();
                  requestClose(path);
                }
              }}
            >
              <span className="zn-tab__name">{noteName(path)}</span>
              <button
                type="button"
                className="zn-tab__close"
                title={tc.closeTab}
                aria-label={tc.closeTab}
                onClick={(e) => {
                  e.stopPropagation();
                  requestClose(path);
                }}
              >
                <CloseIcon className="zn-tab__x" size={12} />
              </button>
              {/* Sibling (not a child) of the close button: the button fades in
                  on hover, so a nested dot would inherit its opacity. */}
              <span className="zn-tab__dot" aria-hidden="true" />
            </div>
          );
        })}
      </div>
      {menu && menuActions && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} label={tc.closeTab}>
          <MenuItem label={tc.closeTab} onSelect={() => run(menuActions.close)} />
          <MenuItem label={tc.closeOthers} disabled={openTabs.length <= 1} onSelect={() => run(menuActions.closeOthers)} />
          <MenuItem label={tc.closeToLeft} disabled={menuIndex <= 0} onSelect={() => run(menuActions.closeLeft)} />
          <MenuItem label={tc.closeToRight} disabled={menuIndex < 0 || menuIndex >= openTabs.length - 1} onSelect={() => run(menuActions.closeRight)} />
          <MenuItem label={tc.closeAll} disabled={openTabs.length <= 1} onSelect={() => run(menuActions.closeAll)} />
          <MenuSeparator />
          <MenuItem label={tc.copyPath} onSelect={() => run(menuActions.copyPath)} />
        </ContextMenu>
      )}
    </>
  );
}
