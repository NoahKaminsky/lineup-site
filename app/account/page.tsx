import { PAGE_TITLES } from "@/app/lib/pageTitles";
import { redirect } from "next/navigation";
import { getInitialAccountData } from "./getInitialData";
import AccountPageClient from "./AccountPageClient";

export const metadata = { title: PAGE_TITLES["/account"] };

// Server Component wrapper — see app/requests/page.tsx for the pattern.
export default async function AccountPage() {
  const result = await getInitialAccountData();

  if (result.kind === "redirect") {
    redirect(result.to);
  }

  return <AccountPageClient initialData={result.kind === "ok" ? result.data : null} />;
}
