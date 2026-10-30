import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { PROFESSION_LABELS, isVerifiedNow } from "@/app/lib/verificationRules";
import { getProfileHref } from "@/app/lib/profileLink";
import { isStudioLive } from "@/app/lib/studios";
import ShopMemberships from "./ShopMemberships";

// A studio's public booking page: lineup-aesthetics.ca/shop/<slug>.
// One link for the whole shop (for Instagram, Google, the shop window): the
// client picks a pro and books on that pro's calendar. Only public profile
// details leave the server.

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type ShopPro = {
  id: string;
  href: string;
  name: string;
  avatarUrl: string | null;
  professions: string[];
  canBookOnline: boolean;
  services: { name: string; price: string | null; minutes: number | null }[];
};

async function loadShop(slug: string) {
  if (!SLUG.test(slug)) return null;
  const supabase = getServiceSupabase();

  const { data: studio } = await supabase
    .from("studios")
    .select("id, name, tagline, owner_id, plan, subscription_status")
    .eq("slug", slug)
    .maybeSingle();
  if (!studio) return null;

  const { data: members } = await supabase
    .from("studio_members")
    .select("profile_id, role")
    .eq("studio_id", studio.id)
    .eq("status", "active");
  const ids = (members || []).map((m) => m.profile_id).filter(Boolean) as string[];

  const [{ data: profiles }, { data: services }] = await Promise.all([
    ids.length
      ? supabase
          .from("profiles")
          .select(
            "id, username, full_name, avatar_url, professional_type, professional_types, formatted_address, verification_status, verified_until, direct_booking_enabled, public_availability_enabled"
          )
          .in("id", ids)
      : Promise.resolve({ data: [] as never[] }),
    ids.length
      ? supabase
          .from("professional_services")
          .select("professional_id, service_name, price, duration_minutes, created_at")
          .in("professional_id", ids)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
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
      return {
        id: p.id,
        href: getProfileHref(p),
        name: p.full_name || "LineUp pro",
        avatarUrl: p.avatar_url,
        professions: types.map((t) => PROFESSION_LABELS[t] || t).slice(0, 3),
        canBookOnline: live && !!p.direct_booking_enabled && !!p.public_availability_enabled,
        services: (services || [])
          .filter((s) => s.professional_id === p.id)
          .slice(0, 3)
          .map((s) => {
            const n = Number(String(s.price ?? "").replace(/[^0-9.]/g, ""));
            return {
              name: s.service_name,
              price: Number.isFinite(n) && n > 0 ? `$${n % 1 ? n.toFixed(2) : n}` : null,
              minutes: Number(s.duration_minutes) || null,
            };
          }),
      };
    })
    // Owner first, then by name.
    .sort((a, b) => (a.id === studio.owner_id ? -1 : b.id === studio.owner_id ? 1 : a.name.localeCompare(b.name)));

  const owner = (profiles || []).find((p) => p.id === studio.owner_id);
  const address = owner?.formatted_address || (profiles || []).find((p) => p.formatted_address)?.formatted_address || null;

  return { studio, pros, address, live };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug).catch(() => null);
  if (!shop) return { title: "Shop not found" };
  return {
    title: `Book at ${shop.studio.name}`,
    description: shop.studio.tagline || `Book with the team at ${shop.studio.name} on LineUp.`,
  };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await loadShop(slug);
  if (!shop) notFound();

  const { studio, pros, address } = shop;
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;

  return (
    <main className="min-h-screen bg-paper px-4 pb-16 pt-8 text-neutral-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Book on LineUp</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{studio.name}</h1>
        {studio.tagline ? <p className="mt-3 max-w-xl text-base leading-7 text-neutral-600">{studio.tagline}</p> : null}
        {address ? (
          <a
            href={mapsUrl!}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-neutral-600 underline decoration-neutral-300 underline-offset-4 hover:text-ink"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {address}
          </a>
        ) : null}

        <h2 className="mt-10 text-lg font-semibold tracking-[-0.02em]">Pick who you&apos;d like to see</h2>

        {pros.length === 0 ? (
          <p className="mt-4 rounded-panel border border-hairline bg-surface p-6 text-sm text-neutral-600">
            The team is still getting set up. Check back soon.
          </p>
        ) : (
          <ul className="lu-lineup mt-4 grid gap-4 sm:grid-cols-2">
            {pros.map((pro) => (
              <li key={pro.id} className="flex flex-col rounded-panel border border-hairline bg-surface p-5">
                <div className="flex items-center gap-3">
                  {pro.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pro.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg font-semibold text-neutral-500"
                    >
                      {pro.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
                      {pro.name}
                      <ShieldCheck className="h-4 w-4 shrink-0 text-ink" aria-label="Verified" />
                    </p>
                    {pro.professions.length ? (
                      <p className="truncate text-sm text-neutral-500">{pro.professions.join(" · ")}</p>
                    ) : null}
                  </div>
                </div>

                {pro.services.length ? (
                  <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                    {pro.services.map((s) => (
                      <li key={s.name} className="flex justify-between gap-3 text-neutral-700">
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 tabular-nums text-neutral-500">
                          {[s.price, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex-1" />
                )}

                <Link
                  href={pro.canBookOnline ? `${pro.href}#availability` : pro.href}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {pro.canBookOnline ? `Book with ${pro.name.split(" ")[0]}` : "View profile"}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ShopMemberships slug={slug} shopName={studio.name} />

        <p className="mt-10 text-center text-xs text-neutral-500">
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
