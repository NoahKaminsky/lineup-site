"use client";

// After an import is saved: what landed where, in plain words.

import Link from "next/link";
import { CalendarDays, Users } from "lucide-react";
import { Button, buttonClass, panelClass } from "../ui";
import { time12 } from "../types";
import type { TeamPro } from "@/app/lib/calendarImport/types";

export type ProCounts = { added: number; history: number; clashes: number; already: number };
export type SaveSummary = {
  perPro: Record<string, ProCounts>;
  clients: { created: number; merged: number; possibleDuplicates: string[] };
  skipped: { key: string; proId: string; date: string; start: string; reason: string; client?: string | null }[];
  unmatched: number;
  added: number;
  history: number;
  clashes: number;
  already: number;
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-CA")} ${n === 1 ? one : many}`;
}

function prettyDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function Summary({
  summary,
  team,
  calendarHref,
  onAnother,
}: {
  summary: SaveSummary;
  team: TeamPro[];
  calendarHref: string;
  onAnother: () => void;
}) {
  const names = new Map(team.map((p) => [p.id, p.name]));
  const { added, clashes, history, already, unmatched, clients } = summary;

  const headline =
    added === 0 && already > 0
      ? `Nothing new to add. ${plural(already, "appointment was", "appointments were")} already in LineUp from an earlier import.`
      : `All set. ${plural(added, "appointment is", "appointments are")} on your team's calendars${
          clashes ? `, and ${clashes} ${clashes === 1 ? "was" : "were"} skipped because ${clashes === 1 ? "it overlaps" : "they overlap"} bookings already in LineUp` : ""
        }.`;

  const extras = [
    history ? `We kept ${plural(history, "past visit")} as client history; they don't block any time.` : null,
    already && added ? `${plural(already, "appointment was", "appointments were")} already in LineUp from an earlier import, so we left ${already === 1 ? "it" : "them"} alone.` : null,
    unmatched ? `${plural(unmatched, "appointment")} had nobody from your team picked, so ${unmatched === 1 ? "it wasn't" : "they weren't"} added.` : null,
  ].filter(Boolean);

  const pros = Object.entries(summary.perPro).sort((a, b) => b[1].added - a[1].added);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Import finished</h2>
        <p className="mt-1 max-w-2xl text-[15px] leading-7 text-neutral-700" role="status">
          {headline}
        </p>
        {extras.map((line) => (
          <p key={line} className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">
            {line}
          </p>
        ))}
      </div>

      {pros.length ? (
        <ul className={`${panelClass} divide-y divide-hairline`}>
          {pros.map(([id, c]) => (
            <li key={id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[15px] font-medium text-ink">{names.get(id) || "Team member"}</p>
              <p className="text-sm text-neutral-500">
                {[
                  `${c.added} added`,
                  c.history ? `${c.history} past` : null,
                  c.clashes ? `${c.clashes} skipped for clashes` : null,
                  c.already ? `${c.already} already there` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={`${panelClass} flex items-start gap-3 px-5 py-4`}>
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
        <div className="text-sm leading-6 text-neutral-600">
          <p>
            Your client list has {plural(clients.created, "new client")}
            {clients.merged ? `, and ${plural(clients.merged, "person", "people")} matched clients you already had` : ""}. Nobody was sent anything.
          </p>
          {clients.possibleDuplicates.length ? (
            <p className="mt-1">
              These might be the same person under a different phone or email, so we kept them apart:{" "}
              <span className="text-ink">{clients.possibleDuplicates.slice(0, 5).join(", ")}</span>
              {clients.possibleDuplicates.length > 5 ? ` and ${clients.possibleDuplicates.length - 5} more` : ""}.
            </p>
          ) : null}
        </div>
      </div>

      {summary.skipped.length ? (
        <div>
          <p className="mb-2 text-[13px] font-medium text-neutral-800">Skipped because the time was already taken</p>
          <ul className={`${panelClass} divide-y divide-hairline`}>
            {summary.skipped.slice(0, 100).map((s) => (
              <li key={s.key} className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-ink sm:w-48">
                  {prettyDate(s.date)}, {time12(s.start)}
                </span>
                <span className="min-w-0 flex-1 truncate text-neutral-600">
                  {names.get(s.proId) || "Team member"}
                  {s.client ? ` with ${s.client}` : ""}
                </span>
                <span className="text-neutral-500">{s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href={calendarHref} className={buttonClass("primary")}>
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Go to calendar
        </Link>
        <Button onClick={onAnother}>Import more</Button>
      </div>
    </div>
  );
}
