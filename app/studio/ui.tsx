"use client";

// LineUp Studio's small kit of controls, so every button, field and panel on
// /studio looks and behaves the same. Monochrome like the rest of LineUp; the
// one colour (signal red) is reserved for "now" and things that need action.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, MoreHorizontal, X } from "lucide-react";

export {
  SIGNAL,
  buttonClass,
  Button,
  fieldClass,
  textareaClass,
  Field,
  Avatar,
  Tag,
  Section,
  panelClass,
  EmptyState,
  SkeletonRows,
  TONE,
  TITLE,
} from "@/app/components/ui";
import { buttonClass, fieldClass } from "@/app/components/ui";

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
              size === "sm" ? "h-11 px-3 text-[13px] sm:h-7" : "h-11 px-4 text-sm sm:h-8"
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
        className={`relative mt-0.5 h-6 w-10 before:absolute before:-inset-2.5 before:content-[''] shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-ink" : "bg-ink/15"}`}
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

// Overflow menu for secondary actions on a row.
export function Menu({
  label,
  items,
  trigger,
}: {
  label: string;
  items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
  // A labelled button instead of the "⋯" icon.
  trigger?: ReactNode;
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
        aria-label={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          trigger
            ? buttonClass("secondary", "sm")
            : "flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-ink/[0.06] hover:text-ink sm:h-8 sm:w-8"
        }
      >
        {trigger || <MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open ? (
        <div
          role="menu"
          className="lu-pop-in absolute right-0 top-10 z-30 min-w-[11rem] rounded-xl bg-surface p-1 shadow-[0_0_0_1px_rgba(10,10,10,0.08),0_12px_32px_-12px_rgba(0,0,0,0.3)]"
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
              } min-h-11 sm:min-h-0`}
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
        className="studio-sheet absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-3xl bg-surface shadow-[0_-12px_48px_-12px_rgba(0,0,0,0.35)] outline-none sm:inset-y-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-[440px] sm:rounded-3xl"
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
            className="-mr-2 -mt-1 flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-ink/[0.06] hover:text-ink"
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
          className="-mr-1 mt-0.5 flex h-6 w-6 relative before:absolute before:-inset-2.5 before:content-[''] shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// The shop's address: type, pick a suggestion. Uses the same lookup as the
// rest of LineUp (/api/places), styled to match these fields.
export type PickedPlace = { address: string; placeId: string | null; lat: number; lng: number };

export function AddressField({
  id,
  value,
  onPick,
  placeholder = "Start typing the shop's address",
}: {
  id: string;
  value: string;
  onPick: (place: PickedPlace | null) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(!!value);

  useEffect(() => {
    if (picked || input.trim().length < 3) return;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [input, picked]);

  async function choose(s: { placeId: string; text: string }) {
    setInput(s.text);
    setSuggestions([]);
    setPicked(true);
    try {
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: s.placeId }),
      });
      const d = await res.json();
      if (typeof d.lat === "number" && typeof d.lng === "number") {
        const address = d.formattedAddress || s.text;
        setInput(address);
        onPick({ address, placeId: d.placeId || s.placeId, lat: d.lat, lng: d.lng });
      }
    } catch {
      onPick(null);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        value={input}
        autoComplete="off"
        onChange={(e) => {
          setInput(e.target.value);
          setPicked(false);
          if (e.target.value.trim().length < 3) setSuggestions([]);
          onPick(null);
        }}
        placeholder={placeholder}
        className={fieldClass}
        aria-autocomplete="list"
      />
      {searching ? <p className="mt-1.5 text-xs text-neutral-500">Looking it up…</p> : null}
      {suggestions.length ? (
        <ul
          role="listbox"
          className="lu-pop-in absolute inset-x-0 top-12 z-30 overflow-hidden rounded-xl bg-surface p-1 shadow-[0_0_0_1px_rgba(10,10,10,0.08),0_16px_40px_-14px_rgba(0,0,0,0.3)]"
        >
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => choose(s)}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-ink/[0.05]"
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Pick several from a set (trades): chips that fill in when chosen.
export function ChipPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={`inline-flex h-11 sm:h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
              on ? "bg-ink text-white" : "bg-surface text-neutral-700 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] hover:text-ink"
            }`}
          >
            {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
