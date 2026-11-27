import type { Metadata } from "next";
import type { ReactNode } from "react";
import { studioSectionTitle } from "@/app/lib/pageTitles";

// "Calendar · Studio", "Team · Studio" and so on in the tab.
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: studioSectionTitle(section) };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
