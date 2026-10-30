"use client";

// Chair openings the studio has posted, and the pros who want them.

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatBoostPrice } from "@/app/lib/boosts";
import { formatCad, studioFetch } from "./studioApi";
import { Avatar, Button, EmptyState, Field, Menu, Section, Segmented, Sheet, Tag, fieldClass, panelClass, textareaClass } from "./ui";
import type { SectionProps } from "./types";

type Applicant = {
  id: string;
  profileId: string;
  name: string;
  avatarUrl: string | null;
  profileHref: string | null;
  trades: string[];
  verified: boolean;
  message: string | null;
  status: "new" | "invited" | "declined";
  appliedAt: string;
};

type Opening = {
  id: string;
  title: string;
  professions: string[];
  professionLabels: string[];
  arrangement: "booth_rent" | "commission" | "either";
  rentCents: number | null;
  rentInterval: "week" | "month" | null;
  commissionNote: string | null;
  description: string | null;
  availableFrom: string | null;
  areaLabel: string | null;
  status: "open" | "filled" | "closed" | "expired";
  expiresAt: string;
  featured: boolean;
  createdAt: string;
  applicants: Applicant[];
};

const TRADES = [
  { value: "barber", label: "Barber" },
  { value: "hairstylist", label: "Hairstylist" },
  { value: "nail_artist", label: "Nail artist" },
  { value: "lash_artist", label: "Lash artist" },
  { value: "brow_artist", label: "Brow artist" },
  { value: "makeup_artist", label: "Makeup artist" },
  { value: "wax_technician", label: "Wax technician" },
  { value: "body_sugaring", label: "Body sugaring" },
  { value: "other_beauty_professional", label: "Other" },
];

function payTerms(o: Opening) {
  const rent = o.rentCents !== null ? `${formatCad(o.rentCents)} a ${o.rentInterval === "month" ? "month" : "week"}` : null;
  if (o.arrangement === "booth_rent") return rent ? `Booth rent, ${rent}` : "Booth rent";
  if (o.arrangement === "commission") return o.commissionNote ? `Commission, ${o.commissionNote}` : "Commission";
  return `Booth rent${rent ? ` (${rent})` : ""} or commission${o.commissionNote ? ` (${o.commissionNote})` : ""}`;
}

