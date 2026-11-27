import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign as Instagram, CalendarCheck, Check, Gift, Globe, MapPin, Navigation, Phone, ShieldCheck } from "lucide-react";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { PROFESSION_LABELS, isVerifiedNow } from "@/app/lib/verificationRules";
import { getProfileHref } from "@/app/lib/profileLink";
import { isStudioLive } from "@/app/lib/studios";
import { getBookingWindows } from "@/app/lib/busyTimes";
import ShopBooking from "./ShopBooking";
import ShopMemberships from "./ShopMemberships";
import ShopGallery from "./ShopGallery";
import ShopShare from "./ShopShare";
import ShopReviews, { Stars, type PublicReview } from "./ShopReviews";
import { Photo } from "@/app/components/Photo";
import { DAY_NAMES, cleanHours, combinedHours, openStatus, publicName, reviewSummary, time12 } from "@/app/lib/shopProfile";
import { shopNow } from "@/app/lib/bookingTime";
import { buttonClass } from "@/app/components/ui";
import { TITLE } from "@/app/components/ui";

// A studio's public booking page: lineup-aesthetics.ca/shop/<slug>.
// One link for the whole shop (for Instagram, Google, the shop window): the
// client sees who's on, picks a pro, a service and an open time, then
// confirms on that pro's calendar (payment, pay-at-shop, sign in). Only
// public profile details and working hours leave the server; booked times
// come from /api/professional/busy-times as bare ranges.

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ShopPro = {
  id: string;
  href: string;
  name: string;
  avatarUrl: string | null;
  professions: string[];
  // Same rule as the pro's own profile: verified, on a live plan, instant
  // booking and public hours on, and works from a fixed place.
  canBookOnline: boolean;
  bookingWindowDays: number;
  // day of week (0 = Sunday) -> [start, end] windows, "HH:MM"
  hours: Record<number, [string, string][]>;
  services: { id: string; name: string; priceLabel: string | null; minutes: number }[];
  defaultMinutes: number;
  // From their own LineUp reviews.
  rating: number | null;
  reviewCount: number;
};

