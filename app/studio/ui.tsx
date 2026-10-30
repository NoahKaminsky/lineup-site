"use client";

// LineUp Studio's small kit of controls, so every button, field and panel on
// /studio looks and behaves the same. Monochrome like the rest of LineUp; the
// one colour (signal red) is reserved for "now" and things that need action.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, X } from "lucide-react";

export const SIGNAL = "#C8102E";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.2)] hover:bg-neutral-800",
  secondary: "bg-surface text-ink shadow-[inset_0_0_0_1px_rgba(10,10,10,0.14)] hover:bg-neutral-50 hover:shadow-[inset_0_0_0_1px_rgba(10,10,10,0.28)]",
  ghost: "text-neutral-600 hover:bg-ink/[0.05] hover:text-ink",
  danger: "text-red-700 hover:bg-red-50",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-5 text-sm",
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
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

// A row of mutually exclusive choices (a radio group drawn as a pill track).
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-ink/[0.06] p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-full font-medium transition-[background-color,color,box-shadow] duration-150 ${
              size === "sm" ? "h-7 px-3 text-[13px]" : "h-8 px-4 text-sm"
            } ${on ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-neutral-500 hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-[13px] leading-5 text-neutral-500">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-ink" : "bg-ink/15"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
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
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
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
  "rounded-2xl bg-surface shadow-[0_0_0_1px_rgba(10,10,10,0.07),0_1px_2px_rgba(0,0,0,0.04)]";

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${panelClass} px-6 py-10 text-center`}>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-neutral-500">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// Overflow menu for secondary actions on a row.
export function Menu({
  label,
  items,
}: {
  label: string;
  items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-ink/[0.06] hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="lu-pop-in absolute right-0 top-9 z-30 min-w-[11rem] rounded-xl bg-surface p-1 shadow-[0_0_0_1px_rgba(10,10,10,0.08),0_12px_32px_-12px_rgba(0,0,0,0.3)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
                item.danger ? "text-red-700 hover:bg-red-50" : "text-ink hover:bg-ink/[0.05]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// A panel that slides in from the right on wide screens and up from the
// bottom on phones. Focus moves into it; Escape or the backdrop closes it.
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        "input, select, textarea, button:not([data-sheet-close]), a[href]"
      );
      (first || panelRef.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Portalled to <body> so it sits above the app header and bottom bar no
  // matter which animated (stacking-context) parent opened it.
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="lu-fade-in absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="studio-sheet absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-[22px] bg-surface shadow-[0_-12px_48px_-12px_rgba(0,0,0,0.35)] outline-none sm:inset-y-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-[440px] sm:rounded-[22px]"
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.02em] text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm leading-6 text-neutral-500">{description}</p> : null}
          </div>
          <button
            type="button"
            data-sheet-close
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

// Toast-style message pinned to the bottom of the screen.
export function Notice({
  notice,
  onDismiss,
}: {
  notice: { tone: "error" | "success"; text: string } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const t = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(t);
  }, [notice, onDismiss]);

  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
      <div
        role={notice.tone === "error" ? "alert" : "status"}
        className={`lu-pop-in pointer-events-auto flex max-w-lg items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45)] ${
          notice.tone === "error" ? "bg-[#A30D25] text-white" : "bg-ink text-white"
        }`}
      >
        <p className="leading-6">{notice.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
