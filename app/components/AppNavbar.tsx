"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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

function NavbarComponent() {
  const router = useRouter();
  const pathname = usePathname();
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);

  const [profile, setProfile] = useState<NavbarProfile | null>(null);
  const [hasUser, setHasUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (!user) {
          setHasUser(false);
          setProfile(null);
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("id, role, full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        if (!mounted) return;

        setHasUser(true);

        if (data) {
          setProfile(data as NavbarProfile);
        } else {
          setProfile({
            id: user.id,
            role: null,
            full_name:
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              user.email ||
              "Your account",
            avatar_url: null,
          });
        }
      } catch (error) {
        console.error("Navbar profile load failed:", error);
        if (mounted) {
          setHasUser(false);
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!accountDropdownRef.current) return;

      if (!accountDropdownRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await supabase.auth.signOut();

    setHasUser(false);
    setProfile(null);
    setAccountMenuOpen(false);

    router.push("/");
  }

  function handleNavClick() {
    setAccountMenuOpen(false);

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  const role = profile?.role || null;

  const isProfessional =
    role === "professional" ||
    role === "I am a professional" ||
    (!!role && role !== "customer" && role !== "I am a customer");

  const navItems = useMemo<NavItem[]>(() => {
    if (loading || !hasUser || !profile) return [];

    if (isProfessional) {
      return [
        { href: "/requests", label: "Dashboard" },
        { href: "/work", label: "Work" },
        { href: "/calendar", label: "Calendar" },
        { href: "/discover", label: "Browse" },
        { href: "/services", label: "Services" },
      ];
    }

    return [
      { href: "/requests", label: "Dashboard" },
      { href: "/work", label: "My Services" },
      { href: "/discover", label: "Browse" },
      { href: "/account", label: "Account" },
    ];
  }, [loading, hasUser, profile, isProfessional]);

  function isActive(path: string) {
    return pathname === path;
  }

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
    <div className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 px-6 py-6 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={hasUser ? "/requests" : "/"}
            prefetch
            onClick={handleNavClick}
            className="shrink-0 text-2xl font-semibold tracking-tight"
          >
            LineUp
          </Link>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-11 w-11 rounded-full border border-neutral-200 bg-neutral-100" />
            ) : hasUser ? (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-neutral-300 bg-white text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
                  aria-label="Open account menu"
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name || "Profile"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    userInitials
                  )}
                </button>

                {accountMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-64 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
                    <div className="border-b border-neutral-100 px-4 py-4">
                      <p className="text-sm font-medium text-neutral-900">
                        {profile?.full_name || "Your account"}
                      </p>

                      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                        {isProfessional ? "Professional" : "Customer"}
                      </p>
                    </div>

                    <div className="p-2">
                      <Link
                        href="/account"
                        prefetch
                        onClick={handleNavClick}
                        className={`block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/account")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Profile
                      </Link>

                      <Link
                        href="/work"
                        prefetch
                        onClick={handleNavClick}
                        className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/work")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        {isProfessional ? "Work" : "My Services"}
                      </Link>

                      {isProfessional ? (
                        <Link
                          href="/services"
                          prefetch
                          onClick={handleNavClick}
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
            ) : (
              <Link
                href="/login"
                prefetch
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Log in
              </Link>
            )}
          </div>
        </div>

        {navItems.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <div className="flex min-w-max items-center gap-3 pb-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  onClick={handleNavClick}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150 ${
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
        ) : (
          <div className="mt-5 h-[41px]" />
        )}
      </div>
    </div>
  );
}

const Navbar = memo(NavbarComponent);

export default Navbar;