async function loadShop(slug: string) {
  if (!SLUG.test(slug)) return null;
  const supabase = getServiceSupabase();

  const { data: studio } = await supabase
    .from("studios")
    .select("id, name, tagline, owner_id, plan, subscription_status, stripe_account_id, address, area_label, trades, about, cover_url, logo_url, phone, website, instagram, hours, amenities")
    .eq("slug", slug)
    .maybeSingle();
  if (!studio) return null;

  const { data: members } = await supabase
    .from("studio_members")
    .select("*")
    .eq("studio_id", studio.id)
    .eq("status", "active");
  // Only pros who take clients are bookable.
  const ids = ((members || []) as { profile_id: string | null; takes_clients?: boolean | null }[])
    .filter((m) => m.takes_clients !== false)
    .map((m) => m.profile_id)
    .filter(Boolean) as string[];

  const [{ data: profiles }, { data: services }, { data: availability }, windows, { data: proReviews }, { data: photos }, { data: shopReviews }] = await Promise.all([
    ids.length
      ? supabase
          .from("profiles")
          .select(
            "id, username, full_name, avatar_url, professional_type, professional_types, formatted_address, verification_status, verified_until, direct_booking_enabled, public_availability_enabled, service_modes, subscription_plan, subscription_status, default_appointment_duration"
          )
          .in("id", ids)
      : Promise.resolve({ data: [] as never[] }),
    ids.length
      ? supabase
          .from("professional_services")
          .select("id, professional_id, service_name, price, duration_minutes, is_bookable, created_at")
          .in("professional_id", ids)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    ids.length
      ? supabase
          .from("professional_availability")
          .select("professional_id, day_of_week, start_time, end_time, is_active")
          .in("professional_id", ids)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as never[] }),
    getBookingWindows(ids),
    ids.length
      ? supabase.from("professional_reviews").select("professional_id, rating").in("professional_id", ids)
      : Promise.resolve({ data: [] as { professional_id: string; rating: number }[] }),
    supabase.from("studio_photos").select("id, url, caption").eq("studio_id", studio.id).order("sort").order("created_at").limit(30),
    supabase
      .from("studio_reviews")
      .select("id, rating, comment, reply, created_at, reviewer_id")
      .eq("studio_id", studio.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const live = isStudioLive(studio);
  const pros: ShopPro[] = (profiles || [])
    // Same rule as Browse: only verified pros are shown to clients.
    .filter((p) => isVerifiedNow(p))
    .map((p) => {
      const types: string[] =
        Array.isArray(p.professional_types) && p.professional_types.length
          ? p.professional_types
          : p.professional_type
          ? [p.professional_type]
          : [];
      const modes: string[] = Array.isArray(p.service_modes) ? p.service_modes : p.service_modes ? [p.service_modes] : [];
      const onPaidPlan =
        ["apprentice", "pro", "master"].includes(p.subscription_plan || "") &&
        (p.subscription_status === "active" || p.subscription_status === "trialing");
      const hours: Record<number, [string, string][]> = {};
      for (const row of availability || []) {
        if (row.professional_id !== p.id) continue;
        (hours[Number(row.day_of_week)] ||= []).push([String(row.start_time).slice(0, 5), String(row.end_time).slice(0, 5)]);
      }
      const proServices = (services || [])
        .filter((s) => s.professional_id === p.id && s.is_bookable !== false)
        .map((s) => {
          const n = Number(String(s.price ?? "").replace(/[^0-9.]/g, ""));
          return {
            id: s.id,
            name: s.service_name,
            priceLabel: Number.isFinite(n) && n > 0 ? `$${n % 1 ? n.toFixed(2) : n}` : null,
            minutes: Math.max(Number(s.duration_minutes) || 30, 15),
          };
        })
        // Online booking charges or holds against the price, so a service
        // with no price can't be booked here; don't offer it.
        .filter((s) => s.priceLabel !== null);
      return {
        id: p.id,
        href: getProfileHref(p),
        name: p.full_name || "LineUp pro",
        avatarUrl: p.avatar_url,
        professions: types.map((t) => PROFESSION_LABELS[t] || t).slice(0, 3),
        canBookOnline:
          live &&
          onPaidPlan &&
          !!p.direct_booking_enabled &&
          !!p.public_availability_enabled &&
          // Booked here means booked at the shop, for a set service.
          modes.includes("in_shop") &&
          proServices.length > 0 &&
          Object.keys(hours).length > 0,
        bookingWindowDays: windows[p.id] || 56,
        hours,
        services: proServices,
        defaultMinutes: proServices.length
          ? Math.min(...proServices.map((s) => s.minutes))
          : Math.max(Number(p.default_appointment_duration) || 60, 30),
        ...(() => {
          const mine = (proReviews || []).filter((r) => r.professional_id === p.id);
          return { rating: mine.length ? reviewSummary(mine).average : null, reviewCount: mine.length };
        })(),
      };
    })
    // Owner first, then by name.
    .sort((a, b) => (a.id === studio.owner_id ? -1 : b.id === studio.owner_id ? 1 : a.name.localeCompare(b.name)));

  const owner = (profiles || []).find((p) => p.id === studio.owner_id);
  const address =
    studio.address ||
    owner?.formatted_address ||
    (profiles || []).find((p) => p.formatted_address)?.formatted_address ||
    null;

  // Reviews: public first name and last initial only.
  const reviewerIds = [...new Set((shopReviews || []).map((r) => r.reviewer_id as string))];
  const { data: people } = reviewerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", reviewerIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const names = new Map((people || []).map((x) => [x.id as string, publicName(x.full_name as string | null)]));
  const reviews: PublicReview[] = (shopReviews || []).map((r) => ({
    id: r.id as string,
    rating: r.rating as number,
    comment: (r.comment as string | null) || null,
    reply: (r.reply as string | null) || null,
    created_at: r.created_at as string,
    reviewer: names.get(r.reviewer_id as string) || "LineUp client",
  }));
  // The shop's own hours, or the team's working hours combined.
  const ownHours = cleanHours(studio.hours ?? null).hours;
  const hours = ownHours && Object.keys(ownHours).length ? ownHours : combinedHours(pros.map((x) => x.hours));

  return { studio, pros, address, live, photos: photos || [], reviews, hours, hoursAreTeams: !ownHours };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug).catch(() => null);
  if (!shop) return { title: "Shop not found" };
  const cover = shop.studio.cover_url || shop.photos[0]?.url;
  return {
    title: `${shop.studio.name}${shop.studio.area_label ? `, ${shop.studio.area_label}` : ""} | Book on LineUp`,
    description: shop.studio.tagline || shop.studio.about?.slice(0, 160) || `Book with the team at ${shop.studio.name} on LineUp.`,
    openGraph: cover ? { images: [cover] } : undefined,
  };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await loadShop(slug);
  if (!shop) notFound();

  const { studio, pros, address, photos, reviews, hours, hoursAreTeams, live } = shop;
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
  const directionsUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null;
  const summary = reviewSummary(reviews);
  const now = shopNow();
  const dow = new Date(`${now.dateKey}T12:00:00Z`).getUTCDay();
  const status = openStatus(hours, { dow, minutes: now.minutes });
  const cover = studio.cover_url || photos[0]?.url || null;
  const trades = ((studio.trades as string[] | null) || []).map((t) => PROFESSION_LABELS[t] || t).slice(0, 3);
  const amenities = (studio.amenities as string[] | null) || [];
  const giftCards = isStudioLive(studio) && !!studio.stripe_account_id;
  const bookable = pros.some((p) => p.canBookOnline);
  const nav = [
    { id: "book", label: "Book" },
    ...(photos.length ? [{ id: "photos", label: "Photos" }] : []),
    { id: "reviews", label: summary.count ? `Reviews (${summary.count})` : "Reviews" },
    { id: "about", label: "About" },
  ];

  // Search engines: a local business with its address, hours and rating.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: studio.name,
    description: studio.tagline || studio.about || undefined,
    image: cover || undefined,
    address: address || undefined,
    telephone: studio.phone || undefined,
    url: `https://lineup-aesthetics.ca/shop/${slug}`,
    ...(summary.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: summary.average, reviewCount: summary.count } } : {}),
  };

  return (
    <main className="min-h-screen bg-paper pb-24 text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Cover: the shop's own photo, or its first gallery photo. */}
      {cover ? (
        <div className="mx-auto max-w-6xl sm:px-6 sm:pt-6">
          <div className="relative aspect-[16/10] overflow-hidden bg-ink/[0.05] sm:aspect-[21/8] sm:rounded-3xl">
            <Photo src={cover} alt="" width={1600} priority sizes="(min-width: 1152px) 1104px, 100vw" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Who they are */}
        <header className={`relative ${cover ? "" : "pt-8 sm:pt-12"}`}>
          {/* Only the logo overlaps the cover; the name sits below it. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            <div className={`relative h-20 w-20 shrink-0 ${cover ? "-mt-10 sm:-mt-12" : ""} overflow-hidden rounded-[1.4rem] bg-surface shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] ring-4 ring-paper sm:h-24 sm:w-24`}>
              {studio.logo_url ? (
                <Photo src={studio.logo_url} alt={`${studio.name} logo`} width={256} sizes="96px" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-ink text-3xl font-semibold tracking-[-0.04em] text-white">{studio.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="min-w-0 sm:pb-1">
              <h1 className="text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-5xl">{studio.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-neutral-600">
                {summary.count ? (
                  <a href="#reviews" className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
                    <Stars value={summary.average || 0} />
                    <span className="tabular-nums">{summary.average?.toFixed(1)}</span>
                    <span className="font-normal tabular-nums text-neutral-500">({summary.count})</span>
                  </a>
                ) : null}
                {summary.count && (trades.length || studio.area_label) ? <span aria-hidden="true">·</span> : null}
                {trades.length ? <span>{trades.join(", ")}</span> : null}
                {trades.length && studio.area_label ? <span aria-hidden="true">·</span> : null}
                {studio.area_label ? <span>{studio.area_label}</span> : null}
              </p>
            </div>
          </div>

          {studio.tagline ? <p className="mt-4 max-w-2xl text-[17px] leading-7 text-neutral-700">{studio.tagline}</p> : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {status ? (
              <span className="inline-flex items-center gap-2 font-medium text-ink">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.open ? "bg-ink" : "bg-neutral-300"}`} />
                {status.label}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 text-neutral-600">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Verified pros
            </span>
          </div>

          {/* What people do here, one tap each. */}
          {/* Phones: Book now across the top, the rest two to a row. */}
          <div className={`mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap ${bookable ? "[&>*:last-child:nth-child(even)]:col-span-2" : "[&>*:last-child:nth-child(odd)]:col-span-2"}`}>
            {bookable ? (
              <a href="#book" className={buttonClass("primary", "md", "col-span-2 shrink-0")}>
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                Book now
              </a>
            ) : null}
            {directionsUrl ? (
              <a href={directionsUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "shrink-0")}>
                <Navigation className="h-4 w-4" aria-hidden="true" />
                Directions
              </a>
            ) : null}
            {studio.phone ? (
              <a href={`tel:${studio.phone.replace(/[^+\d]/g, "")}`} className={buttonClass("secondary", "md", "shrink-0")}>
                <Phone className="h-4 w-4" aria-hidden="true" />
                Call
              </a>
            ) : null}
            {studio.instagram ? (
              <a href={`https://instagram.com/${studio.instagram}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "shrink-0")}>
                <Instagram className="h-4 w-4" aria-hidden="true" />
                Instagram
              </a>
            ) : null}
            {giftCards ? (
              <Link href={`/gift/shop/${slug}`} className={buttonClass("secondary", "md", "shrink-0")}>
                <Gift className="h-4 w-4" aria-hidden="true" />
                Gift card
              </Link>
            ) : null}
            <ShopShare name={studio.name} />
          </div>
        </header>

        {/* Section links, pinned under the header while scrolling. */}
        <nav aria-label="On this page" className="sticky top-16 z-20 -mx-4 mt-8 border-b border-hairline bg-paper/90 px-4 backdrop-blur-md sm:mx-0 sm:px-0">
          <ul className="flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className="flex h-12 items-center whitespace-nowrap text-sm font-medium text-neutral-600 transition-colors hover:text-ink">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div className="min-w-0 space-y-14">
            <section id="book" aria-label="Book" className="scroll-mt-32">
              {!live ? (
                <p className="mb-6 rounded-2xl bg-surface p-5 text-sm leading-6 text-neutral-600 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
                  Online booking at {studio.name} isn&apos;t open yet. You can still book with a pro on their own profile.
                </p>
              ) : null}
              <ShopBooking pros={pros} slug={slug} />
            </section>

            {photos.length ? (
              <section id="photos" aria-labelledby="photos-title" className="scroll-mt-32">
                <h2 id="photos-title" className="mb-4 text-xl font-semibold tracking-[-0.02em]">
                  Photos
                </h2>
                <ShopGallery photos={photos} shopName={studio.name} />
              </section>
            ) : null}

            <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-32">
              <h2 id="reviews-title" className="mb-4 text-xl font-semibold tracking-[-0.02em]">
                Reviews
              </h2>
              <ShopReviews reviews={reviews} summary={summary} shopName={studio.name} />
            </section>

            <ShopMemberships slug={slug} shopName={studio.name} />
          </div>

          {/* About, hours, where, contact: beside the booking on laptops, after it on phones. */}
          <aside id="about" aria-label={`About ${studio.name}`} className="scroll-mt-32 space-y-4 lg:sticky lg:top-32 lg:self-start">
            {studio.about ? (
              <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
                <h2 className="text-[15px] font-semibold">About</h2>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-neutral-700">{studio.about}</p>
              </div>
            ) : null}

            {Object.keys(hours).length ? (
              <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
                <h2 className="text-[15px] font-semibold">Hours</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <div key={d} className={`flex justify-between gap-4 ${d === dow ? "font-semibold text-ink" : "text-neutral-600"}`}>
                      <dt>{DAY_NAMES[d]}</dt>
                      <dd className="tabular-nums">{hours[d]?.length ? hours[d].map(([a, b]) => `${time12(a)} – ${time12(b)}`).join(", ") : "Closed"}</dd>
                    </div>
                  ))}
                </dl>
                {hoursAreTeams ? <p className="mt-3 text-[12px] text-neutral-500">When the team is working.</p> : null}
              </div>
            ) : null}

            {address || studio.phone || studio.website || studio.instagram ? (
              <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
                <h2 className="text-[15px] font-semibold">Find us</h2>
                <ul className="mt-3 space-y-3 text-sm">
                  {address ? (
                    <li className="flex gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                      <a href={mapsUrl!} target="_blank" rel="noreferrer" className="text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                        {address}
                      </a>
                    </li>
                  ) : null}
                  {studio.phone ? (
                    <li className="flex gap-3">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                      <a href={`tel:${studio.phone.replace(/[^+\d]/g, "")}`} className="text-ink hover:underline">
                        {studio.phone}
                      </a>
                    </li>
                  ) : null}
                  {studio.instagram ? (
                    <li className="flex gap-3">
                      <Instagram className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                      <a href={`https://instagram.com/${studio.instagram}`} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                        @{studio.instagram}
                      </a>
                    </li>
                  ) : null}
                  {studio.website ? (
                    <li className="flex gap-3">
                      <Globe className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                      <a href={studio.website} target="_blank" rel="noreferrer" className="truncate text-ink hover:underline">
                        {studio.website.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {amenities.length ? (
              <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
                <h2 className="text-[15px] font-semibold">Good to know</h2>
                <ul className="mt-3 grid gap-2 text-sm text-neutral-700">
                  {amenities.map((a) => (
                    <li key={a} className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        <p className="mt-16 text-center text-xs text-neutral-500">
          Booking and payment are handled securely by{" "}
          <Link href="/" className="underline underline-offset-2">
            LineUp
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
