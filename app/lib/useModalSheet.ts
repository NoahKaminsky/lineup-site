"use client";

import { useEffect, useRef } from "react";

/* What a full-screen sheet needs to behave on a phone, iPhone especially:

   1. The page behind it must not scroll. `overflow: hidden` on <body> isn't
      enough on iOS, where a swipe on the sheet still drags the page. Pinning
      the body in place is what holds it still; the scroll position is put
      back when the sheet closes.
   2. The sheet has to fit the part of the screen you can see. When the
      keyboard opens, iOS doesn't shrink a fixed overlay, so a sheet anchored
      to the bottom ends up behind the keyboard. The overlay follows the
      visual viewport instead (--sheet-top / --sheet-height), so its bottom
      edge sits on top of the keyboard and its contents scroll inside it.

   Put the returned ref on the overlay element and give that element the
   `lu-sheet-overlay` class. */

let locks = 0;
let restore: (() => void) | null = null;

function lockPage() {
  locks += 1;
  if (locks > 1) return;

  const { body } = document;
  const scrollY = window.scrollY;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };

  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";

  restore = () => {
    Object.assign(body.style, previous);
    // "instant": the page has smooth scrolling on, and it should reappear
    // exactly where it was, not glide there from the top.
    window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
  };
}

function unlockPage() {
  locks = Math.max(0, locks - 1);
  if (locks === 0 && restore) {
    restore();
    restore = null;
  }
}

export function useModalSheet<T extends HTMLElement = HTMLDivElement>(active = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    lockPage();

    const viewport = window.visualViewport;
    const fit = () => {
      const element = ref.current;
      if (!element || !viewport) return;
      element.style.setProperty("--sheet-top", `${Math.max(0, viewport.offsetTop)}px`);
      element.style.setProperty("--sheet-height", `${viewport.height}px`);
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);

    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      unlockPage();
    };
  }, [active]);

  return ref;
}
