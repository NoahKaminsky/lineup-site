"use client";

import { useEffect, useRef } from "react";

// Deep links like /account#bio: once the page has loaded its data, bring the
// target to the middle of the screen, outline it briefly, and put the cursor
// in it if it's a field. `prepare` runs first so a page can reveal the target
// (e.g. open an edit form) before it's looked up. Runs once per page load.
export function useHashTarget(ready: boolean, prepare?: (id: string) => void) {
  const done = useRef(false);
  const prepareRef = useRef(prepare);
  useEffect(() => {
    prepareRef.current = prepare;
  });

  useEffect(() => {
    if (!ready || done.current || typeof window === "undefined") return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    done.current = true;
    prepareRef.current?.(id);

    // A short timer (not animation frames, which pause in background tabs)
    // lets any state set in `prepare` render, and lands after Next's own
    // scroll-to-top on navigation.
    window.setTimeout(
      () => {
        const el = document.getElementById(id);
        if (!el) return;
        const smooth =
          document.visibilityState === "visible" &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const rect = el.getBoundingClientRect();
        // Respect the target's scroll-margin so it clears any sticky bars.
        const clearance = Math.max(80, parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
        const top = window.scrollY + rect.top - Math.max(clearance, (window.innerHeight - rect.height) / 2);
        window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
        el.classList.remove("lu-target");
        void el.offsetWidth; // restart the outline animation
        el.classList.add("lu-target");
        window.setTimeout(() => el.classList.remove("lu-target"), 2200);
        const field = el.matches("input, textarea, select")
          ? (el as HTMLElement)
          : el.querySelector<HTMLElement>("input:not([type=file]), textarea, select");
        field?.focus({ preventScroll: true });
      },
      120
    );
  }, [ready]);
}
