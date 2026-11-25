// LineUp's shared kit of controls, so every button, field, card and empty
// state looks and behaves the same across Customer, Pro, Studio and Admin.
// Monochrome; the one colour (signal red) is reserved for "now" and things
// that need action. No hooks here, so server components can use it too.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Photo } from "@/app/components/Photo";

export const SIGNAL = "#C8102E";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,color,box-shadow,transform] duration-(--motion-fast) ease-premium active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.2)] hover:bg-neutral-800",
  secondary: "bg-surface text-ink shadow-[inset_0_0_0_1px_rgba(10,10,10,0.14)] hover:bg-neutral-50 hover:shadow-[inset_0_0_0_1px_rgba(10,10,10,0.28)]",
  ghost: "text-neutral-600 hover:bg-ink/[0.05] hover:text-ink",
  danger: "text-red-700 hover:bg-red-50",
};

const sizes: Record<ButtonSize, string> = {
  // 44px tall on phones (easy to tap); the original sizes from 640px up.
  sm: "h-11 px-3.5 text-[13px] sm:h-8",
  md: "h-11 px-5 text-sm sm:h-10",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} className={buttonClass(variant, size, className)}>
      {loading ? (
        <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

export const fieldClass =
  "h-11 w-full rounded-xl bg-surface px-3.5 text-sm text-ink shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] outline-none transition-shadow placeholder:text-neutral-400 focus:shadow-[inset_0_0_0_1.5px_#0a0a0a]";
export const textareaClass =
  "w-full rounded-xl bg-surface px-3.5 py-3 text-sm leading-6 text-ink shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] outline-none transition-shadow placeholder:text-neutral-400 focus:shadow-[inset_0_0_0_1.5px_#0a0a0a]";

export function Field({
  label,
  hint,
  htmlFor,
  optional,
  className = "",
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-neutral-800">
        {label}
        {optional ? <span className="ml-1 font-normal text-neutral-400">optional</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-5 text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string | null; src?: string | null; size?: number }) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return src ? (
    <Photo src={src} width={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-ink/[0.07] font-semibold text-neutral-600"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

// Small status word. Tone carries meaning: ink = live/positive, muted = info,
// signal = needs attention.
export function Tag({ tone = "muted", children }: { tone?: "ink" | "muted" | "signal" | "outline"; children: ReactNode }) {
  const tones = {
    ink: "bg-ink text-white",
    muted: "bg-ink/[0.06] text-neutral-700",
    signal: "bg-[#C8102E]/[0.08] text-[#A30D25]",
    outline: "text-neutral-600 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.14)]",
  } as const;
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
  );
}

// A titled region of a page: heading + optional description + actions on the
// right, then its content. No box; whitespace does the grouping.
export function Section({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>
          {description ? <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

export const panelClass =
  "rounded-2xl bg-surface ring-1 ring-ink/[0.06]";

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${panelClass} px-6 py-10 text-center`}>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-neutral-500">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// Colours for inline notes and badges. Monochrome; signal red only for things
// that need action (payment due, a problem to fix). Success is ink, not green.
export const TONE = {
  attention: "border border-[#C8102E]/15 bg-[#C8102E]/[0.04] text-[#A30D25]",
  attentionText: "text-[#A30D25]",
  info: "border border-neutral-200 bg-neutral-50 text-neutral-800",
  success: "bg-ink/[0.05] text-ink",
} as const;

// Page titles. Customer pages are larger and airier; Pro, Studio and Admin are
// tool pages; a single booking or request uses the detail size on both sides.
export const TITLE = {
  customer: "text-[2.25rem] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-5xl",
  pro: "text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-ink md:text-4xl",
  detail: "text-[1.9rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-4xl",
} as const;
