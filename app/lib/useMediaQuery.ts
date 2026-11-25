"use client";

import { useSyncExternalStore } from "react";

// A media query (e.g. prefers-reduced-motion) that's safe to render with: the
// server and the hydrating client both see `serverValue`, then it switches to
// the real answer and follows changes. Reading matchMedia during render made
// the first client render differ from the server's HTML (hydration error #418).
export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}
