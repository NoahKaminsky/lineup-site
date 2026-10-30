"use client";

// Memberships: what the shop sells monthly, who's a member, and checking
// members in at the chair.

import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { MEMBERSHIP_FEE_PERCENT } from "@/app/lib/commission";
import { formatCad, studioFetch } from "./studioApi";
import { Avatar, Button, EmptyState, Field, Menu, Section, Segmented, Sheet, Tag, fieldClass, panelClass } from "./ui";
import type { SectionProps } from "./types";

type MembershipsData = {
  canManage: boolean;
  live: boolean;
  payoutsSetUp: boolean;
  monthlyCents: number;
  plans: { id: string; name: string; description: string | null; priceCents: number; visitsPerPeriod: number | null; active: boolean; memberCount: number }[];
  members: {
    id: string;
    name: string;
    avatarUrl: string | null;
    planName: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    renewsOn: string | null;
    visitsUsed: number;
    visitsIncluded: number | null;
    lastVisit: string | null;
  }[];
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function MembershipsView({ data, busy, run, setNotice }: SectionProps) {
  const studio = data.studio!;
  const [info, setInfo] = useState<MembershipsData | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    const res = await studioFetch<MembershipsData>("/api/studio/memberships");
    if (res.ok) setInfo(res.data);
    else setNotice({ tone: "error", text: res.data.error || "Could not load memberships." });
  }, [setNotice]);

  useEffect(() => {
    let cancelled = false;
    studioFetch<MembershipsData>("/api/studio/memberships").then((res) => {
      if (cancelled) return;
      if (res.ok) setInfo(res.data);
      else setNotice({ tone: "error", text: res.data.error || "Could not load memberships." });
    });
    return () => {
      cancelled = true;
    };
  }, [setNotice]);

  async function act(body: Record<string, unknown>, key: string, success: string, method = "POST") {
    await run(key, async () => {
      const res = await studioFetch<{ code?: string }>("/api/studio/memberships", { method, body });
      if (!res.ok) {
        if (res.data.code === "limit_reached" && window.confirm(`${res.data.error} Check them in anyway?`)) {
          const forced = await studioFetch("/api/studio/memberships", { method, body: { ...body, force: true } });
          if (!forced.ok) {
            setNotice({ tone: "error", text: forced.data.error || "Could not check them in." });
            return;
          }
          setNotice({ tone: "success", text: success });
          await reload();
          return;
        }
        setNotice({ tone: "error", text: res.data.error || "Something went wrong." });
        return;
      }
      setNotice({ tone: "success", text: success });
      await reload();
    });
  }

  if (!info) return <div className={`${panelClass} h-48 animate-pulse`} />;

  const query = search.trim().toLowerCase();
  const members = info.members.filter((m) => !query || m.name.toLowerCase().includes(query));
  const blocker = !info.live
    ? "Memberships are included with a studio plan."
    : !info.payoutsSetUp && info.canManage
    ? "Set up shop payouts in Settings first. Membership payments go there."
    : null;

  return (
    <div className="space-y-12">
      <Section
        title="Memberships"
        description="Clients pay monthly by card and it goes to the shop's payout account. Check members in at each visit."
        actions={
          info.canManage && info.live ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New membership
            </Button>
          ) : null
        }
      >
        {blocker ? <p className="mb-5 rounded-xl bg-ink/[0.04] px-4 py-3 text-sm text-neutral-700">{blocker}</p> : null}

        {info.plans.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {info.plans.map((p) => (
              <div key={p.id} className={`${panelClass} flex flex-col p-5 ${p.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{p.name}</p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                      {p.visitsPerPeriod === null ? "Unlimited visits" : `${p.visitsPerPeriod} visits a month`}
                    </p>
                  </div>
                  {info.canManage ? (
                    <Menu
                      label={`Options for ${p.name}`}
                      items={[
                        {
                          label: p.active ? "Stop selling" : "Sell again",
                          onSelect: () =>
                            act(
                              { planId: p.id, active: !p.active },
                              `plan-${p.id}`,
                              p.active ? "Hidden from your page. Current members keep it." : "Back on your booking page.",
                              "PATCH"
                            ),
                        },
                      ]}
                    />
                  ) : null}
                </div>
                <p className="mt-5 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {formatCad(p.priceCents)}
                  <span className="ml-1 text-sm font-normal tracking-normal text-neutral-500">a month</span>
                </p>
                <p className="mt-3 text-[13px] text-neutral-500">
                  {p.memberCount} {p.memberCount === 1 ? "member" : "members"}
                  {p.active ? "" : ", not for sale"}
                </p>
              </div>
            ))}
          </div>
        ) : !blocker ? (
          <EmptyState
            title="No memberships yet"
            body="A monthly membership, like unlimited cuts for $60, brings regulars back and pays the shop every month."
            action={
              info.canManage ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create your first membership
                </Button>
              ) : null
            }
          />
        ) : null}
      </Section>

      {info.plans.length ? (
        <Section
          title="Members"
          description={info.members.length ? `${formatCad(info.monthlyCents)} a month in membership sales, before fees.` : undefined}
          actions={
            info.members.length > 5 ? (
              <label className="relative block">
                <span className="sr-only">Find a member</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a member"
                  className="h-9 w-56 rounded-full bg-surface pl-9 pr-4 text-sm shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] outline-none focus:shadow-[inset_0_0_0_1.5px_#0a0a0a]"
                />
              </label>
            ) : null
          }
        >
          {info.members.length ? (
            <ul className={`${panelClass} divide-y divide-hairline`}>
              {members.map((m) => {
                const atLimit = m.visitsIncluded !== null && m.visitsUsed >= m.visitsIncluded;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3.5 px-5 py-4">
                    <Avatar name={m.name} src={m.avatarUrl} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                        <span className="truncate">{m.name}</span>
                        {m.status === "past_due" ? <Tag tone="signal">Payment failed</Tag> : null}
                        {m.cancelAtPeriodEnd && m.renewsOn ? <Tag tone="outline">Ends {shortDate(m.renewsOn)}</Tag> : null}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                        {m.planName}.{" "}
                        {m.visitsIncluded === null
                          ? `${m.visitsUsed} ${m.visitsUsed === 1 ? "visit" : "visits"} this month`
                          : `${m.visitsUsed} of ${m.visitsIncluded} visits used`}
                        {m.lastVisit ? `. Last in ${shortDate(m.lastVisit)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={atLimit ? "secondary" : "primary"}
                        loading={busy === `checkin-${m.id}`}
                        onClick={() => act({ action: "checkin", membershipId: m.id }, `checkin-${m.id}`, `${m.name} checked in.`)}
                      >
                        Check in
                      </Button>
                      {info.canManage && !m.cancelAtPeriodEnd ? (
                        <Menu
                          label={`Options for ${m.name}`}
                          items={[
                            {
                              label: "Cancel membership",
                              danger: true,
                              onSelect: () => {
                                if (window.confirm(`Cancel ${m.name}'s membership? It ends when their current month is up.`)) {
                                  void act({ action: "cancel", membershipId: m.id }, `cancel-${m.id}`, "Cancelled. It ends at the end of their month.");
                                }
                              },
                            },
                          ]}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="No members yet"
              body={
                studio.slug
                  ? `Clients join from your booking page at lineup-aesthetics.ca/shop/${studio.slug}. Mention it at the chair.`
                  : "Clients join from your booking page."
              }
            />
          )}
        </Section>
      ) : null}

      <NewMembershipSheet
        open={creating}
        busy={busy}
        run={run}
        setNotice={setNotice}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          setNotice({ tone: "success", text: "Membership created. Clients can join from your booking page." });
          await reload();
        }}
      />
    </div>
  );
}

