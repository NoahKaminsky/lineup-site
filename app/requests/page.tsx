import { redirect } from "next/navigation";
import { getInitialRequestsData } from "./getInitialData";
import RequestsPageClient from "./RequestsPageClient";

// Server Component: does the auth check and the first data fetch with the
// user's own cookie-based session, so the HTML that comes back already has
// real content — no blank skeleton while the client re-does the same auth
// check and fetch chain it used to do alone on mount. See getInitialData.ts
// for exactly what's fetched and why it's structured this way.
//
// RequestsPageClient keeps every bit of existing interactivity, state, and
// the "silent" background refresh unchanged — it just gets seeded from here
// instead of starting empty.
export default async function RequestsPage() {
  const result = await getInitialRequestsData();

  if (result.kind === "redirect") {
    redirect(result.to);
  }

  return (
    <RequestsPageClient
      initialData={result.kind === "ok" ? result.data : null}
      initialUserLocation={result.userLocation}
    />
  );
}
