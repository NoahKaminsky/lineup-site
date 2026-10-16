"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Anchor = { left: number; top: number; width: number; height: number };

type DayZoomAreaProps = {
  /** Content for the zoomed-in day, or null to show nothing for that day. */
  renderLens: (key: string) => ReactNode | null;
  /** Width of the zoomed lens in px. */
  lensWidth?: number;
  className?: string;
  children: ReactNode;
};

/**
 * Hover-to-zoom for calendar days. Any descendant with `data-zoom-key` is a
 * day; resting on one grows a lens out of that exact cell (it starts at the
 * cell's size and scales up from the cell's centre), so it reads as zooming
 * into the day rather than a tooltip popping up.
 *
 * Pointer devices only — touch keeps the normal tap-to-select. With Reduce
 * Motion the global rule removes the animation, so the lens simply appears.
 * Purely presentational: it never changes selection or data on its own.
 */
export default function DayZoomArea({ renderLens, lensWidth = 300, className = "", children }: DayZoomAreaProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [enabled] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
  const [active, setActive] = useState<{ key: string; anchor: Anchor; wrapperWidth: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const close = useCallback(() => {
    clearTimer();
    setActive(null);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, close]);

  useEffect(() => clearTimer, []);

  function handlePointerOver(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabled || event.pointerType === "touch") return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-zoom-key]");
    if (!target || !wrapper.contains(target)) return;
    const key = target.dataset.zoomKey;
    if (!key || key === active?.key) return;

    clearTimer();
    // A short intent delay so sweeping the mouse across the grid doesn't
    // fire a zoom on every cell; quicker once a lens is already open.
    timerRef.current = setTimeout(() => {
      const w = wrapper.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      setActive({
        key,
        anchor: { left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height },
        wrapperWidth: w.width,
      });
    }, active ? 70 : 180);
  }

  const lensContent = active ? renderLens(active.key) : null;
  let lens: ReactNode = null;

  if (active && lensContent) {
    const { anchor, wrapperWidth } = active;
    const width = Math.min(lensWidth, wrapperWidth);
    const centerX = anchor.left + anchor.width / 2;
    const left = Math.max(0, Math.min(centerX - width / 2, wrapperWidth - width));
    const top = Math.max(0, anchor.top - 10);
    const originX = centerX - left;
    const originY = anchor.top + anchor.height / 2 - top;

    lens = (
      <div
        key={active.key}
        className="lu-zoom-in pointer-events-auto absolute z-30"
        style={
          {
            left,
            top,
            width,
            transformOrigin: `${originX}px ${originY}px`,
            "--zoom-from": Math.min(0.9, Math.max(0.25, anchor.width / width)).toFixed(3),
          } as React.CSSProperties
        }
      >
        {lensContent}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className}`}
      onPointerOver={handlePointerOver}
      onPointerLeave={close}
    >
      {children}
      {lens}
    </div>
  );
}
