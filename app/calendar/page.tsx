import { PAGE_TITLES } from "@/app/lib/pageTitles";
import { redirect } from "next/navigation";
import { getInitialCalendarData } from "./getInitialData";
import CalendarPageClient from "./CalendarPageClient";

export const metadata = { title: PAGE_TITLES["/calendar"] };

// Server Component wrapper — see app/requests/page.tsx for the pattern.
export default async function CalendarPage() {
  const result = await getInitialCalendarData();

  if (result.kind === "redirect") {
    redirect(result.to);
  }

  return <CalendarPageClient initialData={result.kind === "ok" ? result.data : null} />;
}
