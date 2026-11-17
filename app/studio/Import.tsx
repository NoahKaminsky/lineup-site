"use client";

// Import: move the shop's calendar over from another booking app. The owner
// or a manager picks whose appointments a file holds, checks the preview, and
// adds them. They hold that pro's time so nobody books over them; nobody is
// messaged or charged, and they stay out of analytics and earnings. Every
// upload is listed below and can be undone in one go.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Undo2, Upload } from "lucide-react";
import { studioFetch } from "./studioApi";
import { Button, EmptyState, Field, Section, Tag, fieldClass, panelClass } from "./ui";
import { isBookable, localDateKey, time12, type SectionProps } from "./types";
import { parseAppointments } from "@/app/lib/appointmentImport";
import { SOURCE_APPS, SOURCE_APP_LABELS, type SourceApp } from "@/app/lib/importSources";

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

function prettyDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ImportView({ data, setNotice }: SectionProps) {
  const team = useMemo(() => (data.team || []).filter(isBookable), [data.team]);
  const names = useMemo(() => new Map((data.team || []).map((m) => [m.profileId, m.name || "Team member"])), [data.team]);

  const [imports, setImports] = useState<ImportsResponse | null>(null);
  const [proId, setProId] = useState("");
  const [sourceApp, setSourceApp] = useState<SourceApp>("other");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const parsed = useMemo(() => parseAppointments(text), [text]);
  const today = localDateKey(new Date());
  const upcoming = parsed.appointments.filter((a) => a.date >= today);
  const pastCount = parsed.appointments.length - upcoming.length;

  function clear() {
    setText("");
    setFileName(null);
  }

  async function readFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      return setNotice({ tone: "error", text: "That file is over 5 MB. Export just the upcoming appointments." });
    }
    setFileName(file.name);
    setText(await file.text());
  }

  async function save() {
    if (!proId) return setNotice({ tone: "error", text: "Pick whose appointments these are first." });
    setSaving(true);
    const res = await studioFetch<{ added: number; clashCount: number; clashes: string[]; problems: number }>("/api/studio/import", {
      method: "POST",
      body: { action: "appointments", professionalId: proId, rows: upcoming, sourceApp, sourceType: "csv", fileName },
    });
    setSaving(false);
    if (!res.ok) return setNotice({ tone: "error", text: res.data.error || "Couldn't add those appointments." });
    const { added, clashCount } = res.data;
    setNotice({
      tone: "success",
      text: `Added ${added} ${added === 1 ? "appointment" : "appointments"} to ${names.get(proId) || "their"} calendar.${
        clashCount ? ` ${clashCount} overlapped something already booked and ${clashCount === 1 ? "was" : "were"} skipped.` : ""
      }`,
    });
    clear();
    void load();
  }

  async function undo(batch: Batch) {
    const what = batch.kind === "clients" ? "clients" : "appointments";
    if (
      !window.confirm(
        `Undo this import? ${batch.removable} ${what} from it will be removed. Anything already marked done or already emailed is kept.`
      )
    )
      return;
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

  if (imports && !imports.ready) {
    return <EmptyState title="Importing is being switched on" body="Check back in a little while." />;
  }

  return (
    <div className="space-y-10">
      <Section
        title="Import appointments"
        description="Moving from Squire, Booksy, Fresha, Vagaro or Square? Export each pro's upcoming appointments as a CSV and add them to their LineUp calendar. They hold the time so nobody books over them. Nobody gets a message and nobody is charged."
      >
        {imports && !imports.live ? (
          <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Importing is part of the Studio plans. Start a plan under Settings.</p>
        ) : null}
        <div className={`${panelClass} space-y-5 p-5 sm:p-6`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Whose appointments" htmlFor="import-pro">
              <select id="import-pro" value={proId} onChange={(e) => setProId(e.target.value)} className={fieldClass}>
                <option value="">Pick a team member</option>
                {team.map((m) => (
                  <option key={m.profileId!} value={m.profileId!}>
                    {m.name || "Team member"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Exported from" htmlFor="import-source">
              <select id="import-source" value={sourceApp} onChange={(e) => setSourceApp(e.target.value as SourceApp)} className={fieldClass}>
                {SOURCE_APPS.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_APP_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {fileName ? `Chosen: ${fileName}` : "Choose a CSV file"}
            </Button>
          </div>

          {text ? (
            <div>
              <p className="text-sm font-medium text-ink">
                Found {upcoming.length} upcoming {upcoming.length === 1 ? "appointment" : "appointments"}
                {pastCount ? ` (${pastCount} in the past, left out)` : ""}.
              </p>
              {upcoming.some((a) => a.guessedEnd) ? (
                <p className="mt-1 text-xs text-neutral-500">Some rows had no end time or length, so they&apos;re set to one hour.</p>
              ) : null}
              {parsed.problems.length ? (
                <p className="mt-1 text-xs text-red-700">
                  {parsed.problems.length} {parsed.problems.length === 1 ? "row" : "rows"} couldn&apos;t be read:{" "}
                  {parsed.problems.slice(0, 3).map((p) => `line ${p.line}: ${p.reason}`).join("; ")}
                  {parsed.problems.length > 3 ? "…" : ""}
                </p>
              ) : null}
              {upcoming.length ? (
                <ul className="mt-3 divide-y divide-hairline rounded-2xl bg-neutral-50 text-sm ring-1 ring-ink/[0.06]">
                  {upcoming.slice(0, 5).map((a, i) => (
                    <li key={i} className="flex justify-between gap-3 px-4 py-2.5">
                      <span className="truncate">
                        {a.clientName || "Client"} · {a.service || "Appointment"}
                      </span>
                      <span className="shrink-0 text-neutral-500">
                        {prettyDate(a.date)}, {time12(a.start)}–{time12(a.end)}
                      </span>
                    </li>
                  ))}
                  {upcoming.length > 5 ? <li className="px-4 py-2.5 text-neutral-400">and {upcoming.length - 5} more</li> : null}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={save} loading={saving} disabled={!upcoming.length || !proId || (imports ? !imports.live : true)}>
                  {proId ? `Add ${upcoming.length} to ${names.get(proId) || "their"} calendar` : "Pick a team member"}
                </Button>
                <Button variant="ghost" onClick={clear}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Section>

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
