"use client";

import { useId } from "react";
import { useMediaQuery } from "@/app/lib/useMediaQuery";
import { LuMarkPaths } from "./LuMark";

// Full-screen page loader: the LU brush mark painting itself in on a loop.
// With Reduce Motion on, the mark is simply shown, without the sweep.
export default function LuLoader({ label = "Loading" }: { label?: string }) {
  const clipId = `lu-loader-${useId().replace(/:/g, "")}`;
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper" aria-busy="true">
      <div role="status" className="flex flex-col items-center">
        <svg viewBox="0 0 1024 1024" className="h-20 w-20 text-ink" aria-hidden="true">
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" height="1024" width={reduceMotion ? 1024 : 0}>
                {reduceMotion ? null : (
                  <animate
                    attributeName="width"
                    values="0;1024;1024"
                    keyTimes="0;0.55;1"
                    dur="1.6s"
                    calcMode="spline"
                    keySplines="0.4 0 0.2 1;0 0 1 1"
                    repeatCount="indefinite"
                  />
                )}
              </rect>
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <LuMarkPaths />
          </g>
        </svg>
        <span className="sr-only">{label}…</span>
      </div>
    </main>
  );
}
