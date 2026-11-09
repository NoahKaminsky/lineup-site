"use client";

// The shop's home. Loads the studio once and keeps it while you move between
// Today, Calendar, Requests, Team, Memberships, Chairs and Settings, so
// switching sections is instant. No studio yet: the setup flow instead.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Link2, Settings as SettingsIcon } from "lucide-react";
import LuLoader from "@/app/components/LuLoader";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { STUDIO_PLANS } from "@/app/lib/plans";
import { studioFetch } from "./studioApi";
import { Button, Notice, Sheet, Tag } from "./ui";
import { PlanPicker } from "./Plans";
import ShopSetup from "./Setup";
import StudioTabs from "./StudioTabs";
import { STUDIO_SECTIONS, StudioContext, studioHref, type StudioContextValue } from "./StudioContext";
import type { NoticeValue, StudioData } from "./types";

const OLD_TABS: Record<string, string> = {
  schedule: "calendar",
  calendar: "calendar",
  team: "team",
  members: "memberships",
  memberships: "memberships",
  chairs: "chairs",
  settings: "settings",
  requests: "requests",
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The invite page stands on its own.
  if (pathname.startsWith("/studio/join")) return <>{children}</>;
  return <StudioShell>{children}</StudioShell>;
}

function StudioShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeValue>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await studioFetch<StudioData>("/api/studio");
    if (res.status === 401) {
      router.push("/login?next=/studio");
      return;
    }
    if (!res.ok) setNotice({ tone: "error", text: res.data.error || "Could not load your studio." });
    else setData(res.data);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    (async () => {
      const user = await getSignedInUser();
      if (!user) {
        router.push("/login?next=/studio");
        return;
      }
      await load();
    })();

    // Links from before sections had their own pages, and Stripe returns.
    const params = new URLSearchParams(window.location.search);
    if (params.get("boosted") === "1") setNotice({ tone: "success", text: "Payment received. Your opening is featured for the next week." });
    else if (params.get("subscribed") === "1") setNotice({ tone: "success", text: "Your studio plan is active." });
    else if (params.get("rent") === "1") setNotice({ tone: "success", text: "Rent payments are set up. They'll come out automatically." });
    else if (params.get("payouts") === "done") setNotice({ tone: "success", text: "Payout details saved." });
    const tab = params.get("tab");
    if (tab && OLD_TABS[tab]) router.replace(studioHref(OLD_TABS[tab]));
    else if (params.toString()) window.history.replaceState({}, "", window.location.pathname);
  }, [load, router]);

  const dismiss = useCallback(() => setNotice(null), []);

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }, []);

  const redirectTo = useCallback(
    async (path: string, body: unknown, key: string) => {
      await run(key, async () => {
        const res = await studioFetch<{ url?: string }>(path, { method: "POST", body });
        if (!res.ok || !res.data.url) {
          setNotice({ tone: "error", text: res.data.error || "Something went wrong." });
          return;
        }
        window.location.assign(res.data.url);
      });
    },
    [run]
  );

  const openPlans = useCallback(() => setPlansOpen(true), []);

  const ctx = useMemo<StudioContextValue | null>(
    () => (data ? { data, busy, run, setNotice, reload: load, redirectTo, openPlans } : null),
    [data, busy, run, load, redirectTo, openPlans]
  );

  if (loading) return <LuLoader />;

  if (!data?.studio || !ctx) {
    return (
      <main className="min-h-screen bg-paper px-4 pb-28 pt-10 text-ink sm:px-6 sm:pt-14 lg:px-8">
        <ShopSetup data={data} busy={busy} run={run} setNotice={setNotice} reload={load} redirectTo={redirectTo} />
        <Notice notice={notice} onDismiss={dismiss} />
      </main>
    );
  }

  const studio = data.studio;
  const me = data.me!;
  // A shop account's main nav already lists the sections.
  const navInHeader = data.role !== "shop";
  const section = pathname.replace(/^\/studio\/?/, "").split("/")[0] || "";
  // Chairs are for managers. A regular member's shop appointments are already
  // on their own Calendar (tagged "Shop"), so the team calendar is for managers.
  const sections = STUDIO_SECTIONS.filter((s) => (s.slug === "chairs" || s.slug === "calendar" ? me.canManage : true));
  const proCount = studio.proCount ?? (data.team || []).filter((m) => m.status === "active").length;

  return (
    <StudioContext.Provider value={ctx}>
      <main className="min-h-screen bg-paper pb-28 text-ink">
        <div className="px-4 pt-7 sm:px-6 sm:pt-9 lg:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] sm:text-[1.75rem]">{studio.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
                {studio.live && studio.plan ? <Tag tone="ink">{STUDIO_PLANS[studio.plan].label}</Tag> : <Tag tone="outline">No plan yet</Tag>}
                <span>
                  {proCount} {proCount === 1 ? "pro" : "pros"}
                  {studio.areaLabel ? `, ${studio.areaLabel}` : ""}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {studio.slug ? <ShareLink slug={studio.slug} /> : null}
              {me.isOwner ? (
                <Link
                  href="/studio/settings"
                  aria-label="Shop settings"
                  aria-current={section === "settings" ? "page" : undefined}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                    section === "settings"
                      ? "bg-ink text-white"
                      : "bg-surface text-neutral-600 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] hover:text-ink"
                  }`}
                >
                  <SettingsIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {navInHeader ? (
          <nav aria-label="Shop" className="sticky top-16 z-30 mt-5 bg-paper/85 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
            <div className="px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl">
                <StudioTabs sections={sections} active={section} />
              </div>
            </div>
          </nav>
        ) : (
          <div className="mt-5" />
        )}

        {/* One line, until the plan is on. Today has the full checklist. */}
        {me.canManage && !studio.live && section !== "" ? (
          <div className="px-4 pt-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-3.5 text-white">
              <p className="text-sm">
                {studio.subscriptionStatus === "past_due"
                  ? "Your last payment didn't go through, so bookings and walk-ins are paused."
                  : "Choose a plan to switch on bookings, walk-ins and chair openings."}
              </p>
              {me.isOwner ? (
                <Button size="sm" className="!bg-white !text-ink" onClick={openPlans}>
                  {studio.subscriptionStatus === "past_due" ? "Fix billing" : "Choose a plan"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="px-4 pt-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>

        <Sheet
          open={plansOpen}
          onClose={() => setPlansOpen(false)}
          title="Choose a plan"
          description="One flat monthly price for the whole shop. Cancel any time."
        >
          <PlanPicker
            stacked
            isOwner={me.isOwner}
            current={studio.live ? studio.plan : null}
            busy={busy}
            onChoose={(plan) => redirectTo("/api/studio/billing", { action: "checkout", plan }, `plan-${plan}`)}
          />
        </Sheet>

        <Notice notice={notice} onDismiss={dismiss} />
      </main>
    </StudioContext.Provider>
  );
}

// The shop's public booking link, kept one tap away.
function ShareLink({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const url = `${typeof window !== "undefined" ? window.location.origin : "https://lineup-aesthetics.ca"}/shop/${slug}`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy your booking page link", url);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} className="max-sm:w-10 max-sm:px-0" aria-label="Booking page">
        <Link2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Booking page</span>
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Your booking page"
          className="lu-pop-in absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_rgba(10,10,10,0.08),0_20px_48px_-16px_rgba(0,0,0,0.35)]"
        >
          <p className="text-sm font-semibold text-ink">Your booking page</p>
          <p className="mt-0.5 text-[13px] leading-5 text-neutral-500">
            Clients pick a pro and book. Put it in your Instagram bio and Google listing.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink/[0.04] py-1.5 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{url.replace(/^https?:\/\//, "")}</span>
            <button
              type="button"
              onClick={copy}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-[13px] font-medium text-ink shadow-[0_0_0_1px_rgba(10,10,10,0.1)] hover:bg-neutral-50"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <a
            href={`/shop/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open it
          </a>
        </div>
      ) : null}
    </div>
  );
}
