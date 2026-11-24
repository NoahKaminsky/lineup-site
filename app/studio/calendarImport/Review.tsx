"use client";

// The review: every appointment from the owner's files, matched to a pro,
// with anything worth a look flagged. Nothing is saved here.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CircleCheck, CircleHelp, Clock, History, Loader2, Repeat, UserPlus } from "lucide-react";
import { Button, fieldClass, panelClass } from "../ui";
import { time12 } from "../types";
import { shopNow } from "@/app/lib/bookingTime";
import type { Confidence, ImportRow, SkippedRow, TeamPro } from "@/app/lib/calendarImport/types";
import type { ClashChecker, SaveInputRow } from "./CalendarImport";
import type { SaveSummary } from "./Summary";

type ReviewFile = { id: string; name: string; rows: ImportRow[]; skipped: SkippedRow[] };
type Filter = "all" | "check" | "clash" | "past" | "skipped";
type Row = ImportRow & { past: boolean; clash: string | null; already: boolean };
// The clash checker marks rows that an earlier import already added.
const ALREADY = "__already__";

const PAGE = 60;

function prettyDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-CA")} ${n === 1 ? one : many}`;
}

export default function Review({
  files,
  team,
  teamHref,
  checkClashes,
  overrides,
  setOverrides,
  onBack,
  save,
  onSaved,
}: {
  files: ReviewFile[];
  team: TeamPro[];
  teamHref: string;
  checkClashes: ClashChecker;
  // The owner's changes: row key -> pro id ("" = nobody yet).
  overrides: Record<string, string>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onBack: () => void;
  save: (rows: SaveInputRow[], unmatched: number, onProgress: (done: number, total: number) => void) => Promise<SaveSummary>;
  onSaved: (summary: SaveSummary) => void;
}) {
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [serverClashes, setServerClashes] = useState<Record<string, string> | null>(null);
  const [clashError, setClashError] = useState(false);

  const names = useMemo(() => new Map(team.map((p) => [p.id, p.name])), [team]);
  const now = useMemo(() => shopNow(), []);
  const nowTime = `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;

  // Every row with the owner's changes applied, in date order.
  const base = useMemo(() => {
    const all = files.flatMap((f) => f.rows).map((r) => {
      if (!(r.key in overrides)) return r;
      const proId = overrides[r.key] || null;
      return { ...r, proId, confidence: (proId ? "confident" : "none") as Confidence };
    });
    return all.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }, [files, overrides]);

  // Clashes with what's already on LineUp (asked of the server, read-only).
  const upcomingKeyed = useMemo(
    () =>
      base
        .filter((r) => r.proId && (r.date > now.dateKey || (r.date === now.dateKey && r.end > nowTime)))
        .map((r) => ({ key: r.key, proId: r.proId!, date: r.date, start: r.start, end: r.end })),
    [base, now.dateKey, nowTime]
  );
  const clashRequest = JSON.stringify(upcomingKeyed);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      checkClashes(JSON.parse(clashRequest))
        .then((result) => {
          if (cancelled) return;
          setServerClashes(result);
          setClashError(false);
        })
        .catch(() => {
          if (!cancelled) setClashError(true);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clashRequest, checkClashes]);

  // Clashes inside the files themselves (same pro, overlapping times).
  const rows: Row[] = useMemo(() => {
    const seen = new Map<string, Row[]>();
    return base.map((r) => {
      const past = r.date < now.dateKey || (r.date === now.dateKey && r.end <= nowTime);
      const server = serverClashes?.[r.key] || null;
      const already = server === ALREADY;
      let clash = !past && !already ? server : null;
      if (r.proId && !past) {
        const sameDay = seen.get(`${r.proId}|${r.date}`) || [];
        const twin = sameDay.find((o) => o.start === r.start && o.end === r.end);
        const overlap = sameDay.find((o) => r.start < o.end && r.end > o.start);
        if (!already && twin) clash = clash || "the same appointment, listed twice in your files";
        else if (!already && overlap) clash = clash || "another appointment in your files";
        const row = { ...r, past, clash, already };
        seen.set(`${r.proId}|${r.date}`, [...sameDay, row]);
        return row;
      }
      return { ...r, past, clash, already };
    });
  }, [base, serverClashes, now.dateKey, nowTime]);

  const skipped = files.flatMap((f) => f.skipped.map((s) => ({ ...s, file: f.name })));
  const upcoming = rows.filter((r) => !r.past);
  const matched = upcoming.filter((r) => r.proId);
  const pros = [...new Set(matched.map((r) => r.proId!))];
  const needsCheck = rows.filter((r) => r.confidence !== "confident");
  const unmatched = rows.filter((r) => !r.proId);
  const clashes = rows.filter((r) => r.clash);
  const past = rows.filter((r) => r.past);
  const notOnTeam = [...new Set(unmatched.map((r) => r.staffText?.trim()).filter((s): s is string => !!s && s.length <= 40))];

  const perPro = pros
    .map((id) => ({
      id,
      name: names.get(id) || "Team member",
      count: matched.filter((r) => r.proId === id).length,
      clashes: matched.filter((r) => r.proId === id && r.clash).length,
    }))
    .sort((a, b) => b.count - a.count);

  const visible =
    filter === "check" ? needsCheck : filter === "clash" ? clashes : filter === "past" ? past : filter === "skipped" ? [] : rows;

  // Everything with a team member picked: upcoming ones block time, past
  // ones become client history.
  const toSave: SaveInputRow[] = rows
    .filter((r) => r.proId)
    .map((r) => ({
      key: r.key,
      proId: r.proId!,
      date: r.date,
      start: r.start,
      end: r.end,
      clientName: r.clientName,
      clientPhone: r.clientPhone,
      clientEmail: r.clientEmail,
      service: r.service,
      priceCents: r.priceCents,
    }));

  async function confirm() {
    setSaveError(null);
    setSaving({ done: 0, total: toSave.length });
    try {
      const summary = await save(toSave, unmatched.length, (done, total) => setSaving({ done, total }));
      const byKey = new Map(rows.map((r) => [r.key, r.clientName]));
      summary.skipped = summary.skipped.map((s) => ({ ...s, client: byKey.get(s.key) || null }));
      onSaved(summary);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The import didn't finish, so nothing was added. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  function setPro(key: string, proId: string) {
    setOverrides((o) => ({ ...o, [key]: proId }));
  }

  function applyToUnmatched(proId: string) {
    if (!proId) return;
    setOverrides((o) => {
      const next = { ...o };
      for (const r of unmatched) next[r.key] = proId;
      return next;
    });
  }

  const waiting = upcoming.length - matched.length;
  const headline = matched.length
    ? `We found ${plural(matched.length, "upcoming appointment")} for ${plural(pros.length, "person", "people")} on your team${
        waiting ? `, and ${waiting} we couldn't match yet` : ""
      }. Check them over before we add them.`
    : upcoming.length
    ? `We found ${plural(upcoming.length, "upcoming appointment")}. Tell us whose they are, then check them over.`
    : "There are no upcoming appointments in these files.";

  return (
    <div className="space-y-8">
      <div>
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to your files
        </button>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Check your appointments</h2>
        <p className="mt-1 max-w-2xl text-[15px] leading-7 text-neutral-600">{headline}</p>
        {past.length ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">
            {plural(past.length, "appointment")} already happened. We&apos;ll keep those as client history only, so they won&apos;t block any time.
          </p>
        ) : null}
      </div>

      {perPro.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {perPro.map((p) => (
            <li key={p.id} className={`${panelClass} px-4 py-3.5`}>
              <p className="truncate text-sm font-medium text-ink">{p.name}</p>
              <p className="mt-0.5 text-sm text-neutral-500">
                {plural(p.count, "appointment")}
                {p.clashes ? <span className="text-ink">, {p.clashes} to look at</span> : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {notOnTeam.length ? (
        <div className={`${panelClass} flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center`}>
          <UserPlus className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
          <p className="flex-1 text-sm leading-6 text-neutral-600">
            {notOnTeam.length === 1 ? (
              <>
                <span className="font-medium text-ink">{notOnTeam[0]}</span> isn&apos;t on your team yet.
              </>
            ) : (
              <>
                <span className="font-medium text-ink">{notOnTeam.slice(0, 3).join(", ")}</span>
                {notOnTeam.length > 3 ? ` and ${notOnTeam.length - 3} more` : ""} aren&apos;t on your team yet.
              </>
            )}{" "}
            Invite them and their appointments can go on their own calendar, or pick someone below for now.
          </p>
          <Link href={teamHref} className="text-sm font-medium text-ink underline underline-offset-2">
            Go to Team
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Show" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {(
            [
              ["all", `All ${rows.length}`],
              ["check", `Needs a check ${needsCheck.length}`],
              ["clash", `Clashes ${clashes.length}`],
              ["past", `Past ${past.length}`],
              ["skipped", `Skipped ${skipped.length}`],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => {
                setFilter(value);
                setShown(PAGE);
              }}
              className={`h-11 sm:h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
                filter === value ? "bg-ink text-white" : "bg-ink/[0.05] text-neutral-600 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {unmatched.length ? (
          <label className="flex flex-col gap-1.5 text-sm text-neutral-600 sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0">Give the {unmatched.length} unmatched to</span>
            <select aria-label="Give every unmatched appointment to" value="" onChange={(e) => applyToUnmatched(e.target.value)} className={`${fieldClass} sm:h-10 sm:w-48`}>
              <option value="">Pick someone</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {clashError ? (
        <p className="text-sm text-neutral-500">We couldn&apos;t check for clashes just now. The rest of the preview is still right.</p>
      ) : serverClashes === null && upcomingKeyed.length ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Checking against your calendars…
        </p>
      ) : null}

      {filter === "skipped" ? (
        <SkippedList skipped={skipped} />
      ) : visible.length ? (
        <>
          {/* Phones: one card per appointment, with a big pro picker. */}
          <ul className="space-y-3 md:hidden">
            {visible.slice(0, shown).map((r) => (
              <li key={r.key} className={`${panelClass} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-ink">
                      {prettyDate(r.date)}, {time12(r.start)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600">
                      {[r.clientName || "No client name", r.service].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <StatusIcon row={r} />
                </div>
                <Flags row={r} />
                <ProPicker row={r} team={team} onChange={(id) => setPro(r.key, id)} className="mt-3 h-12 text-[15px]" />
              </li>
            ))}
          </ul>

          {/* Laptops: a table. */}
          <div className={`${panelClass} hidden overflow-hidden md:block`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline text-xs text-neutral-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-4 py-3 font-medium">Client</th>
                  <th scope="col" className="px-4 py-3 font-medium">Service</th>
                  <th scope="col" className="w-56 px-4 py-3 font-medium">Team member</th>
                  <th scope="col" className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {visible.slice(0, shown).map((r) => (
                  <tr key={r.key} className={r.past ? "text-neutral-500" : "text-ink"}>
                    <td className="whitespace-nowrap px-4 py-3">
                      {prettyDate(r.date)}
                      <span className="block text-xs text-neutral-500">
                        {time12(r.start)}–{time12(r.end)}
                      </span>
                    </td>
                    <td className="max-w-[14rem] px-4 py-3">
                      <span className="block truncate">{r.clientName || <span className="text-neutral-400">No name</span>}</span>
                      {r.clientPhone || r.clientEmail ? <span className="block truncate text-xs text-neutral-500">{r.clientPhone || r.clientEmail}</span> : null}
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3">{r.service || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-4 py-2">
                      <ProPicker row={r} team={team} onChange={(id) => setPro(r.key, id)} className="h-10" />
                    </td>
                    <td className="px-4 py-3">
                      <Flags row={r} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visible.length > shown ? (
            <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, visible.length - shown)} more</Button>
          ) : null}
        </>
      ) : (
        <p className={`${panelClass} px-5 py-8 text-center text-sm text-neutral-500`}>Nothing here.</p>
      )}

      <div className={`${panelClass} space-y-3 px-5 py-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-neutral-600" role={saving ? "status" : undefined}>
            {saving
              ? `Adding ${saving.done.toLocaleString("en-CA")} of ${saving.total.toLocaleString("en-CA")}…`
              : `Nothing has been added yet. Anything overlapping a booking already in LineUp is skipped, never replaced, and nobody gets a message.${
                  unmatched.length ? ` The ${plural(unmatched.length, "appointment")} with nobody picked will be left out.` : ""
                }`}
          </p>
          <Button variant="primary" loading={!!saving} disabled={!toSave.length || !!saving} onClick={confirm} className="shrink-0">
            {toSave.length ? `Add ${plural(toSave.length, "appointment")}` : "Add to calendars"}
          </Button>
        </div>
        {saveError ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
            {saveError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatusIcon({ row }: { row: Row }) {
  if (row.clash) return <AlertTriangle className="h-5 w-5 shrink-0 text-ink" aria-label="Clashes" />;
  if (row.past) return <History className="h-5 w-5 shrink-0 text-neutral-400" aria-label="Already happened" />;
  if (row.confidence !== "confident") return <CircleHelp className="h-5 w-5 shrink-0 text-neutral-400" aria-label="Needs a check" />;
  return <CircleCheck className="h-5 w-5 shrink-0 text-neutral-300" aria-label="Looks right" />;
}

function Flags({ row, compact = false }: { row: Row; compact?: boolean }) {
  const flags: { icon: React.ReactNode; text: string; strong?: boolean }[] = [];
  if (row.already) flags.push({ icon: <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />, text: "Already in LineUp from an earlier import" });
  if (row.clash) flags.push({ icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />, text: `Clashes with ${row.clash}`, strong: true });
  if (row.past) flags.push({ icon: <History className="h-3.5 w-3.5" aria-hidden="true" />, text: "Already happened, client history only" });
  if (!row.proId) flags.push({ icon: <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />, text: row.staffText ? `"${row.staffText}" isn't on your team` : "Pick who this is for" });
  else if (row.confidence === "check")
    flags.push({ icon: <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />, text: row.staffText ? `Best guess from "${row.staffText.slice(0, 40)}"` : "Best guess" });
  if (row.repeating) flags.push({ icon: <Repeat className="h-3.5 w-3.5" aria-hidden="true" />, text: "Repeats" });
  if (row.guessedEnd) flags.push({ icon: <Clock className="h-3.5 w-3.5" aria-hidden="true" />, text: "No length given, set to 1 hour" });
  if (!flags.length) return compact ? <span className="text-neutral-400">—</span> : null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-3"}`}>
      {flags.map((f) => (
        <li
          key={f.text}
          className={`inline-flex items-start gap-1 rounded-2xl px-2.5 py-1 text-xs font-medium leading-4 ${
            f.strong ? "bg-ink text-white" : "bg-ink/[0.06] text-neutral-700"
          }`}
        >
          <span className="mt-px shrink-0">{f.icon}</span>
          {f.text}
        </li>
      ))}
    </ul>
  );
}

function ProPicker({ row, team, onChange, className = "" }: { row: Row; team: TeamPro[]; onChange: (id: string) => void; className?: string }) {
  return (
    <select
      aria-label={`Team member for ${row.clientName || "this appointment"} on ${row.date} at ${row.start}`}
      value={row.proId || ""}
      onChange={(e) => onChange(e.target.value)}
      className={`${fieldClass} ${className} ${row.proId ? "" : "text-neutral-500"}`}
    >
      <option value="">Pick someone</option>
      {team.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function SkippedList({ skipped }: { skipped: (SkippedRow & { file: string })[] }) {
  if (!skipped.length) return <p className={`${panelClass} px-5 py-8 text-center text-sm text-neutral-500`}>Nothing was skipped.</p>;
  return (
    <ul className={`${panelClass} divide-y divide-hairline`}>
      {skipped.map((s, i) => (
        <li key={i} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.where}</span>
          <span className="text-sm text-neutral-500">{s.reason}</span>
          <span className="truncate text-xs text-neutral-400 sm:w-40 sm:text-right">{s.file}</span>
        </li>
      ))}
    </ul>
  );
}
