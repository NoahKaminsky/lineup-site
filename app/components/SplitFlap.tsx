"use client";

// A split-flap display, like an airport departures board: each character
// flips through a few others before it lands. LineUp is a line-up, so the
// times people wait for are shown the way a board shows departures.
// Flips once when it appears and again whenever the text changes.
// Reduced motion just shows the text.

import { useEffect, useRef, useState } from "react";

const DIGITS = "0123456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function pool(ch: string) {
  if (/[0-9]/.test(ch)) return DIGITS;
  if (/[A-Za-z]/.test(ch)) return LETTERS;
  return "";
}

function Cell({ target, delay, tone }: { target: string; delay: number; tone: "dark" | "light" }) {
  const [shown, setShown] = useState(target);
  const [flipKey, setFlipKey] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    const chars = pool(target);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!chars || reduce) {
      const t = window.setTimeout(() => setShown(target), 0);
      return () => window.clearTimeout(t);
    }
    const steps = first.current ? 5 + Math.floor(delay / 60) : 4;
    first.current = false;
    const timers: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      timers.push(
        window.setTimeout(() => {
          setShown(i === steps - 1 ? target : chars[Math.floor(Math.random() * chars.length)]);
          setFlipKey((k) => k + 1);
        }, delay + i * 70)
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [target, delay]);

  if (target === " ") return <span className="inline-block w-[0.3em]" />;
  if (!pool(target)) {
    // Colons and dots sit between cells, not on a flap.
    return <span className={`mx-[0.02em] inline-block ${tone === "dark" ? "text-white/80" : "text-ink/70"}`}>{target}</span>;
  }
  return (
    <span
      className={`relative mx-[0.03em] inline-flex h-[1.18em] w-[0.72em] items-center justify-center overflow-hidden rounded-[0.12em] leading-none [perspective:300px] ${
        tone === "dark" ? "bg-[#1b1b1d] text-white" : "bg-ink text-white"
      }`}
    >
      <span key={flipKey} className="lu-flap inline-block">
        {shown}
      </span>
      {/* the hinge */}
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/50" />
    </span>
  );
}

export default function SplitFlap({
  text,
  tone = "light",
  className = "",
}: {
  text: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center tabular-nums ${className}`} aria-label={text} role="text">
      {text.split("").map((ch, i) => (
        <Cell key={i} target={ch} delay={i * 90} tone={tone} />
      ))}
    </span>
  );
}
