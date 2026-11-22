"use client";

// Import: bring the shop's calendar over from another app (see
// ./calendarImport), and the list of past imports with Undo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { studioFetch } from "./studioApi";
import { Button, EmptyState, Section, Tag, panelClass } from "./ui";
import { isBookable, type SectionProps } from "./types";
import { studioHref } from "./StudioContext";
import { SOURCE_APP_LABELS, type SourceApp } from "@/app/lib/importSources";
import CalendarImport, { type ClashChecker } from "./calendarImport/CalendarImport";

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
    const res = await studioFetch<{ clashes: Record<string, string> }>("/api/studio/import", {
      method: "POST",
      body: { action: "check-clashes", items },
    });
    if (!res.ok) throw new Error(res.data.error || "Clash check failed");
    return res.data.clashes || {};
  }, []);

  async function undo(batch: Batch) {
    const what = batch.kind === "clients" ? "clients" : "appointments";
    if (!window.confirm(`Undo this import? ${batch.removable} ${what} from it will be removed. Anything already marked done or already emailed is kept.`)) return;
    setUndoing(batch.id);
    const res = await studioFetch<{ removed: number; kept: number }>("/api/studio/import", { method: "POST", body: { action: "undo-batch", id: batch.id } });
    setUndoing(null);
    if (!res.ok) return setNotice({ tone: "error", text: res.data.error || "Couldn't undo that import." });
    setNotice({
      tone: "success",
      text: `Import undone: ${res.data.removed} removed${res.data.kept ? `, ${res.data.kept} kept because they were already done or emailed` : ""}.`,
    });
    void load();
  }

  return (
    <div className="space-y-12">
      {team.length ? (
        <CalendarImport team={team} teamHref={studioHref("team")} checkClashes={checkClashes} />
      ) : (
        <EmptyState title="Add your team first" body="Appointments are matched to the people on your team, so invite them before importing." />
      )}

      <Section title="Past imports" description="Undo removes everything an import added that hasn't been used yet. Appointments already marked done, and clients already emailed, are kept.">
        {!imports ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : !imports.batches.length ? (
          <EmptyState title="No imports yet" body="Appointments and client lists you bring over show up here." />
        ) : (
          <ul className={`${panelClass} divide-y divide-hairline`}>
            {imports.batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {b.kind === "clients"
                      ? `${b.addedCount} ${b.addedCount === 1 ? "client" : "clients"} for the shop`
                      : `${b.addedCount} ${b.addedCount === 1 ? "appointment" : "appointments"} for ${names.get(b.professionalId) || "a former team member"}`}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">
                    {when(b.createdAt)} · {SOURCE_APP_LABELS[b.sourceApp] || "Another app"}
                    {b.fileNames[0] ? ` · ${b.fileNames[0]}` : ""}
                    {b.createdBy ? ` · by ${names.get(b.createdBy) || "a manager"}` : ""}
                    {b.clashCount ? ` · ${b.clashCount} skipped (overlapped)` : ""}
                  </p>
                </div>
                {b.undoneAt ? (
                  <Tag tone="outline">{b.keptCount ? `Undone, ${b.keptCount} kept` : "Undone"}</Tag>
                ) : b.removable ? (
                  <Button size="sm" variant="ghost" loading={undoing === b.id} onClick={() => undo(b)}>
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    Undo
                  </Button>
                ) : (
                  <Tag>Nothing left to undo</Tag>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
