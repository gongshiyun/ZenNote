import { useEffect, useRef, useCallback } from "react";
import { t } from "../../i18n";

interface Position { x: number; y: number; }

interface Props {
  visible: boolean;
  position: Position;
  onClose: () => void;
  crepeRef: React.MutableRefObject<any>;
}

export function TableContextMenu({ visible, position, onClose, crepeRef }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  const runTableCmd = useCallback(async (cmdName: string) => {
    try {
      const tableMod = await import("@milkdown/kit/prose/tables");
      const map: Record<string, any> = {
        "addRowBefore": tableMod.addRowBefore,
        "addRowAfter": tableMod.addRowAfter,
        "deleteRow": tableMod.deleteRow,
        "addColumnBefore": tableMod.addColumnBefore,
        "addColumnAfter": tableMod.addColumnAfter,
        "deleteColumn": tableMod.deleteColumn,
        "mergeCells": tableMod.mergeCells,
        "splitCell": tableMod.splitCell,
        "toggleHeaderRow": tableMod.toggleHeaderRow,
        "toggleHeaderColumn": tableMod.toggleHeaderColumn,
        "deleteTable": tableMod.deleteTable,
      };
      const cmd = map[cmdName];
      if (cmd && crepeRef.current?.editor?.action) {
        crepeRef.current.editor.action(cmd);
      }
    } catch (err) {
      console.error("Table command failed:", err);
    }
    onClose();
  }, [crepeRef, onClose]);

  if (!visible) return null;

  const items = [
    { label: t().table.insertRowAbove, cmd: "addRowBefore" },
    { label: t().table.insertRowBelow, cmd: "addRowAfter" },
    { label: t().table.deleteRow, cmd: "deleteRow", danger: true },
    { type: "divider" as const },
    { label: t().table.insertColLeft, cmd: "addColumnBefore" },
    { label: t().table.insertColRight, cmd: "addColumnAfter" },
    { label: t().table.deleteCol, cmd: "deleteColumn", danger: true },
    { type: "divider" as const },
    { label: t().table.mergeCells, cmd: "mergeCells" },
    { label: t().table.splitCell, cmd: "splitCell" },
    { type: "divider" as const },
    { label: t().table.toggleHeaderRow, cmd: "toggleHeaderRow" },
    { label: t().table.toggleHeaderColumn, cmd: "toggleHeaderColumn" },
    { type: "divider" as const },
    { label: t().table.deleteTable, cmd: "deleteTable", danger: true },
  ];

  const adjustedX = Math.min(position.x, window.innerWidth - 180);
  const adjustedY = Math.min(position.y, window.innerHeight - 480);

  return (
    <div ref={menuRef} style={{
      position: "fixed", left: adjustedX, top: adjustedY, zIndex: 1000,
      background: "var(--bg-toolbar)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "4px 0", minWidth: 170,
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)", fontSize: 13,
    }}>
      {items.map((item, i) => {
        if ("type" in item && item.type === "divider") {
          return <div key={i} style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />;
        }
        const menuItem = item as { label: string; cmd: string; danger?: boolean };
        return (
          <div key={i} onClick={() => runTableCmd(menuItem.cmd)} style={{
            padding: "6px 14px", cursor: "pointer",
            color: menuItem.danger ? "#E81123" : "var(--text-primary)",
            background: "transparent",
            display: "flex", alignItems: "center", gap: 8,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            {menuItem.label}
          </div>
        );
      })}
    </div>
  );
}