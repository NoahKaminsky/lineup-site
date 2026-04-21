"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type NavbarProfile = {
  id: string;
  role: string | null;
  full_name: string | null;
  avatar_url?: string | null;
};

type NavItem = {
  href: string;
  label: string;
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [profile, setProfile] = useState<NavbarProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, role, full_name, avatar_url")
        .eq("id", user.id)
        .single();

      setProfile((data as NavbarProfile) || null);
      setLoading(false);
    }

    loadProfile();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const role = profile?.role || null;

  const isCustomer = role === "customer" || role === "I am a customer";

  const isProfessional =
    role === "professional" ||
    role === "I am a professional" ||
    (!!role && role !== "customer" && role !== "I am a customer");

  function isActive(path: string) {
    return pathname === path;
  }

  const navItems = useMemo<NavItem[]>(() => {
    if (isProfessional) {
      return [
        { href: "/requests", label: "Dashboard" },
        { href: "/calendar", label: "Calendar" },
        { href: "/discover", label: "Browse" },
        { href: "/services", label: "Services" },
      ];
    }

    if (isCustomer) {
      return [
        { href: "/requests", label: "Dashboard" },
        { href: "/discover", label: "Browse" },
        { href: "/account", label: "Account" },
      ];
    }

    return [{ href: "/account", label: "Account" }];
  }, [isProfessional, isCustomer]);

  const userInitials =
    profile?.full_name
      ?.trim()
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <div className="mx-auto max-w-6xl border-b border-neutral-200 pb-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={profile ? "/requests" : "/"}
          className="shrink-0 text-2xl font-semibold tracking-tight"
        >
          LineUp
        </Link>

        <div className="flex items-center gap-3">
          {!loading && profile ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-neutral-300 bg-white text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
                aria-label="Open account menu"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || "Profile"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  userInitials
                )}
              </button>

              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-64 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
                  <div className="border-b border-neutral-100 px-4 py-4">
                    <p className="text-sm font-medium text-neutral-900">
                      {profile.full_name || "Your account"}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                      {isProfessional
                        ? "Professional"
                        : isCustomer
                          ? "Customer"
                          : "Account"}
                    </p>
                  </div>

                  <div className="p-2">
                    <Link
                      href="/account"
                      className={`block rounded-xl px-3 py-3 text-sm font-medium transition ${
                        isActive("/account")
                          ? "bg-black text-white"
                          : "text-neutral-900 hover:bg-neutral-50"
                      }`}
                    >
                      Profile
                    </Link>

                    {isProfessional ? (
                      <Link
                        href="/services"
                        className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/services")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Services & Availability
                      </Link>
                    ) : null}
                  </div>

                  <div className="border-t border-neutral-100 p-2">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="block w-full rounded-xl px-3 py-3 text-left text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : !loading ? (
            <Link
              href="/login"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Log in
            </Link>
          ) : null}
        </div>
      </div>

      {!loading && profile ? (
        <div className="mt-5 overflow-x-auto">
          <div className="flex min-w-max items-center gap-3 pb-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
                  isActive(item.href)
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}