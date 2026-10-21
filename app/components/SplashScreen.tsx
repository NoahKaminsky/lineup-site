"use client";

import { useEffect, useState } from "react";
import { LuMarkPaths } from "./LuMark";

const SESSION_KEY = "lineup-splash-shown";

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (sessionStorage.getItem(SESSION_KEY)) {
      return;
    }

    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(true);

    // The logo sweep animation itself takes 0.85s (see the SVG below) — start
    // fading right after it finishes instead of holding on a static logo.
    // This used to hold for 1.3s before fading (1.6s total); real content was
    // already loading underneath the whole time, so that hold was pure
    // perceived latency with no functional benefit.
    // Trimmed again: a quicker 0.5s sweep, then a 200ms fade (0.7s total).
    const fadeTimer = setTimeout(() => setFadingOut(true), 500);
    const removeTimer = setTimeout(() => setVisible(false), 700);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-white transition-opacity duration-200"
      style={{ opacity: fadingOut ? 0 : 1 }}
    >
      <div
        className="h-24 w-24"
        style={{
          animation: "lu-logo-reveal 0.5s cubic-bezier(0.4,0,0.2,1) forwards",
        }}
      >
        <svg viewBox="0 0 1024 1024" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="lu-sweep-splash">
              <rect x="0" y="0" height="1024" width="0">
                <animate
                  attributeName="width"
                  from="0"
                  to="1024"
                  dur="0.5s"
                  calcMode="spline"
                  keySplines="0.4 0 0.2 1"
                  keyTimes="0;1"
                  fill="freeze"
                />
              </rect>
            </clipPath>
          </defs>
          <g clipPath="url(#lu-sweep-splash)" className="text-black">
            <LuMarkPaths />
          </g>
        </svg>
      </div>
    </div>
  );
}
