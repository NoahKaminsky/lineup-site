import { cache } from "react";
import type { Metadata } from "next";
import { getInitialProfileDetailData } from "./getInitialData";
import ProfilePageClient from "./ProfilePageClient";

// Shared between the page and its metadata so the profile is only fetched
// once per request.
const loadProfile = cache(getInitialProfileDetailData);

// A shared profile link shows the pro's name (in the tab, in iMessage and
// social previews) instead of just "LineUp".
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await loadProfile(id);
  if (result.kind !== "ok") return { title: "Profile" };

  const { profile } = result.data;
  const name = profile.business_name?.trim() || profile.full_name?.trim();
  if (!name) return { title: "Profile" };

  const description = profile.bio?.trim() || `See ${name}'s work and book on LineUp.`;
  return {
    title: name,
    description,
    openGraph: { title: `${name} on LineUp`, description },
    twitter: { title: `${name} on LineUp`, description },
  };
}

// Server Component wrapper — see app/requests/page.tsx for the pattern.
// Public page (viewable logged out), so there's no redirect case, just
// ok/fallback — a not-found or malformed id falls back to the client's own
// load, which already renders the right "profile not found" message.
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadProfile(id);

  return <ProfilePageClient initialData={result.kind === "ok" ? result.data : null} />;
}
