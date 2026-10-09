import { getInitialDiscoverData } from "./getInitialData";
import DiscoverPageClient from "./DiscoverPageClient";

// Server Component wrapper — see app/requests/page.tsx for the pattern.
// Browse is public (no auth required), so there's no redirect case here,
// just a fetch that either succeeds or falls back to the client's own load.
export default async function DiscoverPage() {
  const result = await getInitialDiscoverData();

  return <DiscoverPageClient initialCards={result.kind === "ok" ? result.cards : null} />;
}
