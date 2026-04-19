"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type NavbarProfile = {
  id: string;
  role: string | null;
  full_name: string | null;
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [profile, setProfile] = useState<NavbarProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardOpen, setDashboardOpen] = useState(false);

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
        .select("id, role, full_name")
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
        setDashboardOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setDashboardOpen(false);
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

  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-neutral-200 pb-6">
      <Link href="/" className="text-2xl font-semibold tracking-tight">
        LineUp
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
        >
          Back to site
        </Link>

        {!loading && profile ? (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDashboardOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Dashboard
              <span className="text-xs">{dashboardOpen ? "▲" : "▼"}</span>
            </button>

            {dashboardOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-64 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
                <div className="border-b border-neutral-100 px-4 py-4">
                  <p className="text-sm font-medium text-neutral-900">
                    {profile.full_name || "Your dashboard"}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                    {isProfessional ? "Professional" : isCustomer ? "Customer" : "Account"}
                  </p>
                </div>

                <div className="p-2">
                  {isProfessional ? (
                    <>
                      <Link
                        href="/requests"
                        className={`block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/requests")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Work Hub
                      </Link>

                      <Link
                        href="/discover"
                        className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/discover")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Browse professionals
                      </Link>

                      <Link
                        href="/calendar"
                        className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/calendar")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Calendar
                      </Link>

                      <Link
                        href="/account"
                        className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/account")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Profile
                      </Link>

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
                    </>
                  ) : isCustomer ? (
                    <>
                      <Link
                        href="/requests"
                        className={`block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/requests")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        My Requests
                      </Link>

                      <Link
                        href="/discover"
                        className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/discover")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Browse professionals
                      </Link>

                      <Link
                        href="/account"
                        className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                          isActive("/account")
                            ? "bg-black text-white"
                            : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        Profile
                      </Link>
                    </>
                  ) : (
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
                  )}
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
  );
}