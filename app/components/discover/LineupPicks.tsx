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

// A paper tag pinned over the photo's corner, like a gallery label: the
// month it was picked, set in the same serif as the section.
function PickTag() {
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return (
    <span
      aria-hidden="true"
      className="lu-seal pointer-events-none absolute -bottom-4 left-4 z-10 block rounded-[3px] bg-[#fbfaf6] px-3.5 py-2 shadow-[0_1px_1px_rgba(0,0,0,0.08),0_10px_24px_-10px_rgba(0,0,0,0.45)]"
    >
      {/* the bit of tape holding it on */}
      <span className="absolute -top-2 left-1/2 h-4 w-10 -translate-x-1/2 rotate-[-4deg] bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur-[1px]" />
      <span className="block font-serif text-[17px] italic leading-none text-ink">LineUp Pick</span>
      <span className="mt-1 block text-[10px] leading-none text-neutral-500">{month}</span>
    </span>
  );
}

function PickCardView({ pick, index, solo }: { pick: PickCard; index: number; solo: boolean }) {
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

  return (
    <Link
      ref={ref}
      href={pick.href}
      data-in={inView ? "true" : "false"}
      style={{ ["--pick-delay" as string]: `${index * 120}ms` }}
      className={`lu-pick group relative block shrink-0 snap-start sm:w-auto sm:max-w-none ${solo ? "w-full" : "w-[80vw] max-w-[22rem]"} ${
        solo ? "sm:grid sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-end sm:gap-12" : ""
      }`}
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
        <PickTag />
      </div>

      <div className={solo ? "mt-8 sm:mt-0 sm:pb-2" : "mt-8"}>
        <p className={`flex items-center gap-1.5 font-semibold leading-tight tracking-[-0.03em] text-ink ${solo ? "text-[1.35rem] sm:text-[2.6rem]" : "text-[1.35rem]"}`}>
          <span className="truncate">{pick.name}</span>
          {pick.verified ? <BadgeCheck aria-hidden="true" className="h-[18px] w-[18px] shrink-0 fill-ink text-paper" strokeWidth={2} /> : null}
        </p>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          {pick.role}
          {pick.place ? (pick.place.endsWith("away") ? `, ${pick.place}` : ` in ${pick.place}`) : ""}
          {pick.rating ? `, ★ ${pick.rating}` : ""}
        </p>
        {/* Why we picked them, set like a pull quote. */}
        <p className={`mt-3 border-l-2 border-[#C8102E] pl-3 font-serif italic text-neutral-700 line-clamp-3 ${solo ? "text-[15px] leading-6 sm:mt-6 sm:max-w-xl sm:pl-5 sm:text-[1.6rem] sm:leading-[1.35]" : "text-[15px] leading-6"}`}>
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
      <div className="flex flex-col gap-2 border-b border-ink/10 pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <h2 id="picks-heading" className="font-serif text-[1.9rem] italic leading-none tracking-[-0.02em] text-ink sm:text-[2.4rem]">
          LineUp Picks
        </h2>
        <p className="text-xs leading-5 text-neutral-500 sm:max-w-[14rem] sm:text-right">Chosen by our team for their work. Nobody pays to be here.</p>
      </div>
      <div className={`-mx-4 mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-8 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${picks.length === 1 ? "sm:grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"} [&::-webkit-scrollbar]:hidden`}>
        {picks.slice(0, 3).map((pick, index) => (
          <PickCardView key={pick.id} pick={pick} index={index} solo={picks.length === 1} />
        ))}
      </div>
    </section>
  );
}
