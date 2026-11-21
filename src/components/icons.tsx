// Небольшие иконки в виде SVG — без сторонних библиотек.
type Props = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export function WifiIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M2 8.8a15 15 0 0 1 20 0" />
      <path d="M5 12.4a10 10 0 0 1 14 0" />
      <path d="M8.5 15.9a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function WifiOffIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M2 2l20 20" />
      <path d="M8.5 15.9a5 5 0 0 1 7 0" />
      <path d="M5 12.4a10 10 0 0 1 4.2-2.6" />
      <path d="M2 8.8a15 15 0 0 1 4.3-2.9" />
      <path d="M10.7 5.1A15 15 0 0 1 22 8.8" />
      <path d="M16.9 10.5A10 10 0 0 1 19 12.4" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function LeaveIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
      <path d="M10 16l-4-4 4-4" />
      <path d="M6 12h10" />
    </svg>
  );
}

export function CheckIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ClockIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function DownloadIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function TrashIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function PlusIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function UsersIcon({ className = "size-5" }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18.5 14.8c1.6.8 2.6 2.5 3 5.2" />
    </svg>
  );
}
