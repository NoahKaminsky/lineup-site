"use client";

// The Spotlight, staged like one: a dark room, a beam of white light from
// above, and the pro standing in it. The beam opens as you scroll the stage
// into view, drifts a little while you look, and follows your pointer on a
// laptop. Everything outside the light is dimmed, so the pro is the only
// thing lit on the page.
//
// Scroll-driven without a library: one rAF loop, running only while the stage
// is on screen, writes three CSS variables (--open, --x, --y). Reduced motion
// gets the beam fully open and still.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { BadgeCheck } from "lucide-react";

export type SpotlightStageProps = {
  href: string;
  name: string;
  role: string;
  place: string | null;
  image: string | null;
  rating: string | null;
  open: string | null;
  verified: boolean;
  onTap: () => void;
};

export default function SpotlightStage({ href, name, role, place, image, rating, open, verified, onTap }: SpotlightStageProps) {
  const stageRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const set = (open: number, x: number, y: number) => {
      el.style.setProperty("--open", open.toFixed(3));
      el.style.setProperty("--x", `${x.toFixed(2)}%`);
      el.style.setProperty("--y", `${y.toFixed(2)}%`);
    };
    if (reduce) {
      set(1, 50, 46);
      return;
    }

    let raf = 0;
    let visible = false;
    let pointer: { x: number; y: number } | null = null;
    let x = 50;
    let y = 46;
    let open = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 as the stage's top enters the screen, 1 once it's well in view.
      const target = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.55)));
      open += (target - open) * 0.12;
      // Drift on its own; ease toward the pointer when there is one.
      const t = (now - start) / 1000;
      const tx = pointer ? pointer.x : 50 + Math.sin(t * 0.7) * 9;
      const ty = pointer ? pointer.y : 46 + Math.cos(t * 0.5) * 4;
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      set(open, x, y);
      if (visible) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(tick);
    });
    io.observe(el);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      pointer = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    };
    const onLeave = () => {
      pointer = null;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const subject = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center text-[11rem] font-semibold leading-none tracking-[-0.08em] text-white sm:text-[14rem]">
      {name.charAt(0).toUpperCase()}
    </span>
  );

  // The lit circle: radius grows with --open.
  const lightMask =
    "radial-gradient(circle at var(--x) var(--y), #000 calc(var(--open) * 26%), rgba(0,0,0,0.55) calc(var(--open) * 34%), transparent calc(var(--open) * 46% + 2%))";

  return (
    <Link
      ref={stageRef}
      href={href}
      onClick={onTap}
      aria-label={`Spotlight: ${name}, ${role}${place ? `, ${place}` : ""}`}
      className="group relative block h-[26rem] overflow-hidden rounded-[32px] bg-[#09090a] sm:h-[30rem]"
      style={{ ["--open" as string]: 0, ["--x" as string]: "50%", ["--y" as string]: "46%" }}
    >
      {/* The room: the same picture, almost in the dark. */}
      <div aria-hidden="true" className="absolute inset-0 opacity-[0.22] grayscale">
        {subject}
      </div>

      {/* The lit part: full colour, only inside the circle of light. */}
      <div aria-hidden="true" className="absolute inset-0" style={{ WebkitMaskImage: lightMask, maskImage: lightMask }}>
        {subject}
      </div>

      {/* The beam itself, from a lamp above the stage down to the circle. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          opacity: "calc(var(--open) * 0.9)",
          background:
            "conic-gradient(from 180deg at var(--x) -12%, transparent 0deg, transparent calc(180deg - var(--open) * 15deg), rgba(255,255,255,0.18) 180deg, transparent calc(180deg + var(--open) * 15deg), transparent 360deg)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 45%, transparent 85%)",
          maskImage: "linear-gradient(to bottom, #000 0%, #000 45%, transparent 85%)",
          filter: "blur(10px)",
        }}
      />

      {/* A soft pool of light where the beam lands. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse calc(var(--open) * 34%) calc(var(--open) * 9%) at var(--x) calc(var(--y) + 30%), rgba(255,255,255,0.16), transparent 70%)",
        }}
      />

      {/* Dust in the beam. */}
      <div aria-hidden="true" className="lu-dust pointer-events-none absolute inset-0" style={{ opacity: "var(--open)" }}>
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `calc(var(--x) + ${((i * 37) % 24) - 12}%)`,
              top: `${10 + ((i * 53) % 60)}%`,
              animationDelay: `${(i * 0.9) % 7}s`,
              animationDuration: `${6 + (i % 5)}s`,
            }}
          />
        ))}
      </div>

      {/* Edge falloff so the stage melts into the page. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090a] via-transparent to-[#09090a]/40" />

      {/* The billing. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 sm:p-7">
        <span className="flex items-center gap-2 text-[13px] font-medium text-white/80">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6l2 7H7l2-7Z" />
            <path d="M12 10v3" />
            <path d="M8 21l4-8 4 8" />
          </svg>
          Spotlight
        </span>
        <span className="text-[11px] text-white/35">Promoted</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
        <p className="flex items-center gap-2 text-[2rem] font-semibold leading-none tracking-[-0.045em] text-white sm:text-[2.75rem]">
          <span className="truncate">{name}</span>
          {verified ? <BadgeCheck aria-hidden="true" className="h-6 w-6 shrink-0 fill-white text-[#09090a]" strokeWidth={2} /> : null}
        </p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <p className="min-w-0 text-sm leading-6 text-white/65">
            <span className="block truncate">
              {role}
              {place ? (place.endsWith("away") ? `, ${place}` : ` in ${place}`) : ""}
            </span>
            <span className="block truncate text-white">
              {[rating ? `★ ${rating}` : null, open].filter(Boolean).join(", ")}
            </span>
          </p>
          <span className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition group-hover:scale-[1.03]">
            Book
          </span>
        </div>
      </div>
    </Link>
  );
}
