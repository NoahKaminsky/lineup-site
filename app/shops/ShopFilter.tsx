"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, Star, Users } from "lucide-react";
import { Photo } from "@/app/components/Photo";
import type { ShopCard } from "./page";

// Search by shop name or city, and narrow by what they do.

const chip = "inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors duration-150";

export default function ShopFilter({ shops, labels }: { shops: ShopCard[]; labels: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState<string | null>(null);

  const trades = useMemo(() => Array.from(new Set(shops.flatMap((s) => s.trades))), [shops]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shops.filter(
      (s) =>
        (!trade || s.trades.includes(trade)) &&
        (!q || s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q) || (s.tagline || "").toLowerCase().includes(q))
    );
  }, [shops, query, trade]);

  const byArea = new Map<string, ShopCard[]>();
  for (const s of shown) byArea.set(s.area, [...(byArea.get(s.area) || []), s]);

  return (
    <div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by shop or city"
          aria-label="Search shops"
          className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-[15px] text-ink outline-none ring-1 ring-inset ring-ink/[0.12] focus:ring-2 focus:ring-ink"
        />
      </div>

      {trades.length > 1 ? (
        <nav aria-label="Filter by what they do" className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTrade(null)} className={`${chip} ${!trade ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-ink/10 hover:ring-ink/30"}`}>
            All shops
          </button>
          {trades.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrade(t)}
              className={`${chip} ${trade === t ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-ink/10 hover:ring-ink/30"}`}
            >
              {labels[t] || t}
            </button>
          ))}
        </nav>
      ) : null}

      {shown.length ? (
        Array.from(byArea.entries()).map(([area, list]) => (
          <section key={area} className="mt-10">
            <h2 className="text-xs font-medium text-neutral-500">{area}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((shop) => (
                <li key={shop.slug}>
                  <Link
                    href={`/shop/${shop.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-ink/[0.07] transition-shadow duration-(--motion-base) ease-premium hover:shadow-[0_12px_36px_-14px_rgba(0,0,0,0.22)]"
                  >
                    {/* The shop's cover (or first photo), with its logo over the corner. */}
                    <div className="relative aspect-[16/9] bg-ink/[0.04]">
                      {shop.cover ? (
                        <Photo
                          src={shop.cover}
                          alt=""
                          width={720}
                          sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-premium group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-5xl font-semibold tracking-[-0.05em] text-ink/[0.08]">
                          {shop.name.slice(0, 1)}
                        </span>
                      )}
                      <span className="absolute -bottom-6 left-5 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-ink text-lg font-semibold text-white ring-4 ring-white">
                        {shop.logo ? <Photo src={shop.logo} alt="" width={128} sizes="48px" className="h-full w-full object-cover" /> : shop.name.slice(0, 1)}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-5 pt-9">
                      <p className="text-lg font-semibold tracking-tight">{shop.name}</p>
                      {shop.rating ? (
                        <p className="mt-1 flex items-center gap-1 text-sm">
                          <Star className="h-3.5 w-3.5 fill-ink text-ink" aria-hidden="true" />
                          <span className="font-medium tabular-nums text-ink">{shop.rating.toFixed(1)}</span>
                          <span className="tabular-nums text-neutral-500">
                            ({shop.reviews} {shop.reviews === 1 ? "review" : "reviews"})
                          </span>
                        </p>
                      ) : null}
                      {shop.tagline ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-neutral-600">{shop.tagline}</p> : null}
                      {shop.trades.length ? (
                        <p className="mt-2 text-sm text-neutral-600">{shop.trades.map((t) => labels[t] || t).join(" · ")}</p>
                      ) : null}
                      <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {shop.area}
                        </span>
                        {shop.teamSize ? (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {shop.teamSize} {shop.teamSize === 1 ? "pro" : "pros"}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="mt-10 text-sm text-neutral-500">No shops match that.</p>
      )}
    </div>
  );
}
