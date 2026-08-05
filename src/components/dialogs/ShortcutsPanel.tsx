import { useEffect } from "react";
import { t } from "../../i18n";

/**
 * Keyboard shortcuts reference panel (PRD §3.13).
 * Opened with F1, closed with Esc or a click on the backdrop.
 */

interface ShortcutEntry { label: string; keys: string; }

export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sc = t().shortcuts;
  const groups: Array<{ title: string; items: ShortcutEntry[] }> = [
    {
      title: sc.groupFile,
      items: [
        { label: sc.newNote, keys: "Ctrl+N" },
        { label: sc.openFile, keys: "Ctrl+O" },
        { label: sc.openFolder, keys: "Ctrl+Shift+O" },
        { label: sc.save, keys: "Ctrl+S" },
        { label: sc.closeTab, keys: "Ctrl+W" },
        { label: sc.switchTab, keys: "Ctrl+Tab" },
      ],
    },
    {
      title: sc.groupEdit,
      items: [
        { label: sc.find, keys: "Ctrl+F" },
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
      title: sc.groupFormat,
      items: [
        { label: sc.exportHtml, keys: "Ctrl+Shift+E" },
        { label: sc.exportPdf, keys: "Ctrl+Shift+P" },
        { label: sc.settings, keys: "Ctrl+," },
      ],
    },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 950,
      display: "flex", justifyContent: "center", paddingTop: "10vh",
      background: "rgba(0,0,0,0.3)",
    }} onClick={onClose}>
      <div style={{
        width: 620, maxHeight: "74vh", background: "var(--bg-toolbar)",
        borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        border: "1px solid var(--border)", overflow: "auto", padding: "16px 20px",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
          {sc.title}
        </div>
        {groups.map(g => (
          <div key={g.title} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {g.title}
            </div>
            {g.items.map(item => (
              <div key={item.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "5px 4px", fontSize: 13, color: "var(--text-primary)",
                borderBottom: "1px solid var(--border-light)",
              }}>
                <span>{item.label}</span>
                <kbd style={{
                  fontFamily: "Consolas, monospace", fontSize: 12, color: "var(--text-secondary)",
                  background: "var(--bg-editor)", border: "1px solid var(--border)",
                  borderRadius: 4, padding: "1px 8px",
                }}>{item.keys}</kbd>
              </div>
            ))}
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>{sc.closeHint}</div>
      </div>
    </div>
  );
}
