/**
 * Modal primitive — one implementation of the Claude-style dialog: scrim,
 * centred warm panel, serif title, focus handling, Escape and backdrop close.
 * Class contract: docs/DESIGN-CLAUDE-CODE.md §5.8.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";
import { cn } from "./cn";
import { CloseIcon } from "./icons";

export interface ModalProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Use the raised surface (search-style) instead of the canvas surface. */
  raised?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Accessible name when the header is hidden or custom. */
  ariaLabel?: string;
  closeLabel?: string;
  hideClose?: boolean;
  /** Extra controls placed in the header, before the close button. */
  headerExtra?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
  raised = false,
  className,
  bodyClassName,
  ariaLabel,
  closeLabel = "关闭",
  hideClose = false,
  headerExtra,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Escape closes; Tab is trapped inside the panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Move focus into the dialog, then restore it on close.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;
    const preferred =
      panel.querySelector<HTMLElement>("[data-autofocus]") ??
      panel.querySelector<HTMLElement>("input, textarea, select, button");
    (preferred ?? panel).focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, []);

  const heading = title ? (
    <div className="zn-modal__header">
      <div className="zn-modal__heading">
        <h2 className="zn-modal__title">{title}</h2>
        {subtitle ? <div className="zn-modal__subtitle">{subtitle}</div> : null}
      </div>
      {headerExtra}
      {hideClose ? null : (
        <IconButton label={closeLabel} onClick={onClose}>
          <CloseIcon size={17} />
        </IconButton>
      )}
    </div>
  ) : null;

  return (
    <div
      className="zn-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        tabIndex={-1}
        className={cn(
          "zn-modal",
          `zn-modal--${size}`,
          raised && "zn-modal--raised",
          className,
        )}
      >
        {heading}
        <div className={cn("zn-modal__body", bodyClassName)}>{children}</div>
        {footer ? <div className="zn-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
