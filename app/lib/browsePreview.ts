// "This is you in Explore": the preview card a pro sees on Home until they
// have three photos of their work. Shared by the server's first load of
// /requests and the client, so the card arrives with the page instead of
// pushing it down a moment later.
import type { SupabaseClient } from "@supabase/supabase-js";

export type BrowsePreview = { name: string; trade: string; image: string | null; photos: number };

export type PreviewProfile = {
  full_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  professional_type?: string | null;
  professional_types?: string[] | null;
};

export function browsePreview(
  p: PreviewProfile,
  photos: { image_url: string | null; media_type: string | null }[],
  count: number
): BrowsePreview {
  const firstPhoto = photos.find((row) => row.media_type !== "video")?.image_url ?? null;
  const tradeKey = p.professional_types?.[0] || p.professional_type || "";
  return {
    name: p.full_name || "You",
    trade: tradeKey ? tradeKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Pro",
    image: firstPhoto || p.banner_url || p.avatar_url || null,
    photos: count,
  };
}

export function portfolioPreviewQuery(client: SupabaseClient, userId: string) {
  return client
    .from("professional_portfolio")
    .select("image_url, media_type", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
}
