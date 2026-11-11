"use client";

// Requests: what makes LineUp different. Clients near the shop post what
// they want; the right pro on the team sends an offer; the client picks one
// and pays through LineUp. Managers see every request that fits someone on
// the team and can pass it to them. Pros see the ones that fit them.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { studioFetch } from "./studioApi";
import { useStudio } from "./StudioContext";
import { Avatar, Button, EmptyState, Menu, Section, Segmented, buttonClass, panelClass } from "./ui";
import { firstName, fromDateKey, isBookable, time12, type TeamMember } from "./types";

export type ShopRequest = {
  id: string;
  title: string;
  description: string | null;
  professions: string[];
  areaLabel: string | null;
  distanceLabel: string | null;
  budget: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  atShop: boolean;
  direct: boolean;
  createdAt: string;
  matches: string[];
  offers: { professionalId: string; status: string | null; price: number | string | null }[];
  passedTo: string[];
};

export function useShopRequests() {
  const { setNotice } = useStudio();
  const [requests, setRequests] = useState<ShopRequest[] | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    studioFetch<{ requests: ShopRequest[] }>("/api/studio/requests").then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setRequests([]);
        if (res.status !== 404) setNotice({ tone: "error", text: res.data.error || "Could not load requests." });
        return;
      }
      setRequests(res.data.requests || []);
    });
    return () => {
      cancelled = true;
    };
  }, [key, setNotice]);

  const refresh = useCallback(() => setKey((k) => k + 1), []);
  return { requests, refresh };
}

function needsOffer(r: ShopRequest) {
  return !r.offers.some((o) => o.status === "pending" || o.status === "accepted");
}

function ago(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function money(value: number | string | null) {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? `$${n % 1 ? n.toFixed(2) : n}` : null;
}

export default function RequestsView() {
  const { data } = useStudio();
  const studio = data.studio!;
  const { requests, refresh } = useShopRequests();
  const [filter, setFilter] = useState<"open" | "offered">("open");

  const list = useMemo(
    () => (requests || []).filter((r) => (filter === "open" ? needsOffer(r) : !needsOffer(r))),
    [requests, filter]
  );
  const openCount = (requests || []).filter(needsOffer).length;
  const offeredCount = (requests || []).length - openCount;
  const trades = (studio.trades || []).length;

  return (
    <Section
      title="Requests"
      description={`Clients${studio.areaLabel ? ` near ${studio.areaLabel}` : " near you"} post what they want. The right pro sends an offer, the client picks one and pays through LineUp.`}
      actions={
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "open", label: `Needs an offer${requests ? ` (${openCount})` : ""}` },
            { value: "offered", label: `Offered${requests ? ` (${offeredCount})` : ""}` },
          ]}
        />
      }
    >
      {requests === null ? (
        <div className={`${panelClass} px-6 py-10 text-center text-sm text-neutral-500`}>Loading requests…</div>
      ) : list.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "No new requests right now" : "No offers out yet"}
          body={
            filter === "open"
              ? `When a client near the shop asks for ${trades ? "what your team does" : "a service your team offers"}, it shows up here and the matching pros get a notification.`
              : "Offers your team sends show up here until the client picks one."
          }
        />
      ) : (
        <div className={`${panelClass} divide-y divide-hairline`}>
          {list.map((r) => (
            <RequestRow key={r.id} request={r} onChanged={refresh} />
          ))}
        </div>
      )}
      <p className="mt-4 text-[13px] leading-5 text-neutral-500">
        New clients from requests are the only bookings LineUp takes a commission on. Your own clients are always 0%.
      </p>
    </Section>
  );
}

export function RequestRow({ request: r, onChanged, compact = false }: { request: ShopRequest; onChanged: () => void; compact?: boolean }) {
  const { data, busy, run, setNotice } = useStudio();
  const me = data.me!;
  const team = (data.team || []).filter(isBookable);
  const byId = new Map(team.map((m) => [m.profileId!, m]));
  const matches = r.matches.map((id) => byId.get(id)).filter(Boolean) as TeamMember[];
  const myId = me.profileId || team.find((m) => m.id === me.memberId)?.profileId || null;
  const iMatch = !!myId && r.matches.includes(myId);
  const iOffered = !!myId && r.offers.some((o) => o.professionalId === myId);
  const passTargets = me.canManage ? matches.filter((m) => m.profileId !== myId && !r.passedTo.includes(m.profileId!)) : [];

  async function pass(pro: TeamMember) {
    await run(`pass-${r.id}`, async () => {
      const res = await studioFetch("/api/studio/requests", { method: "POST", body: { requestId: r.id, professionalId: pro.profileId } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not pass it on." });
        return;
      }
      setNotice({ tone: "success", text: `Passed to ${firstName(pro.name)}. They've been notified.` });
      onChanged();
    });
  }

  const when = [
    r.preferredDate ? fromDateKey(r.preferredDate).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }) : null,
    r.preferredTime ? time12(r.preferredTime) : null,
  ]
    .filter(Boolean)
    .join(" at ");
  const meta = [
    r.professions.join(", "),
    r.distanceLabel || r.areaLabel,
    when ? `Wants ${when}` : null,
    r.budget ? `Budget ${money(r.budget) || r.budget}` : null,
  ].filter(Boolean);

  const status = r.offers.length
    ? r.offers
        .map((o) => {
          const who = firstName(byId.get(o.professionalId)?.name);
          const price = money(o.price);
          if (o.status === "accepted") return `${who}'s offer was accepted`;
          if (o.status === "declined") return `${who}'s offer was declined`;
          return `${who} offered${price ? ` ${price}` : ""}, waiting on the client`;
        })
        .join(". ")
    : r.passedTo.length
    ? `Passed to ${r.passedTo.map((id) => firstName(byId.get(id)?.name)).join(" and ")}`
    : null;

  return (
    <article className={`flex flex-col gap-4 px-5 sm:flex-row sm:items-start sm:justify-between ${compact ? "py-4" : "py-5"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-semibold text-ink">{r.title}</h3>
          <span className="text-xs text-neutral-400">{ago(r.createdAt)}</span>
        </div>
        {meta.length ? <p className="mt-1 text-[13px] leading-5 text-neutral-500">{meta.join(". ")}</p> : null}
        {!compact && r.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-700">{r.description}</p> : null}
        {status ? <p className="mt-2 text-[13px] font-medium text-ink">{status}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {me.canManage && matches.length ? (
          <div className="hidden -space-x-1.5 sm:flex" title={`Fits ${matches.map((m) => firstName(m.name)).join(", ")}`}>
            {matches.slice(0, 3).map((m) => (
              <span key={m.id} className="rounded-full ring-2 ring-surface">
                <Avatar name={m.name} src={m.avatarUrl} size={28} />
              </span>
            ))}
          </div>
        ) : null}
        {iMatch && !iOffered ? (
          <Link href={`/requests/${r.id}/respond`} className={buttonClass("primary", "sm")}>
            Send an offer
          </Link>
        ) : null}
        {passTargets.length === 1 ? (
          <Button size="sm" loading={busy === `pass-${r.id}`} onClick={() => pass(passTargets[0])}>
            Pass to {firstName(passTargets[0].name)}
          </Button>
        ) : passTargets.length > 1 ? (
          <Menu
            label="Pass to"
            trigger="Pass to…"
            items={passTargets.map((m) => ({ label: m.name || "Team member", onSelect: () => pass(m) }))}
          />
        ) : null}
      </div>
    </article>
  );
}