export default function ChairsView({ data, busy, run, setNotice }: SectionProps) {
  const studio = data.studio!;
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [posting, setPosting] = useState(false);

  const reload = useCallback(async () => {
    const res = await studioFetch<{ openings: Opening[] }>("/api/chairs/manage");
    if (!res.ok) setNotice({ tone: "error", text: res.data.error || "Could not load your openings." });
    setOpenings(res.ok ? res.data.openings || [] : []);
  }, [setNotice]);

  useEffect(() => {
    let cancelled = false;
    studioFetch<{ openings: Opening[] }>("/api/chairs/manage").then((res) => {
      if (cancelled) return;
      if (!res.ok) setNotice({ tone: "error", text: res.data.error || "Could not load your openings." });
      setOpenings(res.ok ? res.data.openings || [] : []);
    });
    return () => {
      cancelled = true;
    };
  }, [setNotice]);

  async function patch(body: Record<string, unknown>, key: string, success?: string) {
    await run(key, async () => {
      const res = await studioFetch("/api/chairs/manage", { method: "PATCH", body });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not update it." });
        return;
      }
      if (success) setNotice({ tone: "success", text: success });
      await reload();
    });
  }

  async function invite(a: Applicant) {
    await run(`invite-${a.id}`, async () => {
      const res = await studioFetch("/api/studio/invite", { method: "POST", body: { profileId: a.profileId, applicationId: a.id } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not invite them." });
        return;
      }
      setNotice({ tone: "success", text: `Invite sent to ${a.name}. They join your team when they accept.` });
      await reload();
    });
  }

  async function feature(o: Opening) {
    await run(`feature-${o.id}`, async () => {
      const res = await studioFetch<{ url?: string }>("/api/boosts", { method: "POST", body: { kind: "chair_opening", targetId: o.id } });
      if (!res.ok || !res.data.url) {
        setNotice({ tone: "error", text: res.data.error || "Could not start checkout." });
        return;
      }
      window.location.assign(res.data.url);
    });
  }

  if (!openings) return <div className={`${panelClass} h-48 animate-pulse`} />;

  return (
    <div className="space-y-8">
      <Section
        title="Chair openings"
        description="Only pros in the trades you pick can see these. Nearby ones get a notification when you post."
        actions={
          studio.live ? (
            <Button variant="primary" onClick={() => setPosting(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Post an opening
            </Button>
          ) : null
        }
      >
        {!studio.live ? (
          <p className="rounded-xl bg-ink/[0.04] px-4 py-3 text-sm text-neutral-700">Posting chair openings is included with a studio plan.</p>
        ) : openings.length === 0 ? (
          <EmptyState
            title="No openings posted"
            body="Have an empty chair? Post it and pros in that trade on LineUp hear about it."
            action={
              <Button variant="primary" onClick={() => setPosting(true)}>
                Post an opening
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            {openings.map((o) => {
              const live = o.status === "open";
              const people = o.applicants.filter((a) => a.status !== "declined");
              return (
                <article key={o.id} className={`${panelClass} ${live ? "" : "opacity-70"}`}>
                  <header className="flex flex-wrap items-start justify-between gap-4 px-6 pb-5 pt-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{o.title}</h3>
                        {o.status === "open" ? (
                          o.featured ? <Tag tone="ink">Featured</Tag> : <Tag>Open</Tag>
                        ) : (
                          <Tag tone="outline">{o.status === "filled" ? "Filled" : o.status === "expired" ? "Expired" : "Taken down"}</Tag>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] text-neutral-500">
                        {o.professionLabels.join(", ")}
                        {o.areaLabel ? `. ${o.areaLabel}` : ""}
                        {live ? `. Up until ${new Date(o.expiresAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}` : ""}
                      </p>
                      <p className="mt-2 text-sm font-medium text-ink">{payTerms(o)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {live && !o.featured ? (
                        <Button size="sm" onClick={() => feature(o)} loading={busy === `feature-${o.id}`}>
                          Feature for {formatBoostPrice("chair_opening")}
                        </Button>
                      ) : null}
                      <Menu
                        label={`Options for ${o.title}`}
                        items={
                          live
                            ? [
                                { label: "Mark as filled", onSelect: () => patch({ openingId: o.id, status: "filled" }, `chair-${o.id}`, "Marked as filled.") },
                                { label: "Take down", danger: true, onSelect: () => patch({ openingId: o.id, status: "closed" }, `chair-${o.id}`, "Taken down.") },
                              ]
                            : [{ label: "Repost for 30 days", onSelect: () => patch({ openingId: o.id, status: "open" }, `chair-${o.id}`, "Reposted for another 30 days.") }]
                        }
                      />
                    </div>
                  </header>

                  <div className="border-t border-hairline px-6 py-5">
                    <p className="text-[13px] font-medium text-neutral-500">
                      {people.length ? `${people.length} interested` : "Nobody yet"}
                    </p>
                    {people.length ? (
                      <ul className="mt-3 space-y-2">
                        {people.map((a) => (
                          <li key={a.id} className="flex flex-col gap-3 rounded-xl bg-ink/[0.03] p-4 sm:flex-row sm:items-start">
                            <div className="flex min-w-0 flex-1 gap-3">
                              <Avatar name={a.name} src={a.avatarUrl} size={40} />
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                                  {a.profileHref ? (
                                    <a href={a.profileHref} target="_blank" rel="noreferrer" className="underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                                      {a.name}
                                    </a>
                                  ) : (
                                    a.name
                                  )}
                                  {a.verified ? <Tag tone="outline">Verified</Tag> : null}
                                </p>
                                <p className="text-[13px] text-neutral-500">{a.trades.join(", ")}</p>
                                {a.message ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-700">{a.message}</p> : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {a.status === "invited" ? (
                                <Tag>Invited</Tag>
                              ) : (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => patch({ applicationId: a.id, status: "declined" }, `decline-${a.id}`)}>
                                    Pass
                                  </Button>
                                  <Button size="sm" variant="primary" loading={busy === `invite-${a.id}`} onClick={() => invite(a)}>
                                    Invite to team
                                  </Button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <PostOpeningSheet
        open={posting}
        busy={busy}
        run={run}
        setNotice={setNotice}
        onClose={() => setPosting(false)}
        onPosted={async (notified) => {
          setPosting(false);
          setNotice({
            tone: "success",
            text: notified
              ? `Posted. ${notified} ${notified === 1 ? "pro" : "pros"} nearby in that trade got a notification.`
              : "Posted. Pros in that trade can see it now.",
          });
          await reload();
        }}
      />
    </div>
  );
}

function PostOpeningSheet({
  open,
  busy,
  run,
  setNotice,
  onClose,
  onPosted,
}: {
  open: boolean;
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  onClose: () => void;
  onPosted: (notified: number) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [trades, setTrades] = useState<string[]>([]);
  const [arrangement, setArrangement] = useState<"either" | "booth_rent" | "commission">("either");
  const [rent, setRent] = useState("");
  const [rentInterval, setRentInterval] = useState<"week" | "month">("week");
  const [split, setSplit] = useState("");
  const [from, setFrom] = useState("");
  const [description, setDescription] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trades.length) {
      setNotice({ tone: "error", text: "Pick at least one trade." });
      return;
    }
    await run("post-chair", async () => {
      const res = await studioFetch<{ notified?: number }>("/api/chairs", {
        method: "POST",
        body: {
          title,
          professions: trades,
          arrangement,
          rentCents: rent.trim() === "" ? null : Math.round(Number(rent) * 100),
          rentInterval,
          commissionNote: split,
          availableFrom: from || null,
          description,
        },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not post the opening." });
        return;
      }
      setTitle("");
      setTrades([]);
      setDescription("");
      await onPosted(Number(res.data.notified) || 0);
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Post a chair opening"
      description="Shows your area, never your street address. Stays up for 30 days."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="chair-form" loading={busy === "post-chair"}>
            Post opening
          </Button>
        </>
      }
    >
      <form id="chair-form" onSubmit={submit} className="space-y-5">
        <Field label="Title" htmlFor="c-title">
          <input
            id="c-title"
            required
            minLength={3}
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chair open for an experienced barber"
            className={fieldClass}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-neutral-800">Who it&apos;s for</legend>
          <div className="flex flex-wrap gap-1.5">
            {TRADES.map((t) => {
              const on = trades.includes(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTrades((prev) => (on ? prev.filter((v) => v !== t.value) : [...prev, t.value]))}
                  className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                    on ? "bg-ink text-white" : "bg-surface text-neutral-700 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.14)] hover:bg-neutral-50"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Pay">
          <Segmented
            label="Pay"
            value={arrangement}
            onChange={setArrangement}
            options={[
              { value: "either", label: "Either" },
              { value: "booth_rent", label: "Booth rent" },
              { value: "commission", label: "Commission" },
            ]}
          />
        </Field>

        {arrangement !== "commission" ? (
          <Field label="Rent" htmlFor="c-rent" optional>
            <div className="flex items-center gap-2">
              <div className="relative w-36">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
                <input id="c-rent" type="number" inputMode="decimal" min={0} step="1" value={rent} onChange={(e) => setRent(e.target.value)} className={`${fieldClass} pl-7 tabular-nums`} />
              </div>
              <Segmented
                label="Rent schedule"
                size="sm"
                value={rentInterval}
                onChange={setRentInterval}
                options={[
                  { value: "week", label: "Weekly" },
                  { value: "month", label: "Monthly" },
                ]}
              />
            </div>
          </Field>
        ) : null}

        {arrangement !== "booth_rent" ? (
          <Field label="Commission split" htmlFor="c-split" optional>
            <input id="c-split" maxLength={60} value={split} onChange={(e) => setSplit(e.target.value)} placeholder="You keep 60%" className={fieldClass} />
          </Field>
        ) : null}

        <Field label="Available from" htmlFor="c-from" optional>
          <input id="c-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${fieldClass} w-48`} />
        </Field>

        <Field label="About the chair" htmlFor="c-desc" optional>
          <textarea
            id="c-desc"
            rows={4}
            maxLength={1500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Hours, clientele, what's included (products, parking, front desk), who you're looking for."
            className={textareaClass}
          />
        </Field>
      </form>
    </Sheet>
  );
}
