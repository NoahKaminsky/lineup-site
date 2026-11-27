import { PAGE_TITLES } from "@/app/lib/pageTitles";
import { redirect } from "next/navigation";
import { getInitialRequestDetailData } from "./getInitialData";
import RequestDetailPageClient from "./RequestDetailPageClient";

export const metadata = { title: PAGE_TITLES["/requests/[id]"] };

// Server Component wrapper — see app/requests/page.tsx for the pattern.
export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInitialRequestDetailData(id);

  if (result.kind === "redirect") {
    redirect(result.to);
  }

  return <RequestDetailPageClient initialData={result.kind === "ok" ? result.data : null} />;
}
