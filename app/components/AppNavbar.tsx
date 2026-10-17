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
  subscription_plan?: string | null;
  subscription_status?: string | null;
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
        <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "work") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M7 8V6.5A2.5 2.5 0 0 1 9.5 4h5A2.5 2.5 0 0 1 17 6.5V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 8h14a2 2 0 0 1 2 2v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5V10a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "calendar") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M7 4v3M17 4v3M4.5 9.5h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "browse") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM20.5 20.5l-4.8-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "services") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M4 7.5h16M4 12h16M4 16.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Phone tab bar. One ink pill slides between tabs; you can also grab it and
// drag across the bar (like Instagram) — it follows your finger and opens the
// tab you let go on. A plain tap behaves like a normal link.
function MobileTabBar({
  items,
  isActive,
  onNavigate,
  onTap,
}: {
  items: NavItem[];
  isActive: (href: string) => boolean;
  onNavigate: (href: string) => void;
  onTap: () => void;
}) {
  const barRef = useRef<HTMLUListElement | null>(null);
  const dragRef = useRef<{ startX: number; dragging: boolean; pointerId: number; lastIndex: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragPos, setDragPos] = useState<number | null>(null);

  const activeIndex = items.findIndex((item) => isActive(item.href));
  const count = items.length;
  const pillPos = dragPos ?? activeIndex;
  const highlighted = dragPos !== null ? Math.round(dragPos) : activeIndex;

  function positionFromPointer(clientX: number) {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const inner = rect.width - 12; // p-1.5 on both sides
    const cell = inner / count;
    const pos = (clientX - rect.left - 6) / cell - 0.5;
    return Math.max(0, Math.min(count - 1, pos));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLUListElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = { startX: event.clientX, dragging: false, pointerId: event.pointerId, lastIndex: activeIndex };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLUListElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (Math.abs(event.clientX - drag.startX) < 8) return;
      drag.dragging = true;
      barRef.current?.setPointerCapture(event.pointerId);
    }
    const pos = positionFromPointer(event.clientX);
    const index = Math.round(pos);
    if (index !== drag.lastIndex) {
      drag.lastIndex = index;
      try { navigator.vibrate?.(6); } catch {}
    }
    setDragPos(pos);
  }

  function endDrag(event: React.PointerEvent<HTMLUListElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !drag.dragging) return;
    suppressClickRef.current = true;
    const index = Math.round(positionFromPointer(event.clientX));
    setDragPos(null);
    const target = items[index];
    if (target && index !== activeIndex) onNavigate(target.href);
  }

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:hidden">
      <ul
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragPos(null);
        }}
        onClickCapture={(event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        className="relative mx-auto grid max-w-md touch-pan-y select-none rounded-[26px] bg-white/80 p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_10px_36px_-10px_rgba(0,0,0,0.3)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {/* The sliding pill. */}
        {pillPos >= 0 ? (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 rounded-[20px] bg-ink shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)] ${
              dragPos !== null ? "scale-[1.04]" : "transition-[transform,scale] duration-[420ms] ease-[cubic-bezier(0.2,0.9,0.2,1.15)]"
            }`}
            style={{
              width: `calc((100% - 12px) / ${count})`,
              transform: `translateX(${pillPos * 100}%)`,
            }}
          />
        ) : null}

        {items.map((item, index) => {
          const lit = index === highlighted;
          return (
            <li key={item.href} className="relative">
              <Link
                href={item.href}
                prefetch
                onClick={onTap}
                draggable={false}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`flex min-h-[54px] flex-col items-center justify-center gap-[3px] rounded-[20px] transition-colors duration-200 ${
                  lit ? "text-white" : "text-neutral-500 active:text-ink"
                }`}
              >
                <NavIcon icon={item.icon} />
                <span className="max-w-full truncate px-0.5 text-[10.5px] font-medium leading-none tracking-[-0.01em]">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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
  // Bumps each time a fetch finds MORE unread than before (not on first load),
  // which re-keys the bell and badge so they ring / pop once per arrival.
  const [bellPulse, setBellPulse] = useState(0);
  const unreadRef = useRef<number | null>(null);
  useEffect(() => {
    unreadRef.current = unreadCount;
  }, [unreadCount]);
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
          .select("id, role, full_name, avatar_url, is_admin, subscription_plan, subscription_status")
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

    const next = count || 0;
    if (unreadRef.current !== null && next > unreadRef.current) setBellPulse((n) => n + 1);
    unreadRef.current = next;
    setUnreadCount(next);
  }, [profile]);

  const fetchNotifItems = useCallback(async () => {
    if (!profile?.id) return;

    setNotifLoading(true);

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: notifs } = await supabase
      .from("notifications")
      .select("id, title, is_read, created_at, request_id, booking_id")
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
      booking_id: string | null;
    }) => {
      const reqTitle = n.request_id ? reqTitleMap.get(n.request_id) : null;
      return {
        id: n.id,
        href: n.booking_id
          ? `/bookings/${n.booking_id}`
          : n.request_id
          ? `/requests/${n.request_id}`
          : "/requests",
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

  // Escape closes whichever menu is open (keyboard users shouldn't need a click-outside).
  useEffect(() => {
    if (!accountMenuOpen && !notifPanelOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setNotifPanelOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [accountMenuOpen, notifPanelOpen]);

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

  // Header badge: a pro's current tier (Apprentice / Pro / Master) while the
  // subscription is live, otherwise "Basic" (so the header reads
  // "LineUp Basic"). Customers get no badge.
  const planBadge = useMemo(() => {
    if (!isProfessional || !profile) return null;
    const live = profile.subscription_status === "active" || profile.subscription_status === "trialing";
    if (live && profile.subscription_plan === "master") return "Master";
    if (live && profile.subscription_plan === "pro") return "Pro";
    if (live && profile.subscription_plan === "apprentice") return "Apprentice";
    return "Basic";
  }, [isProfessional, profile]);

  // Tag the page with the signed-in side (theme.css reads data-role for motion
  // tempo and accent hooks) and remember it so the next load paints correctly.
  useEffect(() => {
    if (loading) return;
    const root = document.documentElement;
    if (hasUser && profile) {
      const side = isProfessional ? "pro" : "customer";
      root.dataset.role = side;
      try { localStorage.setItem("lu-role", side); } catch {}
    } else {
      delete root.dataset.role;
      try { localStorage.removeItem("lu-role"); } catch {}
    }
  }, [loading, hasUser, profile, isProfessional]);

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

  // A section stays highlighted on its sub-pages too (a request detail page is
  // still "Dashboard"; a booking detail page is still "Work").
  function isActive(path: string) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return true;
    return path === "/work" && pathname.startsWith("/bookings/");
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

  const menuItemClass = (active: boolean) =>
    `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
      active ? "bg-neutral-100 font-medium text-ink" : "text-neutral-700 hover:bg-neutral-50 hover:text-ink"
    }`;

  const accountLinks = [
    { href: "/account", label: "Profile", show: true },
    { href: "/work", label: isProfessional ? "Work" : "Bookings", show: true },
    { href: "/archive", label: "Archived services", show: true },
    { href: "/services", label: "Services & availability", show: isProfessional },
    { href: "/analytics", label: "Analytics", show: isProfessional },
    { href: "/subscription", label: "Subscription", show: isProfessional },
    { href: "/admin", label: "Switch to admin", show: !!profile?.is_admin },
  ].filter((link) => link.show);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/75">
        {/* Padding outside the max-width (same as every page's <main>) so the
            logo lines up exactly with page content. */}
        <div className="px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10">
          <Link
            href={hasUser ? "/requests" : "/"}
            prefetch
            onClick={handleNavClick}
            className="order-1 flex h-16 shrink-0 items-center gap-2 rounded text-xl font-semibold tracking-tight text-ink"
          >
            LineUp
            {hasUser && !loading && planBadge ? (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.02em] ${
                  planBadge === "Basic" ? "text-neutral-500 ring-1 ring-inset ring-ink/10" : "bg-ink text-white"
                }`}
              >
                {planBadge}
              </span>
            ) : null}
          </Link>

          <div className="order-2 ml-auto flex items-center gap-1.5 lg:order-3">
            {hasUser && !loading ? (
              <div className="relative" ref={notifPanelRef}>
                <button
                  type="button"
                  aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                  aria-haspopup="true"
                  aria-expanded={notifPanelOpen}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setNotifPanelOpen((prev) => !prev);
                  }}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                    notifPanelOpen ? "bg-ink/[0.06] text-ink" : "text-neutral-500 hover:bg-ink/[0.04] hover:text-ink"
                  }`}
                >
                  <svg
                    key={`bell-${bellPulse}`}
                    viewBox="0 0 24 24"
                    className={`h-5 w-5 ${bellPulse > 0 ? "lu-bell-ring" : ""}`}
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341A6.002 6.002 0 0 0 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {unreadCount > 0 ? (
                    <span key={`badge-${bellPulse}`} className="animate-notification-pop absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold tabular-nums leading-none text-white ring-2 ring-paper">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </button>

                {notifPanelOpen ? (
                  <div className="lu-pop-in fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.04),0_16px_40px_-12px_rgba(0,0,0,0.22)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-96">
                    <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                      <p className="text-sm font-semibold text-ink">Notifications</p>
                      {unreadNotifItems.length > 0 ? (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="rounded text-xs font-medium text-neutral-500 transition-colors hover:text-ink"
                        >
                          Mark all read
                        </button>
                      ) : null}
                    </div>

                    <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain">
                      {notifLoading && notifItems.length === 0 ? (
                        <div className="space-y-1 p-2" aria-busy="true">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-start gap-3 rounded-lg p-3">
                              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-100" />
                              <div className="flex-1 space-y-2">
                                <div className="h-3 w-3/4 animate-pulse rounded-full bg-neutral-100" />
                                <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : notifItems.length === 0 ? (
                        <div className="px-6 py-10 text-center">
                          <p className="text-sm font-medium text-ink">You&apos;re all caught up</p>
                          <p className="mx-auto mt-1.5 max-w-[16rem] text-xs leading-5 text-neutral-500">
                            {isProfessional
                              ? "You'll be notified here when a new request matches your services."
                              : "When professionals send you offers, they'll show up here."}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNotifPanelOpen(false);
                              router.push(isProfessional ? "/services" : "/requests/new");
                            }}
                            className="mt-5 rounded-full border border-neutral-300 px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-ink"
                          >
                            {isProfessional ? "Set up your services" : "Post a request"}
                          </button>
                        </div>
                      ) : (
                        <ul className="lu-lineup p-1.5">
                          {notifItems.map((item) => (
                            <li key={item.id}>
                              <button
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
                                className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-neutral-50"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                                    item.isRead ? "bg-transparent" : "bg-ink"
                                  }`}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className={`block text-sm leading-snug ${item.isRead ? "text-neutral-500" : "font-medium text-ink"}`}>
                                    {item.label}
                                  </span>
                                  {item.sub ? (
                                    <span className="mt-0.5 block truncate text-xs text-neutral-500">{item.sub}</span>
                                  ) : null}
                                  <span className="mt-1 block text-xs tabular-nums text-neutral-400">{timeAgo(item.createdAt)}</span>
                                </span>
                                {!item.isRead ? <span className="sr-only">Unread</span> : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {loading ? (
              <div className="h-9 w-9 animate-pulse rounded-full bg-neutral-200/70" />
            ) : hasUser ? (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotifPanelOpen(false);
                    setAccountMenuOpen((prev) => !prev);
                  }}
                  className={`ml-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-surface text-xs font-semibold text-ink ring-1 transition-shadow ${
                    accountMenuOpen ? "ring-ink" : "ring-ink/10 hover:ring-ink/30"
                  }`}
                  aria-label="Open account menu"
                  aria-haspopup="true"
                  aria-expanded={accountMenuOpen}
                >
                  {profile?.avatar_url ? (
                    <img loading="lazy"
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    userInitials
                  )}
                </button>

                {accountMenuOpen ? (
                  <div className="lu-pop-in absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.04),0_16px_40px_-12px_rgba(0,0,0,0.22)]">
                    <div className="border-b border-hairline px-4 py-3.5">
                      <p className="truncate text-sm font-semibold text-ink">
                        {profile?.full_name || "Your account"}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                        {isProfessional ? "Professional account" : "Client account"}
                      </p>
                    </div>

                    <nav aria-label="Account" className="p-1.5">
                      {accountLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          prefetch
                          onClick={handleNavClick}
                          aria-current={isActive(link.href) ? "page" : undefined}
                          className={menuItemClass(isActive(link.href))}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </nav>

                    <div className="border-t border-hairline p-1.5">
                      <a href="mailto:lineupmb@gmail.com" className={menuItemClass(false)}>
                        Contact us
                      </a>
                      <button type="button" onClick={handleSignOut} className={`w-full text-left ${menuItemClass(false)}`}>
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
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
              >
                Log in
              </Link>
            )}
          </div>

          {/* Section nav: inline on desktop, its own scrollable row on tablet,
              replaced by the bottom bar on phones. Active = ink + underline
              sitting on the header's hairline, same language as the landing page. */}
          {desktopNavItems.length > 0 ? (
            <nav
              aria-label="Main"
              className="order-3 -mb-px hidden w-full overflow-x-auto [scrollbar-width:none] sm:block lg:order-2 lg:w-auto [&::-webkit-scrollbar]:hidden"
            >
              <ul className="flex min-w-max items-center gap-7">
                {desktopNavItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch
                        onClick={handleNavClick}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex h-12 items-center whitespace-nowrap text-sm transition-colors lg:h-16 ${
                          active ? "font-medium text-ink" : "text-neutral-500 hover:text-ink"
                        }`}
                      >
                        {item.label}
                        <span
                          aria-hidden="true"
                          className={`absolute inset-x-0 bottom-0 h-[1.5px] bg-accent transition-transform duration-300 ease-premium ${
                            active ? "scale-x-100" : "scale-x-0"
                          }`}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : (
            <div className="order-3 hidden h-12 w-full sm:block lg:hidden" />
          )}
        </div>
        </div>
      </header>

      {navItems.length > 0 ? (
        <MobileTabBar items={navItems} isActive={isActive} onNavigate={(href) => { handleNavClick(); router.push(href); }} onTap={handleNavClick} />
      ) : null}
    </>
  );
}

const Navbar = memo(NavbarComponent);

export default Navbar;
