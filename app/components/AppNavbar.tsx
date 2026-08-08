"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type NavbarProfile = {
  id: string;
  role: string | null;
  full_name: string | null;
  avatar_url?: string | null;
  is_admin?: boolean | null;
};

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: "dashboard" | "work" | "calendar" | "browse" | "services" | "account";
};

type NotifItem = {
  id: string;
  href: string;
  label: string;
  sub: string;
  isRead: boolean;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

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
  const notifPanelRef = useRef<HTMLDivElement | null>(null);

  const [profile, setProfile] = useState<NavbarProfile | null>(null);
  const [hasUser, setHasUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<NotifItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

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
          .select("id, role, full_name, avatar_url, is_admin")
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

  const fetchUnreadCount = useCallback(async () => {
    if (!profile?.id) return;

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("is_read", false)
      .gte("created_at", cutoff);

    setUnreadCount(count || 0);
  }, [profile]);

  const fetchNotifItems = useCallback(async () => {
    if (!profile?.id) return;

    setNotifLoading(true);

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: notifs } = await supabase
      .from("notifications")
      .select("id, title, is_read, created_at, request_id")
      .eq("user_id", profile.id)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(25);

    if (!notifs) {
      setNotifItems([]);
      setNotifLoading(false);
      return;
    }

    const reqIds = [...new Set(notifs.filter((n: { request_id: string | null }) => n.request_id).map((n: { request_id: string }) => n.request_id))];
    let reqTitleMap = new Map<string, string>();

    if (reqIds.length > 0) {
      const { data: reqs } = await supabase
        .from("service_requests")
        .select("id, title")
        .in("id", reqIds);
      reqTitleMap = new Map((reqs || []).map((r: { id: string; title: string }) => [r.id, r.title]));
    }

    const items: NotifItem[] = notifs.map((n: {
      id: string;
      title: string | null;
      is_read: boolean;
      created_at: string;
      request_id: string | null;
    }) => {
      const reqTitle = n.request_id ? reqTitleMap.get(n.request_id) : null;
      return {
        id: n.id,
        href: n.request_id ? `/requests/${n.request_id}` : "/requests",
        label: n.title || "New notification",
        sub: reqTitle || "",
        isRead: n.is_read,
        createdAt: n.created_at,
      };
    });

    setNotifItems(items);
    setNotifLoading(false);
  }, [profile]);

  const handleMarkAllRead = useCallback(async () => {
    if (!profile?.id) return;

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profile.id)
      .eq("is_read", false);

    setNotifItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, [profile]);

  // Re-fetch count on page navigation
  useEffect(() => {
    fetchUnreadCount();
  }, [pathname, fetchUnreadCount]);

  // Fetch items when panel opens
  useEffect(() => {
    if (notifPanelOpen) {
      fetchNotifItems();
    }
  }, [notifPanelOpen, fetchNotifItems]);

  // Real-time subscription — badge updates the instant a notification row changes
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`navbar-unread-${profile.id}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          fetchUnreadCount();
          if (notifPanelOpen) fetchNotifItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, fetchUnreadCount, fetchNotifItems, notifPanelOpen]);

  // Click-outside: account dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
      if (notifPanelRef.current && !notifPanelRef.current.contains(event.target as Node)) {
        setNotifPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, []);

  useEffect(() => {
    setAccountMenuOpen(false);
    setNotifPanelOpen(false);
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
    setNotifPanelOpen(false);
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
      { href: "/requests", label: "Dashboard", shortLabel: "Home", icon: "dashboard" },
      { href: "/work", label: "Bookings", shortLabel: "Bookings", icon: "calendar" },
      { href: "/discover", label: "Browse", shortLabel: "Browse", icon: "browse" },
      { href: "/account", label: "Account", shortLabel: "You", icon: "account" },
    ];
  }, [loading, hasUser, profile, isProfessional]);

  const desktopNavItems = useMemo<NavItem[]>(() => {
    if (!isProfessional) return navItems;
    return [
      ...navItems,
      { href: "/analytics", label: "Analytics", shortLabel: "Stats", icon: "browse" },
    ];
  }, [navItems, isProfessional]);

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

  const unreadNotifItems = notifItems.filter((n) => !n.isRead);

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
              {hasUser && !loading ? (
                <div className="relative" ref={notifPanelRef}>
                  <button
                    type="button"
                    aria-label="Notifications"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setNotifPanelOpen((prev) => !prev);
                    }}
                    className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341A6.002 6.002 0 0 0 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {unreadCount > 0 ? (
                      <span className="animate-notification-pop absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold leading-none text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {notifPanelOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl sm:w-96">
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                        <p className="text-sm font-semibold text-neutral-900">Notifications</p>
                        {unreadNotifItems.length > 0 ? (
                          <button
                            type="button"
                            onClick={handleMarkAllRead}
                            className="text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
                          >
                            Mark all read
                          </button>
                        ) : null}
                      </div>

                      {/* List */}
                      <div className="max-h-[min(420px,60vh)] overflow-y-auto">
                        {notifLoading ? (
                          <div className="space-y-1 p-2">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="flex items-start gap-3 rounded-xl p-3">
                                <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-100" />
                                <div className="flex-1 space-y-2">
                                  <div className="h-3 w-3/4 animate-pulse rounded-full bg-neutral-100" />
                                  <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : notifItems.length === 0 ? (
                          <div className="px-5 py-8 text-center">
                            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100">
                              <svg viewBox="0 0 24 24" className="h-5 w-5 text-neutral-400" fill="none" aria-hidden="true">
                                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341A6.002 6.002 0 0 0 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                            {isProfessional ? (
                              <>
                                <p className="text-sm font-medium text-neutral-700">No notifications yet</p>
                                <p className="mt-1.5 text-xs leading-5 text-neutral-400">
                                  You'll be notified here when a new request matches your services.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => { setNotifPanelOpen(false); router.push("/services"); }}
                                  className="mt-4 rounded-full border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                                >
                                  Set up your services
                                </button>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-medium text-neutral-700">No notifications yet</p>
                                <p className="mt-1.5 text-xs leading-5 text-neutral-400">
                                  When professionals send you offers, they'll show up here.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => { setNotifPanelOpen(false); router.push("/requests/new"); }}
                                  className="mt-4 rounded-full border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                                >
                                  Post a request
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="p-2">
                            {notifItems.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  // Close panel first, then navigate — router.push is explicit so no race condition
                                  setNotifPanelOpen(false);

                                  // Fire-and-forget mark-read (doesn't block navigation)
                                  if (!item.isRead) {
                                    supabase.from("notifications").update({ is_read: true }).eq("id", item.id).then(() => {
                                      setNotifItems((prev) =>
                                        prev.map((n) => n.id === item.id ? { ...n, isRead: true } : n)
                                      );
                                      setUnreadCount((c) => Math.max(0, c - 1));
                                    });
                                  }

                                  router.push(item.href);
                                }}
                                className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-neutral-50"
                              >
                                <span
                                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-colors ${
                                    item.isRead ? "bg-neutral-200" : "bg-black"
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm leading-snug ${item.isRead ? "text-neutral-500" : "font-medium text-neutral-900"}`}>
                                    {item.label}
                                  </p>
                                  {item.sub ? (
                                    <p className="mt-0.5 truncate text-xs text-neutral-400">{item.sub}</p>
                                  ) : null}
                                  <p className="mt-1 text-xs text-neutral-400">{timeAgo(item.createdAt)}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {loading ? (
                <div className="h-11 w-11 rounded-full border border-neutral-200 bg-neutral-100" />
              ) : hasUser ? (
                <div className="relative" ref={accountDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifPanelOpen(false);
                      setAccountMenuOpen((prev) => !prev);
                    }}
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
                            isActive("/account") ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-50"
                          }`}
                        >
                          Profile
                        </Link>

                        <Link
                          href="/work"
                          prefetch
                          onClick={handleNavClick}
                          className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                            isActive("/work") ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-50"
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
                              isActive("/services") ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-50"
                            }`}
                          >
                            Services & Availability
                          </Link>
                        ) : null}

                        {isProfessional ? (
                          <Link
                            href="/analytics"
                            prefetch
                            onClick={handleNavClick}
                            className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                              isActive("/analytics") ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-50"
                            }`}
                          >
                            Analytics
                          </Link>
                        ) : null}

                        {isProfessional ? (
                          <Link
                            href="/subscription"
                            prefetch
                            onClick={handleNavClick}
                            className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                              isActive("/subscription") ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-50"
                            }`}
                          >
                            Subscription
                          </Link>
                        ) : null}

                        {profile?.is_admin ? (
                          <Link
                            href="/admin"
                            prefetch
                            onClick={handleNavClick}
                            className={`mt-1 block rounded-xl px-3 py-3 text-sm font-medium transition ${
                              isActive("/admin") ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-50"
                            }`}
                          >
                            Switch to Admin
                          </Link>
                        ) : null}
                      </div>

                      <div className="border-t border-neutral-100 p-2">
                        <a
                          href="mailto:lineupmb@gmail.com"
                          className="block rounded-xl px-3 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                        >
                          Contact us
                        </a>
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
                {desktopNavItems.map((item) => (
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
        <nav className="fixed inset-x-0 bottom-0 z-50 transform-gpu px-4 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] will-change-transform sm:hidden">
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
                      <span className={`transition-transform duration-300 ${active ? "scale-110" : "scale-100"}`}>
                        <NavIcon icon={item.icon} />
                      </span>

                      <span
                        className={`text-[10px] font-semibold leading-none tracking-tight transition-all duration-300 ${
                          active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-70"
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
      ) : null}
    </>
  );
}

const Navbar = memo(NavbarComponent);

export default Navbar;
