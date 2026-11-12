import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import { loginHref } from "@/app/lib/returnTo";
import { professionLabel } from "@/app/lib/professions";
import { TRADES, type City, type Trade } from "@/app/lib/cities";
import type { LocalPro, LocalShop } from "@/app/lib/localPros";

// One city page, optionally narrowed to a trade. Server-rendered so search
// engines see the pros listed; everything here is public profile info.

const chip =
  "inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors duration-150";

export default function LocalPage({
  city,
  trade,
  pros,
  shops,
  tradesHere,
}: {
  city: City;
  trade: Trade | null;
  pros: LocalPro[];
  shops: LocalShop[];
  tradesHere: Trade[];
}) {
  const what = trade ? trade.plural : "Beauty and grooming pros";
  const requestHref = loginHref("/requests/new", "signup");

  return (
    <PublicLayout>
      <PageIntro
        eyebrow={`${city.name}, ${city.province}`}
        title={
          <>
            {what} in {city.name}.
            <span className="block text-neutral-400">Verified, and bookable on LineUp.</span>
          </>
        }
        subtitle={
          pros.length
            ? `Every ${trade ? trade.singular : "pro"} below has been verified by LineUp. Look through their work and reviews, book them directly, or post what you want and let pros near you send you offers.`
            : `There are no verified ${trade ? trade.plural.toLowerCase() : "pros"} listed in ${city.name} yet. Post what you want anyway: pros near you are alerted when a new request comes in.`
        }
      />

      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {tradesHere.length > 1 || trade ? (
          <nav aria-label="Filter by trade" className="flex flex-wrap gap-2">
            <Link
              href={`/beauty/${city.slug}`}
              className={`${chip} ${!trade ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-ink/10 hover:ring-ink/30"}`}
            >
              Everyone
            </Link>
            {tradesHere.map((t) => (
              <Link
                key={t.slug}
                href={`/beauty/${city.slug}/${t.slug}`}
                className={`${chip} ${trade?.slug === t.slug ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-ink/10 hover:ring-ink/30"}`}
              >
                {t.plural}
              </Link>
            ))}
          </nav>
        ) : null}

        {shops.length ? (
          <section className="mt-12">
            <h2 className="text-xs font-medium text-neutral-500">Shops in {city.name}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => (
                <li key={shop.slug}>
                  <Link
                    href={`/shop/${shop.slug}`}
                    className="block h-full rounded-3xl bg-white p-5 ring-1 ring-ink/[0.07] transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]"
                  >
                    <p className="text-lg font-semibold tracking-tight">{shop.name}</p>
                    {shop.tagline ? <p className="mt-1 text-sm text-neutral-600">{shop.tagline}</p> : null}
                    {shop.trades.length ? (
                      <p className="mt-3 text-xs text-neutral-500">{shop.trades.map(professionLabel).join(" · ")}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pros.length ? (
          <section className="mt-12">
            <h2 className="text-xs font-medium text-neutral-500">
              {pros.length} verified {pros.length === 1 ? (trade ? trade.singular : "pro") : trade ? trade.plural.toLowerCase() : "pros"}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pros.map((pro) => (
                <li key={pro.id}>
                  <Link
                    href={pro.href}
                    className="flex h-full items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-ink/[0.07] transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]"
                  >
                    {pro.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pro.avatarUrl}
                        alt=""
                        width={64}
                        height={64}
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-xl font-semibold text-neutral-500">
                        {pro.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{pro.name}</span>
                      <span className="block truncate text-sm text-neutral-600">{pro.professionLabels.join(" · ")}</span>
                      <span className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {city.name}
                        </span>
                        {pro.rating !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                            {pro.rating.toFixed(1)} ({pro.reviewCount})
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-16 grid gap-3 lg:grid-cols-2">
          <div className="rounded-3xl bg-ink p-7 text-white sm:p-9">
            <p className="text-xs font-medium text-white/60">Looking for someone</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
              Post what you want, and {trade ? trade.plural.toLowerCase() : "pros"} near {city.name} send you offers.
            </p>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Add the service, when you&apos;re free and a reference photo. Compare prices and reviews, then book and pay
              securely in the app.
            </p>
            <Link
              href={requestHref}
              className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-neutral-200"
            >
              Post a request
            </Link>
          </div>
          <div className="rounded-3xl bg-white p-7 ring-1 ring-ink/[0.07] sm:p-9">
            <p className="text-xs font-medium text-neutral-500">For pros and shop owners</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
              {trade ? `Are you a ${trade.singular} in ${city.name}?` : `Work in beauty or grooming in ${city.name}?`}
            </p>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              Joining is free. Get verified, and clients near you can find you here and send you requests. Running a
              shop? A Studio account puts your whole team on LineUp.
            </p>
            <Link
              href="/login?mode=signup"
              className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Join LineUp
            </Link>
          </div>
        </section>

        <p className="mt-10 text-sm text-neutral-500">
          Other trades in {city.name}:{" "}
          {TRADES.filter((t) => t.slug !== trade?.slug).map((t, i, list) => (
            <span key={t.slug}>
              <Link href={`/beauty/${city.slug}/${t.slug}`} className="underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                {t.plural.toLowerCase()}
              </Link>
              {i < list.length - 1 ? ", " : "."}
            </span>
          ))}{" "}
          <Link href="/beauty" className="underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
            All cities
          </Link>
        </p>
      </div>
    </PublicLayout>
  );
}
