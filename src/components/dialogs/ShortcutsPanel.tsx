import { Fragment } from "react";
import { t } from "../../i18n";
import { Kbd, Modal } from "../ui";

/**
 * Keyboard shortcuts reference panel (PRD §3.13).
 * Opened with F1, closed with Esc or a click on the backdrop — the Modal
 * primitive owns both dismissals and the focus trap.
 */

interface ShortcutEntry { label: string; keys: string; }
interface ShortcutGroup { title: string; items: ShortcutEntry[]; }

export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const sc = t().shortcuts;
  const groups: ShortcutGroup[] = [
    {
      title: sc.groupFile,
      items: [
        { label: sc.newNote, keys: "Ctrl+N" },
        { label: sc.openFile, keys: "Ctrl+O" },
        { label: sc.openFolder, keys: "Ctrl+Shift+O" },
        { label: sc.quickOpen, keys: "Ctrl+P" },
        { label: sc.save, keys: "Ctrl+S" },
        { label: sc.closeTab, keys: "Ctrl+W" },
        { label: sc.switchTab, keys: "Ctrl+Tab" },
      ],
    },
    {
      title: sc.groupEdit,
      items: [
        { label: sc.find, keys: "Ctrl+F / Ctrl+H" },
        { label: sc.globalSearch, keys: "Ctrl+Shift+F" },
        { label: sc.undo, keys: "Ctrl+Z" },
        { label: sc.redo, keys: "Ctrl+Y" },
      ],
    },
    {
      title: sc.groupView,
      items: [
        { label: sc.sourceMode, keys: "Ctrl+`" },
        { label: sc.sidebar, keys: "Ctrl+B" },
        { label: sc.outline, keys: "Ctrl+Shift+B" },
        { label: sc.darkMode, keys: "Ctrl+Shift+D" },
        { label: sc.help, keys: "F1" },
      ],
    },
    {
      title: sc.groupFormatting,
      items: [
        { label: sc.bold, keys: "Ctrl+B" },
        { label: sc.italic, keys: "Ctrl+I" },
        { label: sc.link, keys: "Ctrl+K" },
        { label: sc.headings, keys: "Ctrl+1…6 / Ctrl+0" },
        { label: sc.strikethrough, keys: "Ctrl+Shift+X" },
        { label: sc.inlineCode, keys: "Ctrl+Shift+C" },
      ],
    },
    {
      title: sc.groupFormat,
      items: [
        { label: sc.exportHtml, keys: "Ctrl+Shift+E" },
        { label: sc.exportPdf, keys: "Ctrl+Shift+P" },
        { label: sc.settings, keys: "Ctrl+," },
      ],
    },
  ];

  return (
    <Modal
      title={sc.title}
      onClose={onClose}
      size="lg"
      className="zn-shortcuts"
      bodyClassName="zn-shortcuts__body"
      closeLabel={t().titlebar.close}
      footer={<div className="zn-shortcuts__hint">{sc.closeHint}</div>}
    >
      <div className="zn-shortcuts__grid">
        {groups.map(group => (
          <section key={group.title} className="zn-shortcuts__group">
            <h3 className="zn-shortcuts__group-title">{group.title}</h3>
            <div className="zn-shortcuts__rows">
              {group.items.map(item => (
                <div key={item.label} className="zn-shortcuts__row">
                  <span className="zn-shortcuts__label" title={item.label}>{item.label}</span>
                  <span className="zn-shortcuts__keys">
                    {item.keys.split(" / ").map((key, index) => (
                      <Fragment key={key}>
                        {index > 0 ? <span className="zn-shortcuts__slash">/</span> : null}
                        <Kbd>{key}</Kbd>
                      </Fragment>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
