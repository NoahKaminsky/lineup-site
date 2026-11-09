"use client";

// Scroll-driven motion without a library: writes --sp (0 → 1) on an element
// as it scrolls up and out of view, from one passive listener and one rAF.
// CSS does the rest (parallax, fades). Reduced motion leaves it at 0.

import { useEffect, type RefObject } from "react";

// `key` re-attaches when the element appears later (e.g. after data loads).
export function useScrollVar(ref: RefObject<HTMLElement | null>, distance = 1, key?: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const span = rect.height * distance || 1;
      const p = Math.min(1, Math.max(0, -rect.top / span));
      el.style.setProperty("--sp", p.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref, distance, key]);
}
