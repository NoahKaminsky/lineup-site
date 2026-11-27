import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PAGE_TITLES } from "@/app/lib/pageTitles";
import StudioShell from "./StudioShell";

// A server layout only so the tab can say "Studio"; everything else lives in
// StudioShell, which runs in the browser.
// A plain title here would stop the root's " — LineUp" ending from reaching
// the sections below, so pass the same pattern on.
export const metadata: Metadata = { title: { absolute: `${PAGE_TITLES["/studio"]} — LineUp`, template: "%s — LineUp" } };

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
