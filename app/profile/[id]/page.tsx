import { cache } from "react";
import type { Metadata } from "next";
import { profileTitle } from "@/app/lib/pageTitles";
import { getInitialProfileDetailData } from "./getInitialData";
import ProfilePageClient from "./ProfilePageClient";

// Shared by the page and its title, so the profile loads once per visit.
const loadProfile = cache(getInitialProfileDetailData);

// A shared profile link shows the pro's name in the tab and in message
// previews, instead of just "LineUp".
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await loadProfile(id);
  const profile = result.kind === "ok" ? result.data.profile : null;
  const title = profileTitle(profile);
  if (!profile || title === profileTitle(null)) return { title };
  const description = profile.bio?.trim() || `See ${title}'s work and book on LineUp.`;
  return {
    title,
    description,
    openGraph: { title: `${title} on LineUp`, description },
    twitter: { title: `${title} on LineUp`, description },
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
