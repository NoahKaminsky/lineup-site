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
    if (!window.matchMedia("(min-width: 640px)").matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % pros.length), HOLD_MS);
    return () => window.clearInterval(id);
  }, [pros.length, paused]);

  // Count a view when the light lands on someone (once per visit, upstream).
  const current = pros[active] ?? pros[0];
  const currentId = current?.id;
  useEffect(() => {
    // Only the version on screen counts views (this one is laptops).
    if (currentId && window.matchMedia("(min-width: 640px)").matches) onView(currentId);
  }, [currentId, onView]);

  const select = useCallback((i: number) => setActive(i), []);
  if (!current) return null;

  // Where the beam points, as a % of the stage width.
  const beamX = pros.length === 1 ? 50 : ((active + 0.5) / pros.length) * 100;

  return (
    <>
    <SpotlightMarquee pros={pros} onView={onView} onTap={onTap} />
    <div
      ref={stageRef}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="relative hidden overflow-hidden rounded-[32px] bg-[#0a0a0b] px-8 pb-8 pt-16 sm:block"
      style={{ ["--open" as string]: 0, ["--beam-x" as string]: `${beamX}%` }}
    >
      {/* the lamp and its beam */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
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
      <div className={`relative mt-6 grid gap-5 ${pros.length === 1 ? "grid-cols-1 justify-items-center" : pros.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {pros.map((pro, i) => (
          <StageCard key={pro.id} pro={pro} lit={i === active} onFocus={() => select(i)} onTap={() => onTap(pro.id)} solo={pros.length === 1} />
        ))}
      </div>

    </div>
    </>
  );
}

// Phones: a marquee of lit portraits you swipe through. The one in the
// middle is under the light (bright, full size, a sheen of light crosses it
// as it arrives); the ones peeking in from the sides wait in the dark. The
// light follows your swipe, and moves on by itself until you touch it.
function SpotlightMarquee({
  pros,
  onView,
  onTap,
}: {
  pros: SpotlightPro[];
  onView: (id: string) => void;
  onTap: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const touched = useRef(false);

  // Scroll-driven: each card's distance from the centre sets its light.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = scroller.scrollLeft + scroller.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const center = card.offsetLeft + card.offsetWidth / 2;
        const d = Math.min(1, Math.abs(center - mid) / card.offsetWidth);
        card.style.setProperty("--d", d.toFixed(3));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setActive(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pros.length]);

  // Moves on by itself until the person swipes.
  useEffect(() => {
    if (pros.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (touched.current) return;
      const next = cardRefs.current[(active + 1) % pros.length];
      const scroller = scrollerRef.current;
      if (next && scroller) {
        scroller.scrollTo({ left: next.offsetLeft - (scroller.clientWidth - next.offsetWidth) / 2, behavior: "smooth" });
      }
    }, HOLD_MS);
    return () => window.clearInterval(id);
  }, [active, pros.length]);

  const activeId = pros[active]?.id;
  useEffect(() => {
    if (activeId && !window.matchMedia("(min-width: 640px)").matches) onView(activeId);
  }, [activeId, onView]);

  return (
    <section aria-label="Spotlight" className="sm:hidden">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6l2 7H7l2-7Z" />
            <path d="M12 10v3" />
            <path d="M8 21l4-8 4 8" />
          </svg>
          Spotlight
        </p>
        <p className="text-[11px] text-neutral-400">Promoted</p>
      </div>

      <div
        ref={scrollerRef}
        onTouchStart={() => {
          touched.current = true;
        }}
        className={`-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          pros.length === 1 ? "px-4" : "px-[9vw]"
        }`}
      >
        {pros.map((pro, i) => (
          <Link
            key={pro.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            href={pro.href}
            onClick={() => onTap(pro.id)}
            data-lit={i === active ? "true" : "false"}
            style={{ ["--d" as string]: i === 0 ? 0 : 1 }}
            className={`lu-marquee-card relative block shrink-0 snap-center ${pros.length === 1 ? "w-full" : "w-[82vw]"}`}
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-[#111113] shadow-[0_30px_60px_-32px_rgba(0,0,0,0.75)]">
              {pro.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pro.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[9rem] font-semibold tracking-[-0.07em] text-white/90">
                  {pro.name.charAt(0).toUpperCase()}
                </span>
              )}
              {/* the light from above, and the dark around it */}
              <div
                aria-hidden="true"
                className="absolute inset-0 mix-blend-soft-light"
                style={{ background: "radial-gradient(110% 65% at 50% -8%, rgba(255,255,255,0.75), transparent 62%)" }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: "radial-gradient(ellipse 85% 75% at 50% 32%, transparent 45%, rgba(0,0,0,0.55))" }}
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
              {/* a sheen of light crosses as the card arrives under the light */}
              <div aria-hidden="true" className="lu-marquee-sheen absolute inset-0" />
              <div aria-hidden="true" className="absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/15" />

              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="flex items-center gap-2 text-[1.9rem] font-semibold leading-none tracking-[-0.045em]">
                  <span className="truncate">{pro.name}</span>
                  {pro.verified ? <BadgeCheck aria-hidden="true" className="h-5 w-5 shrink-0 fill-white text-[#111113]" strokeWidth={2} /> : null}
                </p>
                <p className="mt-2 truncate text-sm text-white/70">
                  {pro.role}
                  {pro.rating ? `, ★ ${pro.rating}` : ""}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-white">{pro.open || pro.place || ""}</span>
                  <span className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">Book</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {pros.length > 1 ? (
        <div className="mt-1 flex justify-center gap-1.5">
          {pros.map((pro, i) => (
            <span
              key={pro.id}
              aria-hidden="true"
              className={`h-1 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-ink" : "w-1 bg-ink/20"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
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
