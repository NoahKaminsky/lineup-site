"use client";

// Import: bring the shop's calendar over from another app (see
// ./calendarImport), and the list of past imports with Undo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { studioFetch } from "./studioApi";
import { Button, EmptyState, Section, Sheet, Tag, panelClass } from "./ui";
import { isBookable, type SectionProps } from "./types";
import { studioHref } from "./StudioContext";
import { SOURCE_APP_LABELS, type SourceApp } from "@/app/lib/importSources";
import CalendarImport, { type ClashChecker, type SaveImport } from "./calendarImport/CalendarImport";
import type { ProCounts, SaveSummary } from "./calendarImport/Summary";

const CHUNK = 200;
const ALREADY = "__already__";

type Batch = {
  id: string;
  kind: "appointments" | "clients";
  professionalId: string | null;
  createdBy: string | null;
  createdAt: string;
  sourceApp: SourceApp;
  fileNames: string[];
  rowCount: number;
  addedCount: number;
  skippedPast: number;
  clashCount: number;
  problemCount: number;
  undoneAt: string | null;
  keptCount: number;
  removable: number;
  status: "saving" | "done" | "failed";
  summary: { added?: number; history?: number; clientsCreated?: number; perPro?: Record<string, ProCounts> };
};

type ImportsResponse = { ready: boolean; live: boolean; batches: Batch[] };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ImportView({ data, setNotice }: SectionProps) {
  const team = useMemo(
    () => (data.team || []).filter(isBookable).map((m) => ({ id: m.profileId!, name: m.name || "Team member" })),
    [data.team]
  );
  const names = useMemo(() => new Map((data.team || []).map((m) => [m.profileId, m.name || "Team member"])), [data.team]);

  const [imports, setImports] = useState<ImportsResponse | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Batch | null>(null);

  const load = useCallback(async () => {
    const res = await studioFetch<ImportsResponse>("/api/studio/import");
    if (res.ok) setImports(res.data);
    else setNotice({ tone: "error", text: res.data.error || "Could not load your imports." });
  }, [setNotice]);

  useEffect(() => {
    let cancelled = false;
    studioFetch<ImportsResponse>("/api/studio/import").then((res) => {
      if (cancelled) return;
      if (res.ok) setImports(res.data);
      else setNotice({ tone: "error", text: res.data.error || "Could not load your imports." });
    });
    return () => {
      cancelled = true;
    };
  }, [setNotice]);

  // Read-only: which preview rows land on time already taken.
  const checkClashes: ClashChecker = useCallback(async (items) => {
    if (!items.length) return {};
    const res = await studioFetch<{ clashes: Record<string, string>; already?: string[] }>("/api/studio/import", {
      method: "POST",
      body: { action: "check-clashes", items },
    });
    if (!res.ok) throw new Error(res.data.error || "Clash check failed");
    const result: Record<string, string> = { ...(res.data.clashes || {}) };
    for (const key of res.data.already || []) result[key] = ALREADY;
    return result;
  }, []);

  // Saves the reviewed rows in chunks. If any chunk fails, the whole
  // import is taken back out so nothing is left half-saved.
  const saveImport: SaveImport = useCallback(async (input, onProgress) => {
    const call = async <T,>(body: Record<string, unknown>) => {
      const res = await studioFetch<T>("/api/studio/import", { method: "POST", body });
      if (!res.ok) throw Object.assign(new Error(res.data.error || "Request failed"), { status: res.status });
      return res.data;
    };
    const { batchId } = await call<{ batchId: string }>({
      action: "save-start",
      sourceApp: input.sourceApp,
      sourceType: input.sourceType,
      fileNames: input.fileNames,
      rowCount: input.rows.length,
    }).catch((error: Error & { status?: number }) => {
      throw new Error(error.status === 402 ? error.message : "We couldn't start the import. Nothing was added. Please try again.");
    });

    const summary: SaveSummary = {
      perPro: {},
      clients: { created: 0, merged: 0, possibleDuplicates: [] },
      skipped: [],
      unmatched: input.unmatched,
      added: 0,
      history: 0,
      clashes: 0,
      already: 0,
    };
    const merged = new Set<string>();
    const dupes = new Set<string>();
    try {
      for (let i = 0; i < input.rows.length; i += CHUNK) {
        const chunk = await call<{
          perPro: Record<string, ProCounts>;
          clients: { created: number; mergedIds: string[]; possibleDuplicates: string[] };
          skipped: SaveSummary["skipped"];
        }>({ action: "save-chunk", batchId, rows: input.rows.slice(i, i + CHUNK) });
        for (const [pro, c] of Object.entries(chunk.perPro)) {
          const t = (summary.perPro[pro] ||= { added: 0, history: 0, clashes: 0, already: 0 });
          t.added += c.added;
          t.history += c.history;
          t.clashes += c.clashes;
          t.already += c.already;
          summary.added += c.added;
          summary.history += c.history;
          summary.clashes += c.clashes;
          summary.already += c.already;
        }
        summary.clients.created += chunk.clients.created;
        chunk.clients.mergedIds.forEach((id) => merged.add(id));
        chunk.clients.possibleDuplicates.forEach((n) => dupes.add(n));
        summary.skipped.push(...chunk.skipped);
        onProgress(Math.min(i + CHUNK, input.rows.length), input.rows.length);
      }
      summary.clients.merged = merged.size;
      summary.clients.possibleDuplicates = [...dupes];
      await call({
        action: "save-finish",
        batchId,
        summary: { perPro: summary.perPro, clashes: summary.clashes, already: summary.already, unmatched: summary.unmatched, clientsMerged: merged.size },
      });
    } catch {
      await call({ action: "save-rollback", batchId }).catch(() => undefined);
      void load();
      throw new Error(
        "Something went wrong partway through, so we took the whole import back out. Nothing was added to anyone's calendar. Please try again."
      );
    }
    void load();
    return summary;
  }, [load]);

  async function undo(batch: Batch) {
    setUndoing(batch.id);
    const res = await studioFetch<{ appointmentsRemoved: number; clientsRemoved: number; kept: number }>("/api/studio/import", {
      method: "POST",
      body: { action: "undo-batch", id: batch.id },
    });
    setUndoing(null);
    setConfirming(null);
    if (!res.ok) return setNotice({ tone: "error", text: res.data.error || "Couldn't undo that import." });
    const { appointmentsRemoved: a = 0, clientsRemoved: c = 0, kept } = res.data;
    setNotice({
      tone: "success",
      text: `Import undone. We removed ${a} ${a === 1 ? "appointment" : "appointments"} and ${c} ${c === 1 ? "client" : "clients"}${
        kept ? `, and kept ${kept} that had been used since` : ""
      }.`,
    });
    void load();
  }

  function describe(b: Batch) {
    if (b.kind === "clients") return `${b.addedCount} ${b.addedCount === 1 ? "client" : "clients"} for the shop`;
    if (b.professionalId) return `${b.addedCount} ${b.addedCount === 1 ? "appointment" : "appointments"} for ${names.get(b.professionalId) || "a former team member"}`;
    const per = Object.entries(b.summary.perPro || {})
      .filter(([, c]) => c.added)
      .map(([id, c]) => `${names.get(id) || "Former team member"} ${c.added}`);
    return `${b.addedCount} ${b.addedCount === 1 ? "appointment" : "appointments"}${per.length ? ` (${per.join(", ")})` : ""}`;
  }

  return (
    <div className="space-y-12">
      {team.length ? (
        <CalendarImport
          team={team}
          teamHref={studioHref("team")}
          calendarHref={studioHref("calendar")}
          checkClashes={checkClashes}
          saveImport={saveImport}
        />
      ) : (
        <EmptyState title="Add your team first" body="Appointments are matched to the people on your team, so invite them before importing." />
      )}

      <Section title="Import history" description="Undo takes out everything an import added that nobody has used since. Appointments already marked done and paid, and clients you've since emailed, edited or booked, stay.">
        {!imports ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : !imports.batches.length ? (
          <EmptyState title="No imports yet" body="Appointments and client lists you bring over show up here." />
        ) : (
          <ul className={`${panelClass} divide-y divide-hairline`}>
            {imports.batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{describe(b)}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">
                    {when(b.createdAt)} · {SOURCE_APP_LABELS[b.sourceApp] || "Another app"}
                    {b.fileNames[0] ? ` · ${b.fileNames[0]}` : ""}
                    {b.createdBy ? ` · by ${names.get(b.createdBy) || "a manager"}` : ""}
                    {b.summary.history ? ` · ${b.summary.history} past` : ""}
                    {b.summary.clientsCreated ? ` · ${b.summary.clientsCreated} new clients` : ""}
                    {b.clashCount ? ` · ${b.clashCount} skipped (overlapped)` : ""}
                    {b.status === "saving" ? " · still saving" : ""}
                  </p>
                </div>
                {b.undoneAt ? (
                  <Tag tone="outline">{b.keptCount ? `Undone, ${b.keptCount} kept` : "Undone"}</Tag>
                ) : b.removable && b.status === "done" ? (
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(b)}>
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    Undo this import
                  </Button>
                ) : (
                  <Tag>Nothing left to undo</Tag>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Sheet
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title="Undo this import?"
        description={confirming ? `${when(confirming.createdAt)} · ${SOURCE_APP_LABELS[confirming.sourceApp] || "Another app"}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={!!confirming && undoing === confirming.id} onClick={() => confirming && undo(confirming)}>
              Undo import
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-6 text-neutral-600">
          <p>
            This takes the import&apos;s appointments off your team&apos;s calendars, so those times open up again, and removes the clients it added
            {confirming && confirming.kind === "appointments" && !confirming.professionalId
              ? `: up to ${(confirming.summary.added ?? confirming.addedCount) + (confirming.summary.history ?? 0)} appointments and ${confirming.summary.clientsCreated ?? 0} clients`
              : ""}
            .
          </p>
          <p>
            Anything used since stays: appointments marked done and paid, and clients you&apos;ve emailed, edited or who have booked since.
            Nothing else in LineUp is touched.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
