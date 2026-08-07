import { useEffect, useRef, useCallback } from "react";
import { t } from "../../i18n";
import {
  executeTableCommand,
  selectTableArea,
  type TableCommandName,
  type TableSelectArea,
  type SavedCellSelection,
} from "./tableCommands";

interface Position { x: number; y: number; }

interface Props {
  visible: boolean;
  position: Position;
  onClose: () => void;
  crepeRef: React.MutableRefObject<any>;
  /**
   * The multi-cell selection that was active when the menu opened. Re-applied
   * before every command so row/column actions still target the chosen cells
   * even if the selection was collapsed in the meantime.
   */
  savedSelection?: SavedCellSelection | null;
}

export function TableContextMenu({ visible, position, onClose, crepeRef, savedSelection }: Props) {
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

  const runTableCmd = useCallback(async (cmdName: TableCommandName) => {
    try {
      // Runs the prosemirror-tables command against the live EditorView (see
      // tableCommands.ts — passing the command directly to editor.action is a
      // no-op because PM commands expect (state, dispatch, view), not the ctx).
      // `savedSelection` re-applies the selection captured at menu open, so the
      // command acts on the cells the user actually chose.
      await executeTableCommand(crepeRef.current, cmdName, savedSelection);
    } catch (err) {
      console.error("Table command failed:", err);
    }
    onClose();
  }, [crepeRef, onClose, savedSelection]);

  // Explicit row/column/table selection. Right-clicking a cell normally
  // replaces the selection with a plain text cursor, so the menu offers these
  // selection actions before the row/column commands.
  const runSelect = useCallback(async (area: TableSelectArea) => {
    try {
      await selectTableArea(crepeRef.current, area, savedSelection);
    } catch (err) {
      console.error("Table select failed:", err);
    }
    onClose();
  }, [crepeRef, onClose, savedSelection]);

  if (!visible) return null;

  const tc = t().table;
  const items: Array<{ type: "divider" } | { label: string; danger?: boolean; run: () => void }> = [
    { label: tc.insertRowAbove, run: () => void runTableCmd("addRowBefore") },
    { label: tc.insertRowBelow, run: () => void runTableCmd("addRowAfter") },
    { label: tc.deleteRow, run: () => void runTableCmd("deleteRow"), danger: true },
    { type: "divider" },
    { label: tc.insertColLeft, run: () => void runTableCmd("addColumnBefore") },
    { label: tc.insertColRight, run: () => void runTableCmd("addColumnAfter") },
    { label: tc.deleteCol, run: () => void runTableCmd("deleteColumn"), danger: true },
    { type: "divider" },
    { label: tc.selectRow, run: () => void runSelect("row") },
    { label: tc.selectCol, run: () => void runSelect("col") },
    { label: tc.selectTable, run: () => void runSelect("table") },
    { type: "divider" },
    { label: tc.deleteTable, run: () => void runTableCmd("deleteTable"), danger: true },
  ];

  const adjustedX = Math.min(position.x, window.innerWidth - 200);
  const adjustedY = Math.min(position.y, window.innerHeight - items.length * 30 - 24);

  return (
    <div ref={menuRef} style={{
      position: "fixed", left: adjustedX, top: adjustedY, zIndex: 1000,
      background: "var(--bg-toolbar)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "4px 0", minWidth: 180,
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)", fontSize: 13,
    }}>
      {items.map((item, i) => {
        if ("type" in item) {
          return <div key={i} style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />;
        }
        return (
          <div key={i} onClick={item.run} style={{
            padding: "6px 14px", cursor: "pointer",
            color: item.danger ? "#E81123" : "var(--text-primary)",
            background: "transparent",
            display: "flex", alignItems: "center", gap: 8,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
