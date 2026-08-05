"use client";

import { useState } from "react";

type AccordionSectionProps = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export default function AccordionSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mt-8 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-6 py-5 text-left transition hover:bg-neutral-50"
      >
        <div>
          {subtitle ? (
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              {subtitle}
            </p>
          ) : null}

          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">
            {title}
          </h2>
        </div>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 text-2xl font-light transition ${
            open ? "rotate-45" : "rotate-0"
          }`}
        >
          +
        </div>
      </button>

      {open ? (
        <div className="border-t border-neutral-100 p-6">
          {children}
        </div>
      ) : null}
    </section>
  );
}