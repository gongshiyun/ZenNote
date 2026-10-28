/**
 * Form controls shared by the settings dialog and panels.
 * Class contract: docs/DESIGN-CLAUDE-CODE.md §5.8, §5.9.
 */
import type { ReactNode } from "react";
import { cn } from "./cn";

/* ========================================================================== */
/* Segmented control                                                          */
/* ========================================================================== */
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("zn-segmented", className)} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="zn-segmented__item"
          data-active={value === option.value || undefined}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ========================================================================== */
/* Switch                                                                     */
/* ========================================================================== */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className="zn-switch"
      data-checked={checked || undefined}
      onClick={() => onChange(!checked)}
    />
  );
}

/* ========================================================================== */
/* Field rows                                                                 */
/* ========================================================================== */
export function Field({
  label,
  children,
  description,
  htmlFor,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("zn-field", className)}>
      <label className="zn-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="zn-field__control">{children}</div>
      {description ? <div className="zn-field__hint">{description}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("zn-section-title", className)}>{children}</div>;
}

export function FormSection({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("zn-form-section", className)}>
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      {children}
    </section>
  );
}

/* ========================================================================== */
/* Slider field                                                               */
/* ========================================================================== */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <Field label={label}>
      <div className="zn-slider-row">
        <input
          type="range"
          className="zn-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={typeof label === "string" ? label : undefined}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="zn-slider-value">{format ? format(value) : value}</span>
      </div>
    </Field>
  );
}

/* ========================================================================== */
/* Small display helpers                                                      */
/* ========================================================================== */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="zn-kbd">{children}</kbd>;
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("zn-spinner", className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="loading"
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="zn-empty">
      {icon ? <div className="zn-empty__icon">{icon}</div> : null}
      {title ? <div className="zn-empty__title">{title}</div> : null}
      {description ? <div className="zn-empty__description">{description}</div> : null}
      {children}
    </div>
  );
}
