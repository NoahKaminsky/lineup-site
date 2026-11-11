import type { Metadata } from "next";

// This page is a client component, which can't set its own tab title.
export const metadata: Metadata = { title: "Reset password" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
