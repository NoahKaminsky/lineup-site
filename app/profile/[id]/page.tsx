import { getInitialProfileDetailData } from "./getInitialData";
import ProfilePageClient from "./ProfilePageClient";

// Server Component wrapper — see app/requests/page.tsx for the pattern.
// Public page (viewable logged out), so there's no redirect case, just
// ok/fallback — a not-found or malformed id falls back to the client's own
// load, which already renders the right "profile not found" message.
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInitialProfileDetailData(id);

  return <ProfilePageClient initialData={result.kind === "ok" ? result.data : null} />;
}
