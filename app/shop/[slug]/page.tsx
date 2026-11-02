import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { PROFESSION_LABELS, isVerifiedNow } from "@/app/lib/verificationRules";
import { getProfileHref } from "@/app/lib/profileLink";
import { isStudioLive } from "@/app/lib/studios";
import { getBookingWindows } from "@/app/lib/busyTimes";
import ShopBooking from "./ShopBooking";
import ShopMemberships from "./ShopMemberships";

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
    .select("*")
    .eq("studio_id", studio.id)
    .eq("status", "active");
  // Only pros who take clients are bookable.
  const ids = ((members || []) as { profile_id: string | null; takes_clients?: boolean | null }[])
    .filter((m) => m.takes_clients !== false)
    .map((m) => m.profile_id)
    .filter(Boolean) as string[];

  const [{ data: profiles }, { data: services }, { data: availability }, windows] = await Promise.all([
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
        });
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
      };
    })
    // Owner first, then by name.
    .sort((a, b) => (a.id === studio.owner_id ? -1 : b.id === studio.owner_id ? 1 : a.name.localeCompare(b.name)));

  const owner = (profiles || []).find((p) => p.id === studio.owner_id);
  const { data: place } = await supabase.from("studios").select("address").eq("id", studio.id).maybeSingle();
  const address =
    (place as { address?: string | null } | null)?.address ||
    owner?.formatted_address ||
    (profiles || []).find((p) => p.formatted_address)?.formatted_address ||
    null;

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
    <main className="min-h-screen bg-paper px-4 pb-20 pt-8 text-ink sm:px-6 sm:pt-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-[2.5rem]">{studio.name}</h1>
        {studio.tagline ? <p className="mt-3 max-w-xl text-[15px] leading-7 text-neutral-600">{studio.tagline}</p> : null}
        {address ? (
          <a
            href={mapsUrl!}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-neutral-600 underline decoration-neutral-300 underline-offset-4 hover:text-ink"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {address}
          </a>
        ) : null}

        <ShopBooking pros={pros} />

        <ShopMemberships slug={slug} shopName={studio.name} />

        <p className="mt-12 text-center text-xs text-neutral-500">
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
