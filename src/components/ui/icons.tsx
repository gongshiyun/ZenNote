/**
 * Coherent line-icon set for the whole app (Claude Code desktop language).
 *
 * Rules: 24×24 viewBox, 1.5px stroke, currentColor, round caps/joins, no fills.
 * Never hand-roll a one-off <svg> in a component — add the icon here instead.
 */
import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Rendered box in px. Default 18 (chrome); 15-16 for inline. */
  size?: number;
}

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Product mark: an eight-spoke spark, the single clay note in the chrome. */
export function ZenMark({ size = 18, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <g strokeWidth={2.1}>
        <path d="M12 2.6v5.1" />
        <path d="M12 16.3v5.1" />
        <path d="M2.6 12h5.1" />
        <path d="M16.3 12h5.1" />
        <path d="M5.35 5.35l3.6 3.6" />
        <path d="M15.05 15.05l3.6 3.6" />
        <path d="M18.65 5.35l-3.6 3.6" />
        <path d="M8.95 15.05l-3.6 3.6" />
      </g>
    </Svg>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3.5" width="18" height="17" rx="3" />
      <path d="M9.5 3.5v17" />
    </Svg>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3.5" width="18" height="17" rx="3" />
      <path d="M14.5 3.5v17" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.2 4.2" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.22 3h-.44a1.9 1.9 0 0 0-1.9 1.9v.2a1.9 1.9 0 0 1-.95 1.64l-.2.11a1.9 1.9 0 0 1-1.9 0l-.17-.1a1.9 1.9 0 0 0-2.6.7l-.2.36a1.9 1.9 0 0 0 .7 2.6l.17.1a1.9 1.9 0 0 1 .95 1.64v.22a1.9 1.9 0 0 1-.95 1.65l-.17.1a1.9 1.9 0 0 0-.7 2.6l.2.36a1.9 1.9 0 0 0 2.6.7l.17-.1a1.9 1.9 0 0 1 1.9 0l.2.11a1.9 1.9 0 0 1 .95 1.64v.2a1.9 1.9 0 0 0 1.9 1.9h.44a1.9 1.9 0 0 0 1.9-1.9v-.2a1.9 1.9 0 0 1 .95-1.64l.2-.11a1.9 1.9 0 0 1 1.9 0l.17.1a1.9 1.9 0 0 0 2.6-.7l.2-.36a1.9 1.9 0 0 0-.7-2.6l-.17-.1a1.9 1.9 0 0 1-.95-1.65v-.22a1.9 1.9 0 0 1 .95-1.64l.17-.1a1.9 1.9 0 0 0 .7-2.6l-.2-.36a1.9 1.9 0 0 0-2.6-.7l-.17.1a1.9 1.9 0 0 1-1.9 0l-.2-.11a1.9 1.9 0 0 1-.95-1.64v-.2A1.9 1.9 0 0 0 12.22 3z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15V3" />
      <path d="M7.5 7.5L12 3l4.5 4.5" />
      <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" />
    </Svg>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </Svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </Svg>
  );
}

export function RestoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="8" width="12" height="12" rx="1.5" />
      <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
    </Svg>
  );
}

export function FolderOpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 10.7v1.3" />
      <path d="M3 9.5h18l-2.2 9a1.5 1.5 0 0 1-1.5 1.2H5.2A1.5 1.5 0 0 1 3.7 18z" />
    </Svg>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6M9 9h2" />
    </Svg>
  );
}

export function FilePlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 12v6M9 15h6" />
    </Svg>
  );
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
      <path d="M12 11.5v5M9.5 14h5" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11.5A8 8 0 0 0 6.2 6.2L3 9" />
      <path d="M3 4.5V9h4.5" />
      <path d="M4 12.5A8 8 0 0 0 17.8 17.8L21 15" />
      <path d="M21 19.5V15h-4.5" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L17 5a2.1 2.1 0 0 0-3 0L3.5 15.5z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  );
}

export function MoreHorizontalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1" fill="currentColor" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H7" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9.5l6 6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 6l6 6-6 6" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 6l-6 6 6 6" />
    </Svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  );
}

export function CornerDownLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 5v7a3 3 0 0 1-3 3H6" />
      <path d="M10 11l-4 4 4 4" />
    </Svg>
  );
}

export function BoldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 5h6a4 4 0 0 1 0 8H7z" />
      <path d="M7 13h7a4 4 0 0 1 0 8H7z" />
    </Svg>
  );
}

export function ItalicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 5h9M5 20h9M14 5l-4 15" />
    </Svg>
  );
}

export function StrikethroughIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h16" />
      <path d="M7 8.5V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3" />
      <path d="M17 15a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3" />
    </Svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11.5 6.8" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 1 0 5.7 5.7l1.3-1.3" />
    </Svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
    </Svg>
  );
}

export function QuoteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 7H5.5A1.5 1.5 0 0 0 4 8.5V12a1.5 1.5 0 0 0 1.5 1.5H8V17H5" />
      <path d="M19 7h-3.5A1.5 1.5 0 0 0 14 8.5V12a1.5 1.5 0 0 0 1.5 1.5H18V17h-3" />
    </Svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </Svg>
  );
}

export function HashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 9h14M5 15h14M10.5 4l-2 16M17 4l-2 16" />
    </Svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15.5l-4.6-4.6a1.5 1.5 0 0 0-2.1 0L5 20" />
    </Svg>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18M3 14.5h18M9.5 9.5v10M15 9.5v10" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18.5 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5H10" />
    </Svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 4.3a2 2 0 0 1 3.4 0l7 12a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z" />
      <path d="M12 9v4.5M12 17h.01" strokeWidth={1.8} />
    </Svg>
  );
}

export function CircleCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </Svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9h9a6 6 0 0 1 0 12H8" />
      <path d="M7.5 5.5L4 9l3.5 3.5" />
    </Svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </Svg>
  );
}

export function TypeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6V4h16v2M12 4v16M8.5 20h7" />
    </Svg>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-1.9 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.4 0-1 .8-1.8 1.8-1.8h1.9A4.5 4.5 0 0 0 21 10c0-3.9-4-7-9-7z" />
      <circle cx="7.5" cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="6.8" r="1" fill="currentColor" />
      <circle cx="14" cy="6.8" r="1" fill="currentColor" />
      <circle cx="16.8" cy="9.8" r="1" fill="currentColor" />
    </Svg>
  );
}

export function LanguagesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h9M7.5 4v2M9.5 6c0 4-2.5 7.5-6 9" />
      <path d="M5 10c.8 2.4 2.6 4.3 5 5" />
      <path d="M13 20l4-10 4 10M14.5 16.5h5" />
    </Svg>
  );
}

export function GripVerticalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8h.01" strokeWidth={1.8} />
    </Svg>
  );
}

/** App logo mark used by the titlebar, welcome screen and empty states. */
export function AppMark({
  size = 20,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={["zn-appmark", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      title={title}
    >
      <ZenMark size={size} />
    </span>
  );
}
