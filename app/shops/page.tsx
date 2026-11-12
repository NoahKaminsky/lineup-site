import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { isStudioLive } from "@/app/lib/studios";
import { cityForPoint } from "@/app/lib/cities";
import { professionLabel } from "@/app/lib/professions";
import ShopFilter from "./ShopFilter";

// Find a shop: every salon, barbershop and studio taking bookings on LineUp,
// by city. Rebuilt hourly so a new shop shows up without a deploy.

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Find a shop: salons, barbershops and studios",
  description: "Salons, barbershops and beauty studios taking bookings on LineUp. See who works there and book online.",
  alternates: { canonical: "/shops" },
};

export type ShopCard = {
  slug: string;
  name: string;
  tagline: string | null;
  trades: string[];
  area: string;
  citySlug: string | null;
  teamSize: number;
};

async function loadShops(): Promise<ShopCard[]> {
  try {
    const supabase = getServiceSupabase();
    const { data: studios } = await supabase
      .from("studios")
      .select("id, slug, name, tagline, trades, lat, lng, area_label, plan, subscription_status")
      .not("slug", "is", null);
    const live = (studios || []).filter((s) => isStudioLive(s) && s.slug);
    if (!live.length) return [];

    const { data: members } = await supabase
      .from("studio_members")
      .select("studio_id")
      .in(
        "studio_id",
        live.map((s) => s.id)
      )
      .eq("status", "active");
    const team = new Map<string, number>();
    for (const m of members || []) team.set(m.studio_id, (team.get(m.studio_id) || 0) + 1);

    return live
      .map((s) => {
        const city = cityForPoint(s.lat, s.lng);
        return {
          slug: s.slug as string,
          name: s.name || "LineUp shop",
          tagline: s.tagline,
          trades: Array.isArray(s.trades) ? s.trades : [],
          // Only the city or area, never the street address.
          area: city ? `${city.name}, ${city.province}` : s.area_label || "Canada",
          citySlug: city?.slug || null,
          teamSize: team.get(s.id) || 0,
        };
      })
      .sort((a, b) => a.area.localeCompare(b.area) || b.teamSize - a.teamSize || a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Find a shop: could not load shops", error);
    return [];
  }
}

export default async function ShopsPage() {
  const shops = await loadShops();

  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Find a shop"
        title={
          <>
            Salons, barbershops and studios.
            <span className="block text-neutral-400">Book the shop, pick your pro.</span>
          </>
        }
        subtitle="Every shop here takes bookings on LineUp. Open one to see who works there, their services and open times, and book online."
      />

      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {shops.length ? (
          <ShopFilter shops={shops} labels={Object.fromEntries(shops.flatMap((s) => s.trades).map((t) => [t, professionLabel(t)]))} />
        ) : (
          <div className="rounded-3xl bg-white p-8 ring-1 ring-ink/[0.07] sm:p-10">
            <Store className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="mt-4 text-xl font-semibold tracking-[-0.02em]">The first shops are setting up now.</p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-600">
              In the meantime, browse verified pros near you, many of whom work out of a shop.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/beauty" className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800">
                Find a pro
              </Link>
            </div>
          </div>
        )}

        <section className="mt-16 rounded-3xl bg-ink p-7 text-white sm:p-9">
          <p className="text-xs font-medium text-white/60">For shop owners</p>
          <p className="mt-3 max-w-xl text-2xl font-semibold tracking-[-0.03em]">Run a salon, barbershop or studio? Put it on LineUp.</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
            One account for your whole team, one calendar, client requests sent to your shop, and chair openings only pros in
            your trade see.
          </p>
          <Link href="/login?mode=signup" className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-medium text-ink hover:bg-neutral-200">
            Set up your shop
          </Link>
        </section>

        {shops.length ? (
          <p className="mt-10 flex items-center gap-1.5 text-sm text-neutral-500">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Looking for one person? <Link href="/beauty" className="underline decoration-ink/20 underline-offset-4 hover:decoration-ink">Find a pro</Link>
          </p>
        ) : null}
      </div>
    </PublicLayout>
  );
}
