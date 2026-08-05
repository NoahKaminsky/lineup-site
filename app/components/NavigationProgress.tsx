"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathRef = useRef(pathname);

  // When pathname changes, navigation is done — complete and hide the bar
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      setWidth(100);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 300);
    }
  }, [pathname]);

  // Listen for internal link clicks to start the bar
  useEffect(() => {
    function onAnchorClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(true);
      setWidth(35);
      timerRef.current = setTimeout(() => setWidth(65), 300);
      timerRef.current = setTimeout(() => setWidth(80), 800);
    }

    document.addEventListener("click", onAnchorClick);
    return () => document.removeEventListener("click", onAnchorClick);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[2px]"
      aria-hidden="true"
    >
      <div
        className="h-full bg-black transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
