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
  shortLabel: string;
  icon: "dashboard" | "work" | "calendar" | "browse" | "services" | "account";
};

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  if (icon === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "work") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M7 8V6.5A2.5 2.5 0 0 1 9.5 4h5A2.5 2.5 0 0 1 17 6.5V8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M5 8h14a2 2 0 0 1 2 2v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5V10a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9 12h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "calendar") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M7 4v3M17 4v3M4.5 9.5h15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "browse") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM20.5 20.5l-4.8-4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "services") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M4 7.5h16M4 12h16M4 16.5h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

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
        { href: "/requests", label: "Dashboard", shortLabel: "Home", icon: "dashboard" },
        { href: "/work", label: "Work", shortLabel: "Work", icon: "work" },
        { href: "/calendar", label: "Calendar", shortLabel: "Cal", icon: "calendar" },
        { href: "/discover", label: "Browse", shortLabel: "Browse", icon: "browse" },
        { href: "/services", label: "Services", shortLabel: "Services", icon: "services" },
      ];
    }

    return [
      {
        href: "/requests",
        label: "Dashboard",
        shortLabel: "Home",
        icon: "dashboard",
      },
      {
        href: "/work",
        label: "Bookings",
        shortLabel: "Bookings",
        icon: "calendar",
      },
      {
        href: "/discover",
        label: "Browse",
        shortLabel: "Browse",
        icon: "browse",
      },
      {
        href: "/account",
        label: "Account",
        shortLabel: "You",
        icon: "account",
      },
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
    <>
      <div className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 px-4 py-5 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-6">
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
                          {isProfessional ? "Work" : "Bookings"}
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
            <div className="mt-5 hidden overflow-x-auto sm:block">
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
            <div className="mt-5 hidden h-[41px] sm:block" />
          )}
        </div>
      </div>

      {navItems.length > 0 ? (
        <>
          <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] sm:hidden">
            <div className="mx-auto max-w-md rounded-[2rem] border border-neutral-200 bg-white/92 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
                }}
              >
                {navItems.map((item) => {
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onClick={handleNavClick}
                      className="group relative flex min-h-[58px] items-center justify-center overflow-hidden rounded-[1.5rem] px-2 text-neutral-500 transition active:scale-[0.96]"
                      aria-label={item.label}
                    >
                      <span
                        className={`absolute inset-0 rounded-[1.5rem] transition-all duration-300 ease-out ${
                          active
                            ? "scale-100 bg-black opacity-100 shadow-[0_10px_25px_rgba(0,0,0,0.18)]"
                            : "scale-75 bg-black opacity-0"
                        }`}
                      />

                      <span
                        className={`relative z-10 flex flex-col items-center justify-center gap-1 transition-all duration-300 ${
                          active ? "-translate-y-0.5 text-white" : "text-neutral-500 group-hover:text-neutral-900"
                        }`}
                      >
                        <span
                          className={`transition-transform duration-300 ${
                            active ? "scale-110" : "scale-100"
                          }`}
                        >
                          <NavIcon icon={item.icon} />
                        </span>

                        <span
                          className={`text-[10px] font-semibold leading-none tracking-tight transition-all duration-300 ${
                            active
                              ? "translate-y-0 opacity-100"
                              : "translate-y-1 opacity-70"
                          }`}
                        >
                          {item.shortLabel}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}

const Navbar = memo(NavbarComponent);

export default Navbar;
