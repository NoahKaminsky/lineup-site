// Server-only helpers for shop accounts: the shop's address and trades, and
// whether the owner (or a manager) takes clients themselves.

import type { getServiceSupabase } from "./serverSupabase";
import { PROFESSION_LABELS } from "./verificationRules";
import { areaFromAddress } from "./chairs";
import { syncStudioMemberPlans } from "./studios";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export type ShopPlaceInput = {
  address: string;
  place_id: string | null;
  lat: number;
  lng: number;
  area_label: string | null;
};

// { address, placeId, lat, lng } from the address picker.
export function parsePlace(value: unknown): ShopPlaceInput | null | "invalid" {
  if (value === null) return null;
  if (!value || typeof value !== "object") return "invalid";
  const v = value as Record<string, unknown>;
  const address = typeof v.address === "string" ? v.address.trim().slice(0, 300) : "";
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return "invalid";
  return {
    address,
    place_id: typeof v.placeId === "string" ? v.placeId.slice(0, 300) : null,
    lat,
    lng,
    area_label: areaFromAddress(address),
  };
}

export function cleanTrades(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((t): t is string => typeof t === "string" && t in PROFESSION_LABELS))].slice(0, 9);
}

// Turn "takes clients" on or off for one member. Turning it on for someone
// with a shop-only account makes them a professional in the trades given.
// Re-syncs the team's plans afterwards, since the count of pros changed.
export async function setTakesClients(
  supabase: ServiceClient,
  opts: { studioId: string; memberId: string; profileId: string; takesClients: boolean; trades: string[] }
): Promise<{ error: string | null }> {
  if (opts.takesClients) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, professional_types")
      .eq("id", opts.profileId)
      .maybeSingle();
    if (profile?.role !== "professional") {
      if (!opts.trades.length) return { error: "Pick what you do so clients can book you." };
      const { error } = await supabase
        .from("profiles")
        .update({ role: "professional", professional_type: opts.trades[0], professional_types: opts.trades })
        .eq("id", opts.profileId);
      if (error) return { error: error.message };
    }
  }

  const { error } = await supabase
    .from("studio_members")
    .update({ takes_clients: opts.takesClients })
    .eq("id", opts.memberId)
    .eq("studio_id", opts.studioId);
  if (error) {
    return {
      error: /takes_clients/.test(error.message)
        ? "Run the latest SQL (20261104_shop_accounts.sql) in Supabase first."
        : error.message,
    };
  }

  await syncStudioMemberPlans(supabase, opts.studioId);
  return { error: null };
}