function NewMembershipSheet({
  open,
  busy,
  run,
  setNotice,
  onClose,
  onCreated,
}: {
  open: boolean;
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [visits, setVisits] = useState<"unlimited" | "set">("unlimited");
  const [count, setCount] = useState("2");
  const [description, setDescription] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run("create-plan", async () => {
      const res = await studioFetch("/api/studio/memberships", {
        method: "POST",
        body: {
          action: "create_plan",
          name,
          description,
          priceCents: Math.round(Number(price) * 100),
          visitsPerPeriod: visits === "unlimited" ? null : Number(count),
        },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not create it." });
        return;
      }
      setName("");
      setPrice("");
      setDescription("");
      await onCreated();
    });
  }

  const cents = Math.round(Number(price || 0) * 100);
  const shopGets = cents > 0 ? cents - Math.round(cents * (MEMBERSHIP_FEE_PERCENT / 100)) : 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New membership"
      description="Billed to the client's card every month. They can cancel any time."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="membership-form" loading={busy === "create-plan"}>
            Create membership
          </Button>
        </>
      }
    >
      <form id="membership-form" onSubmit={submit} className="space-y-5">
        <Field label="Name" htmlFor="m-name">
          <input id="m-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Unlimited cuts" className={fieldClass} />
        </Field>
        <Field
          label="Price a month"
          htmlFor="m-price"
          hint={shopGets ? `The shop gets ${formatCad(shopGets)} of each payment. LineUp keeps ${MEMBERSHIP_FEE_PERCENT}%, card processing included.` : `LineUp keeps ${MEMBERSHIP_FEE_PERCENT}% of each payment, card processing included.`}
        >
          <div className="relative w-40">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
            <input
              id="m-price"
              required
              type="number"
              inputMode="decimal"
              min={5}
              max={1000}
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`${fieldClass} pl-7 tabular-nums`}
            />
          </div>
        </Field>
        <Field label="Visits included">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Visits included"
              value={visits}
              onChange={setVisits}
              options={[
                { value: "unlimited", label: "Unlimited" },
                { value: "set", label: "A set number" },
              ]}
            />
            {visits === "set" ? (
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  aria-label="Visits a month"
                  className={`${fieldClass} h-9 w-20 tabular-nums`}
                />
                a month
              </label>
            ) : null}
          </div>
        </Field>
        <Field label="What's included" htmlFor="m-desc" optional>
          <input
            id="m-desc"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any haircut or beard trim, with any barber"
            className={fieldClass}
          />
        </Field>
      </form>
    </Sheet>
  );
}
