import type { ReactNode } from "react";

// Код комнаты из отдельных клавиш: 4 8 2 1
export function Keycaps({ value, className = "" }: { value: string; className?: string }) {
  return (
    <div className={`flex gap-[0.28em] ${className}`} aria-label={`Код ${value}`}>
      {value.split("").map((digit, index) => (
        <span key={index} className="keycap size-[1.5em]">
          {digit}
        </span>
      ))}
    </div>
  );
}

// Логотип: две клавиши «I» и «T»
// compact — на узких телефонах прячем слово, остаются только клавиши «IT»
export function Logo({
  light = false,
  label = "Викторина",
  compact = false,
}: {
  light?: boolean;
  label?: string;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex gap-1 text-[13px]">
        <span className={`keycap size-[1.9em] ${light ? "" : "!bg-cobalt !text-white !shadow-[0_0.15em_0_var(--color-cobalt-edge)]"} -rotate-6`}>
          I
        </span>
        <span className={`keycap size-[1.9em] ${light ? "" : "!bg-cobalt !text-white !shadow-[0_0.15em_0_var(--color-cobalt-edge)]"} rotate-6`}>
          T
        </span>
      </span>
      <span
        className={`font-display text-[15px] font-semibold ${light ? "text-white" : "text-ink"} ${
          compact ? "max-[440px]:hidden" : ""
        }`}
      >
        {label}
      </span>
    </span>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-soft px-3.5 py-2.5 text-[15px] font-medium text-red-edge">
      {children}
    </p>
  );
}

export function FullScreenLoader() {
  return (
    <main className="grid flex-1 place-items-center text-cobalt">
      <Spinner className="size-8" />
    </main>
  );
}
