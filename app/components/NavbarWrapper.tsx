"use client";

import { usePathname } from "next/navigation";
import Navbar from "./AppNavbar";

const HIDE_ON: string[] = ["/", "/login", "/onboarding", "/privacy", "/terms"];

export default function NavbarWrapper() {
  const pathname = usePathname();
  if (HIDE_ON.includes(pathname) || pathname.startsWith("/auth/") || pathname.startsWith("/admin")) return null;
  return <Navbar />;
}
