"use client";

import Link from "next/link";
import { useState } from "react";

export type FaqItem = { q: string; a: React.ReactNode };
export type FaqGroup = { id: string; label: string; items: FaqItem[] };

// Questions that open one at a time, with a For clients / For pros switch.
export default function FaqList({ groups }: { groups: FaqGroup[] }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];

  return (
    <div>
      <div role="tablist" aria-label="Who the questions are for" className="relative inline-grid grid-cols-2 rounded-full bg-ink/[0.05] p-1">
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[var(--ease-arrive)]"
          style={{ transform: groupId === groups[1]?.id ? "translateX(100%)" : "translateX(0)" }}
        />
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === groupId}
            onClick={() => {
              setGroupId(g.id);
              setOpenIndex(0);
            }}
            className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors sm:px-7 ${
              g.id === groupId ? "text-ink" : "text-neutral-500 hover:text-ink"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <ul key={group.id} className="mt-8 divide-y divide-ink/[0.08] border-y border-ink/[0.08]">
        {group.items.map((item, index) => {
          const open = openIndex === index;
          return (
            <li key={item.q} className="lu-rise-in" style={{ animationDelay: `${index * 40}ms` }}>
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="group flex w-full items-center justify-between gap-6 py-5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`h-5 w-[3px] shrink-0 origin-center rounded-full bg-ink transition-transform duration-500 ease-[var(--ease-arrive)] ${
                        open ? "scale-y-100" : "scale-y-0"
                      }`}
                    />
                    <span
                      className={`text-[17px] font-semibold tracking-[-0.015em] transition-all duration-500 ease-[var(--ease-arrive)] sm:text-lg ${
                        open ? "text-ink" : "-ml-[15px] text-neutral-700 group-hover:text-ink"
                      }`}
                    >
                      {item.q}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-all duration-300 ease-[var(--ease-arrive)] ${
                      open ? "rotate-45 bg-ink text-white ring-ink" : "text-ink ring-ink/15 group-hover:ring-ink/30"
                    }`}
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
              </h3>
              {/* Height animates via grid rows 0fr -> 1fr. */}
              <div
                className={`grid transition-[grid-template-rows] duration-400 ease-[var(--ease-arrive)] ${
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div
                    className={`max-w-2xl pb-6 pl-[15px] text-[15px] leading-7 text-neutral-600 transition-all duration-500 ease-[var(--ease-arrive)] ${
                      open ? "translate-y-0 opacity-100 blur-0" : "-translate-y-2 opacity-0 blur-[2px]"
                    }`}
                  >
                    {item.a}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-12 flex flex-col items-start gap-4 rounded-3xl bg-white p-6 ring-1 ring-ink/[0.07] sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-lg font-semibold tracking-[-0.02em]">Still have a question?</p>
          <p className="mt-1 text-sm text-neutral-500">We read every message.</p>
        </div>
        <Link href="/contact" className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
          Contact us
        </Link>
      </div>
    </div>
  );
}
