import type { Metadata } from "next";
import { PAGE_TITLES } from "@/app/lib/pageTitles";

// The page itself runs in the browser, which can't set the tab title.
export const metadata: Metadata = { title: PAGE_TITLES["/onboarding"] };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
