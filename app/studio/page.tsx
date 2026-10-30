"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import LuLoader from "@/app/components/LuLoader";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { STUDIO_PLANS } from "@/app/lib/plans";
import { studioFetch } from "./studioApi";
import { Button, Notice, Tag, panelClass } from "./ui";
import { NoStudio, PlanPicker } from "./Plans";
import ScheduleView from "./Schedule";
import TeamView from "./Team";
import MembershipsView from "./Memberships";
import ChairsView from "./Chairs";
import SettingsView from "./Settings";
import type { NoticeValue, StudioData } from "./types";

type Tab = "schedule" | "team" | "members" | "chairs" | "settings";
const TABS: Tab[] = ["schedule", "team", "members", "chairs", "settings"];

export default function StudioPage() {
  const router = useRouter();
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("schedule");
  const [notice, setNotice] = useState<NoticeValue>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as Tab | null;
    if (tabParam && TABS.includes(tabParam)) setTab(tabParam);
    if (params.get("boosted") === "1") setNotice({ tone: "success", text: "Payment received. Your opening is featured for the next week." });
    else if (params.get("subscribed") === "1") setNotice({ tone: "success", text: "Your studio plan is active." });
    else if (params.get("rent") === "1") setNotice({ tone: "success", text: "Rent payments are set up. They'll come out automatically." });
    else if (params.get("payouts") === "done") setNotice({ tone: "success", text: "Payout details saved." });
    if (params.toString()) window.history.replaceState({}, "", "/studio");
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

  if (loading) return <LuLoader />;

  if (!data?.studio) {
    return (
      <main className="min-h-screen bg-paper px-4 pb-24 pt-12 text-ink sm:px-6 sm:pt-16 lg:px-8">
        <NoStudio data={data} busy={busy} run={run} setNotice={setNotice} reload={load} />
        <Notice notice={notice} onDismiss={dismiss} />
      </main>
    );
  }

  const studio = data.studio;
  const me = data.me!;
  const activeCount = (data.team || []).filter((m) => m.status === "active").length;
  const sectionProps = { data, busy, run, setNotice, reload: load };

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "schedule", label: "Calendar", show: true },
    { key: "team", label: "Team", show: true },
    { key: "members", label: "Memberships", show: true },
    { key: "chairs", label: "Chair openings", show: me.canManage },
    { key: "settings", label: "Settings", show: me.isOwner },
  ];

  return (
    <main className="min-h-screen bg-paper pb-24 text-ink">
      {/* Studio header */}
      <div className="px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <h1 className="truncate text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[2.75rem]">{studio.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                {studio.live && studio.plan ? <Tag tone="ink">{STUDIO_PLANS[studio.plan].label}</Tag> : <Tag tone="outline">No plan</Tag>}
                <span>
                  {activeCount} {activeCount === 1 ? "pro" : "pros"}
                  {me.role !== "owner" ? `, you're a ${me.role}` : ""}
                </span>
              </div>
            </div>
            {studio.slug ? <ShareLink slug={studio.slug} /> : null}
          </div>

          {/* What needs doing before the studio fully works */}
          {me.canManage && !studio.live ? (
            <div className="mt-10">
              <h2 className="text-lg font-semibold tracking-[-0.02em]">
                {studio.subscriptionStatus === "past_due" ? "Your last payment didn't go through" : "Choose a plan to switch on your studio"}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">
                {studio.subscriptionStatus === "past_due"
                  ? "Your team's plan is paused. Update billing in Settings to switch it back on."
                  : "One flat price for the whole shop. Until then, each pro uses their own plan."}
              </p>
              <div className="mt-5">
                <PlanPicker
                  isOwner={me.isOwner}
                  current={null}
                  busy={busy}
                  onChoose={(plan) => redirectTo("/api/studio/billing", { action: "checkout", plan }, `plan-${plan}`)}
                />
              </div>
              {!me.isOwner ? <p className="mt-3 text-[13px] text-neutral-500">Only the owner can choose the plan.</p> : null}
            </div>
          ) : null}
          {studio.live && !studio.coversTeam && me.canManage ? (
            <div className={`${panelClass} mt-8 flex flex-wrap items-center justify-between gap-4 px-5 py-4`}>
              <p className="max-w-2xl text-sm leading-6 text-neutral-700">
                <span className="font-semibold text-ink">Add one more pro to switch on team benefits.</span> Pro features for everyone
                and no LineUp commission on your own clients start at {studio.minPros} pros.
              </p>
              <Button size="sm" onClick={() => setTab("team")}>
                Invite a pro
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Sections */}
      <nav aria-label="Studio" className="sticky top-16 z-30 mt-8 border-b border-hairline bg-paper/90 backdrop-blur-md">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`relative shrink-0 py-3.5 text-sm font-medium transition-colors ${
                    tab === t.key ? "text-ink" : "text-neutral-500 hover:text-ink"
                  }`}
                >
                  {t.label}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink transition-transform duration-200 ${
                      tab === t.key ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </button>
              ))}
          </div>
        </div>
      </nav>

      <div className="px-4 pt-8 sm:px-6 lg:px-8">
        <div key={tab} className="lu-fade-in mx-auto max-w-6xl">
          {tab === "schedule" ? <ScheduleView {...sectionProps} /> : null}
          {tab === "team" ? <TeamView {...sectionProps} /> : null}
          {tab === "members" ? <MembershipsView {...sectionProps} /> : null}
          {tab === "chairs" && me.canManage ? <ChairsView {...sectionProps} /> : null}
          {tab === "settings" && me.isOwner ? <SettingsView {...sectionProps} redirectTo={redirectTo} /> : null}
        </div>
      </div>

      <Notice notice={notice} onDismiss={dismiss} />
    </main>
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
      <Button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <Link2 className="h-4 w-4" aria-hidden="true" />
        Booking page
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
