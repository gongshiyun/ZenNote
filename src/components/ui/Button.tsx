/**
 * Shared button primitives. Class contract: docs/DESIGN-CLAUDE-CODE.md §5.1.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  iconLeft,
  iconRight,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "zn-btn",
    `zn-btn--${variant}`,
    size === "sm" ? "zn-btn--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Tooltip + accessible name. Required: icon-only buttons are unlabelled otherwise. */
  label: string;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function IconButton({
  label,
  active = false,
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  const classes = [
    "zn-icon-btn",
    size === "sm" ? "zn-icon-btn--sm" : size === "lg" ? "zn-icon-btn--lg" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      title={label}
      aria-label={label}
      data-active={active || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
