"use client";

import React, { useEffect, useState } from "react";

/* The little celebration from claiming a booking link, available anywhere:
   call fireBurst(event) on a successful action and a ring and particles fly
   out from where the person tapped. <BurstLayer /> (mounted once in the root
   layout) draws them. Colours use mix-blend-difference so it reads on both
   light and dark surfaces. Skipped entirely for reduced-motion users. */

type BurstOrigin = { x: number; y: number };
type BurstStyle = "pop" | "spark";
type BurstDetail = BurstOrigin & { style: BurstStyle };

const EVENT = "lu-burst";

function originFrom(source: unknown): BurstOrigin | null {
  if (!source) return null;
  const s = source as {
    clientX?: number;
    clientY?: number;
    currentTarget?: Element | null;
    getBoundingClientRect?: () => DOMRect;
    x?: number;
    y?: number;
  };
  // Keyboard "clicks" report 0,0 — fall back to the element's centre.
  if (typeof s.clientX === "number" && typeof s.clientY === "number" && (s.clientX !== 0 || s.clientY !== 0)) {
    return { x: s.clientX, y: s.clientY };
  }
  const el =
    s.currentTarget && typeof (s.currentTarget as Element).getBoundingClientRect === "function"
      ? (s.currentTarget as Element)
      : typeof s.getBoundingClientRect === "function"
      ? (source as Element)
      : null;
  if (el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  if (typeof s.x === "number" && typeof s.y === "number") return { x: s.x, y: s.y };
  return null;
}

/* Pass the click event (or an element, or {x, y}). Grab the origin BEFORE any
   await — React may have released the event by then — with burstOrigin(). */
export function fireBurst(source: unknown, style: BurstStyle = "pop") {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const origin = originFrom(source);
  if (!origin) return;
  window.dispatchEvent(new CustomEvent<BurstDetail>(EVENT, { detail: { ...origin, style } }));
}

export function burstOrigin(source: unknown): BurstOrigin | null {
  return originFrom(source);
}

export default function BurstLayer() {
  const [bursts, setBursts] = useState<(BurstDetail & { key: number })[]>([]);

  useEffect(() => {
    function onBurst(e: Event) {
      const detail = (e as CustomEvent<BurstDetail>).detail;
      const key = Date.now() + Math.random();
      setBursts((prev) => [...prev, { ...detail, key }]);
      window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.key !== key)), 1100);
    }
    window.addEventListener(EVENT, onBurst);
    return () => window.removeEventListener(EVENT, onBurst);
  }, []);

  if (bursts.length === 0) return null;

  return (
    <>
      {bursts.map((burst) => {
        const count = burst.style === "spark" ? 8 : 14;
        return (
          <div
            key={burst.key}
            aria-hidden="true"
            className="pointer-events-none fixed z-[130]"
            style={{ left: burst.x, top: burst.y }}
          >
            <span
              className={`lu-burst-ring absolute rounded-full border-2 border-white mix-blend-difference ${
                burst.style === "spark" ? "-left-4 -top-4 h-8 w-8" : "-left-6 -top-6 h-12 w-12"
              }`}
            />
            {Array.from({ length: count }).map((_, i) => {
              const angle = (i / count) * Math.PI * 2 + (burst.style === "spark" ? Math.PI / count : 0);
              const dist = burst.style === "spark" ? 26 + (i % 2) * 10 : 46 + (i % 3) * 16;
              return (
                <span
                  key={i}
                  className={`lu-burst-dot absolute rounded-full bg-white mix-blend-difference ${
                    burst.style === "spark" ? "-left-[3px] -top-[3px] h-1.5 w-1.5" : "-left-1 -top-1 h-2 w-2"
                  }`}
                  style={
                    {
                      "--dx": `${Math.cos(angle) * dist}px`,
                      "--dy": `${Math.sin(angle) * dist}px`,
                      animationDelay: `${(i % 4) * 25}ms`,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}
