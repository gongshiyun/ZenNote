/**
 * Menu primitives — dropdowns, context menus, and the panel menus built on top.
 * Class contract: docs/DESIGN-CLAUDE-CODE.md §5.7.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "./cn";

/** Dismiss a floating surface on outside pointer-down, Escape, or window blur. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    // Registered on the next tick so the click that opened the menu does not
    // immediately dismiss it.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown, true);
    }, 0);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, onClose, ref]);
}

export interface MenuProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  label?: string;
  /** Optional ref forwarded from the caller (for anchored dropdowns). */
  menuRef?: RefObject<HTMLDivElement | null>;
}

/** Presentational menu surface. Position is the caller's responsibility. */
export function Menu({ children, className, style, label, menuRef }: MenuProps) {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className={cn("zn-menu", className)}
      style={style}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

export interface MenuItemProps {
  label: string;
  onSelect: () => void;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
}

export function MenuItem({
  label,
  onSelect,
  shortcut,
  icon,
  disabled,
  danger,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="zn-menu__item"
      data-danger={danger || undefined}
      data-disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onSelect();
      }}
    >
      {icon ? <span className="zn-menu__item-icon">{icon}</span> : null}
      <span className="zn-menu__item-label">{label}</span>
      {shortcut ? <span className="zn-menu__hint">{shortcut}</span> : null}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="zn-menu__label">{children}</div>;
}

export function MenuSeparator() {
  return <div className="zn-menu__sep" role="separator" />;
}

export interface DropdownMenuProps {
  /** Which edge of the anchored parent the menu aligns to. */
  align?: "left" | "right";
  width?: number;
  onClose: () => void;
  label?: string;
  children: ReactNode;
}

/**
 * Menu anchored under its parent. The parent must establish `position:relative`.
 */
export function DropdownMenu({
  align = "left",
  width,
  onClose,
  label,
  children,
}: DropdownMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  return (
    <Menu
      menuRef={ref}
      label={label}
      className={cn("zn-menu--dropdown")}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        ...(align === "left" ? { left: 0 } : { right: 0 }),
        ...(width ? { width } : {}),
      }}
    >
      {children}
    </Menu>
  );
}

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  label?: string;
  children: ReactNode;
}

/** Viewport-clamped menu at a pointer position. */
export function ContextMenu({ x, y, onClose, label, children }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useDismiss(ref, onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    setPos({
      x: Math.min(Math.max(margin, x), maxX),
      y: Math.min(Math.max(margin, y), maxY),
    });
  }, [x, y]);

  return (
    <Menu
      menuRef={ref}
      label={label}
      className="zn-menu--fixed"
      style={{ left: pos.x, top: pos.y }}
    >
      {children}
    </Menu>
  );
}

/** Convenience hook for anchored dropdown state. */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close, setOpen };
}
