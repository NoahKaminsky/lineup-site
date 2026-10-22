"use client";

import { usePathname } from "next/navigation";
import Navbar from "./AppNavbar";

const HIDE_ON: string[] = ["/", "/login", "/onboarding", "/privacy", "/terms", "/about", "/faq", "/contact"];

export default function NavbarWrapper() {
  const pathname = usePathname();
  if (HIDE_ON.includes(pathname) || pathname === "/news" || pathname.startsWith("/news/") || pathname.startsWith("/auth/") || pathname.startsWith("/admin")) return null;
  return <Navbar />;
}
