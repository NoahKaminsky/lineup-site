import { redirect } from "next/navigation";
import { getInitialVerificationData } from "./getInitialData";
import VerificationPageClient from "./VerificationPageClient";

// Server Component wrapper — see app/requests/page.tsx for the pattern this
// follows. Fetches the signed-in professional's profile + submission history
// server-side so a cold load already shows real status instead of a
// skeleton.
export default async function VerificationPage() {
  const result = await getInitialVerificationData();

  if (result.kind === "redirect") {
    redirect(result.to);
  }

  return <VerificationPageClient initialData={result.kind === "ok" ? result.data : null} />;
}
