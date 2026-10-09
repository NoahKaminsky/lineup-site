import { redirect } from "next/navigation";
import { getInitialWorkData } from "./getInitialData";
import WorkPageClient from "./WorkPageClient";

// Server Component wrapper — see app/requests/page.tsx for the pattern.
export default async function WorkPage() {
  const result = await getInitialWorkData();

  if (result.kind === "redirect") {
    redirect(result.to);
  }

  return <WorkPageClient initialData={result.kind === "ok" ? result.data : null} />;
}
