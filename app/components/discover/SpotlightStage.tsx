"use client";

// The Spotlight: a dark stage with a few paid pros standing on it, shown
// whole (nothing hidden in the dark). One stage light moves between them,
// a few seconds each; whoever it's on is lit and lifted, the rest wait in
// the half-light. The beam opens as the stage scrolls into view. Tap any of
// them. On phones it's one pro at a time, with the light handing over.
//
// Motion: one rAF loop writes --open while the stage is on screen; the beam
// moving between pros is a CSS transition. Reduced motion: beam open, no
// rotation.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck } from "lucide-react";

export type SpotlightPro = {
  id: string;
  href: string;
  name: string;
  role: string;
  place: string | null;
  image: string | null;
  rating: string | null;
  open: string | null;
  verified: boolean;
};

const HOLD_MS = 3800;

export default function SpotlightStage({
  pros,
  onView,
  onTap,
}: {
  pros: SpotlightPro[];
  onView: (id: string) => void;
  onTap: (id: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useRef(false);

  // Beam opens with scroll.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current) {
      el.style.setProperty("--open", "1");
      return;
    }
    let raf = 0;
    let visible = false;
    let open = 0;
    const tick = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const target = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.6)));
      open += (target - open) * 0.12;
      el.style.setProperty("--open", open.toFixed(3));
      if (visible) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // The light moves on, unless someone's hovering or there's only one.
  useEffect(() => {
    if (pros.length < 2 || paused || reduce.current) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % pros.length), HOLD_MS);
    return () => window.clearInterval(id);
  }, [pros.length, paused]);

  // Count a view when the light lands on someone (once per visit, upstream).
  const current = pros[active] ?? pros[0];
  const currentId = current?.id;
  useEffect(() => {
    if (currentId) onView(currentId);
  }, [currentId, onView]);

  const select = useCallback((i: number) => setActive(i), []);
  if (!current) return null;

  // Where the beam points, as a % of the stage width.
  const beamX = pros.length === 1 ? 50 : ((active + 0.5) / pros.length) * 100;

  return (
    <div
      ref={stageRef}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="relative overflow-hidden rounded-[32px] bg-[#0a0a0b] px-4 pb-6 pt-14 sm:px-8 sm:pb-8 sm:pt-16"
      style={{ ["--open" as string]: 0, ["--beam-x" as string]: `${beamX}%` }}
    >
      {/* the lamp and its beam */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
        <div
          className="absolute inset-0 transition-[background] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            opacity: "var(--open)",
            background: `conic-gradient(from 180deg at ${beamX}% -18%, transparent 0deg, transparent 168deg, rgba(255,255,255,0.20) 180deg, transparent 192deg, transparent 360deg)`,
            WebkitMaskImage: "linear-gradient(to bottom, #000 30%, transparent 92%)",
            maskImage: "linear-gradient(to bottom, #000 30%, transparent 92%)",
            filter: "blur(8px)",
          }}
        />
      </div>
      {/* phones: one pro, beam straight down the middle */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 sm:hidden"
        style={{
          opacity: "var(--open)",
          background:
            "conic-gradient(from 180deg at 50% -18%, transparent 0deg, transparent 166deg, rgba(255,255,255,0.20) 180deg, transparent 194deg, transparent 360deg)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 30%, transparent 90%)",
          maskImage: "linear-gradient(to bottom, #000 30%, transparent 90%)",
          filter: "blur(8px)",
        }}
      />

      <div className="relative flex items-baseline justify-between gap-3 px-1 text-white">
        <p className="flex items-center gap-2 text-[13px] font-medium text-white/80">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6l2 7H7l2-7Z" />
            <path d="M12 10v3" />
            <path d="M8 21l4-8 4 8" />
          </svg>
          Spotlight
        </p>
        <p className="text-[11px] text-white/35">Promoted</p>
      </div>

      {/* desktop: everyone on stage, the light on one */}
      <div className={`relative mt-6 hidden gap-5 sm:grid ${pros.length === 1 ? "grid-cols-1 justify-items-center" : pros.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {pros.map((pro, i) => (
          <StageCard key={pro.id} pro={pro} lit={i === active} onFocus={() => select(i)} onTap={() => onTap(pro.id)} solo={pros.length === 1} />
        ))}
      </div>

      {/* phones: the lit pro, with the others as dots */}
      <div className="relative mt-6 sm:hidden">
        <StageCard key={current.id} pro={current} lit onFocus={() => {}} onTap={() => onTap(current.id)} solo />
        {pros.length > 1 ? (
          <div className="mt-4 flex justify-center gap-2">
            {pros.map((pro, i) => (
              <button
                key={pro.id}
                type="button"
                aria-label={`Show ${pro.name}`}
                onClick={() => select(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-6 bg-white" : "w-1.5 bg-white/30"}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StageCard({
  pro,
  lit,
  solo,
  onFocus,
  onTap,
}: {
  pro: SpotlightPro;
  lit: boolean;
  solo: boolean;
  onFocus: () => void;
  onTap: () => void;
}) {
  return (
    <Link
      href={pro.href}
      onClick={onTap}
      onPointerEnter={onFocus}
      onFocus={onFocus}
      className={`lu-stage-card group relative block w-full transition duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
        solo ? "max-w-sm sm:max-w-[22rem]" : ""
      } ${lit ? "opacity-100" : "opacity-45 hover:opacity-80"}`}
      style={{ transform: lit ? "translateY(-6px) scale(1.02)" : "none" }}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-[#1a1a1c]">
        {pro.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pro.image} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-8xl font-semibold tracking-[-0.06em] text-white/90">
            {pro.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <p className="flex items-center gap-1.5 text-xl font-semibold tracking-[-0.03em]">
            <span className="truncate">{pro.name}</span>
            {pro.verified ? <BadgeCheck aria-hidden="true" className="h-[18px] w-[18px] shrink-0 fill-white text-[#0a0a0b]" strokeWidth={2} /> : null}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-white/70">
            {pro.role}
            {pro.rating ? `, ★ ${pro.rating}` : ""}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="truncate text-[13px] text-white/85">{pro.open || pro.place || ""}</span>
            <span className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink">Book</span>
          </div>
        </div>
      </div>
      {/* the pool of light on the floor */}
      <div
        aria-hidden="true"
        className={`pointer-events-none mx-auto mt-2 h-4 w-3/4 rounded-[100%] bg-white/25 blur-md transition-opacity duration-500 ${lit ? "opacity-100" : "opacity-0"}`}
      />
    </Link>
  );
}
