"use client";

// LineUp Picks: pros the LineUp team chose, not ones who paid. So they're
// presented editorially, like a magazine's pick of the month, on paper:
// the photo is revealed with a wipe as it scrolls in, the LineUp seal
// stamps down onto the corner, and a line says why they were picked.
// (Spotlight is the opposite: dark, lit, paid. The two should never be
// confused.)

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { LuMarkPaths } from "@/app/components/LuMark";

export type PickCard = {
  id: string;
  href: string;
  name: string;
  role: string;
  place: string | null;
  image: string | null;
  rating: string | null;
  open: string | null;
  verified: boolean;
  why: string;
};

function Seal({ city }: { city: string }) {
  const ring = `LineUp Pick · Handpicked in ${city} · `;
  return (
    <span className="lu-seal pointer-events-none absolute -right-3 -top-3 z-10 block h-[5.5rem] w-[5.5rem] sm:h-24 sm:w-24" aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-[#C8102E] shadow-[0_8px_20px_-8px_rgba(200,16,46,0.7)]" />
      <svg viewBox="0 0 100 100" className="lu-seal-ring absolute inset-0 h-full w-full text-white">
        <defs>
          <path id="lu-seal-path" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
        </defs>
        <text fontSize="8.6" fontWeight="600" letterSpacing="0.6" fill="currentColor">
          <textPath href="#lu-seal-path">{ring + ring}</textPath>
        </text>
      </svg>
      <svg viewBox="215 245 545 410" className="absolute left-1/2 top-1/2 h-[30%] w-auto -translate-x-1/2 -translate-y-1/2 text-white">
        <LuMarkPaths />
      </svg>
    </span>
  );
}

function PickCardView({ pick, index }: { pick: PickCard; index: number }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const city = (pick.place && !pick.place.endsWith("away") ? pick.place : "Winnipeg").split(",")[0];

  return (
    <Link
      ref={ref}
      href={pick.href}
      data-in={inView ? "true" : "false"}
      style={{ ["--pick-delay" as string]: `${index * 120}ms` }}
      className="lu-pick group relative block w-[80vw] max-w-[22rem] shrink-0 snap-start sm:w-auto sm:max-w-none"
    >
      <div className="relative">
        <div className="lu-pick-photo relative aspect-[4/5] overflow-hidden rounded-[6px] bg-neutral-200">
          {pick.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pick.image} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-premium group-hover:scale-[1.03]" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-[#efece6] text-8xl font-semibold tracking-[-0.06em] text-ink/80">
              {pick.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <Seal city={city} />
      </div>

      <div className="mt-4">
        <p className="flex items-center gap-1.5 text-[1.35rem] font-semibold leading-tight tracking-[-0.03em] text-ink">
          <span className="truncate">{pick.name}</span>
          {pick.verified ? <BadgeCheck aria-hidden="true" className="h-[18px] w-[18px] shrink-0 fill-ink text-paper" strokeWidth={2} /> : null}
        </p>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          {pick.role}
          {pick.place ? (pick.place.endsWith("away") ? `, ${pick.place}` : ` in ${pick.place}`) : ""}
          {pick.rating ? `, ★ ${pick.rating}` : ""}
        </p>
        {/* Why we picked them, set like a pull quote. */}
        <p className="mt-3 border-l-2 border-[#C8102E] pl-3 font-serif text-[15px] italic leading-6 text-neutral-700 line-clamp-3">
          {pick.why}
        </p>
        {pick.open ? <p className="mt-3 text-[13px] font-medium text-ink">{pick.open}</p> : null}
      </div>
    </Link>
  );
}

export default function LineupPicks({ picks }: { picks: PickCard[] }) {
  if (picks.length === 0) return null;
  return (
    <section aria-labelledby="picks-heading" className="mt-12">
      <div className="flex items-end justify-between gap-4 border-b border-ink/10 pb-3">
        <h2 id="picks-heading" className="font-serif text-[1.9rem] italic leading-none tracking-[-0.02em] text-ink sm:text-[2.4rem]">
          LineUp Picks
        </h2>
        <p className="max-w-[14rem] text-right text-xs leading-5 text-neutral-500">Chosen by our team for their work. Nobody pays to be here.</p>
      </div>
      <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
        {picks.slice(0, 3).map((pick, index) => (
          <PickCardView key={pick.id} pick={pick} index={index} />
        ))}
      </div>
    </section>
  );
}
