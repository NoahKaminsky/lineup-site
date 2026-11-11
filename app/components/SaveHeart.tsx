"use client";

import { useState } from "react";

/* The heart that saves a pro. Tapping it on fills it LineUp red with a pop, a
   ring and six dots; tapping it off is quiet. The animation only plays for a
   tap, never for a heart that was already saved when the page loaded.

   "overlay" is the round white button that sits on a card's photo;
   "pill" is the labelled button used beside a profile's actions. */

type SaveHeartProps = {
  saved: boolean;
  onToggle: () => void;
  name?: string | null;
  variant?: "overlay" | "pill";
  className?: string;
};

const HEART_PATH = "M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z";
const DOTS = [0, 1, 2, 3, 4, 5];

export default function SaveHeart({ saved, onToggle, name, variant = "overlay", className = "" }: SaveHeartProps) {
  const [popKey, setPopKey] = useState(0);
  const who = name?.trim() || "this pro";

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    // On a card the heart sits over a link: saving shouldn't open the profile.
    event.preventDefault();
    event.stopPropagation();
    if (!saved) setPopKey((key) => key + 1);
    onToggle();
  }

  const animate = saved && popKey > 0;

  const heart = (
    <span className="relative block h-5 w-5">
      {animate ? (
        <span key={`fx-${popKey}`} aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="lu-heart-ring absolute -inset-2 rounded-full border-2 border-[#c8102e]" />
          {DOTS.map((i) => {
            const angle = (i / DOTS.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <span
                key={i}
                className={`lu-heart-dot absolute left-1/2 top-1/2 -ml-[2.5px] -mt-[2.5px] h-[5px] w-[5px] rounded-full ${
                  i % 2 === 0 ? "bg-[#c8102e]" : "bg-ink"
                }`}
                style={
                  {
                    "--dx": `${Math.round(Math.cos(angle) * 24)}px`,
                    "--dy": `${Math.round(Math.sin(angle) * 24)}px`,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </span>
      ) : null}
      <svg
        key={`heart-${popKey}-${saved ? "on" : "off"}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`relative block h-5 w-5 ${animate ? "lu-heart-pop" : ""}`}
        fill={saved ? "#c8102e" : "none"}
        stroke={saved ? "#c8102e" : "currentColor"}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={HEART_PATH} />
      </svg>
    </span>
  );

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        className={`inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-ink ring-1 ring-ink/15 transition hover:ring-ink/30 active:scale-[0.98] ${className}`}
      >
        {heart}
        {saved ? "Saved" : "Save"}
        <span className="sr-only"> {who}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${who} from saved pros` : `Save ${who}`}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-[0_4px_14px_-6px_rgba(0,0,0,0.35)] backdrop-blur transition-transform duration-200 ease-premium hover:scale-105 active:scale-95 ${className}`}
    >
      {heart}
    </button>
  );
}
