"use client";

// Import your calendar: the owner adds the files from their old app, we read
// them on this device (nothing is uploaded or stored), match every
// appointment to someone on the team, and show it all for checking. Saving
// comes in the next step; this screen only previews.

import { useCallback, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload, X } from "lucide-react";
import { Button, Field, Segmented, fieldClass, panelClass } from "../ui";
import ExportHelp from "./ExportHelp";
import Review from "./Review";
import Summary, { type SaveSummary } from "./Summary";
import { parseIcs } from "@/app/lib/calendarImport/ics";
import { CSV_FIELDS, csvRows, readCsv, type CsvMapping, type CsvTable } from "@/app/lib/calendarImport/csv";
import type { ParsedFile, TeamPro } from "@/app/lib/calendarImport/types";

export type SaveInputRow = {
  key: string;
  proId: string;
  date: string;
  start: string;
  end: string;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  service: string | null;
  priceCents: number | null;
};
export type SaveImport = (
  input: { rows: SaveInputRow[]; unmatched: number; fileNames: string[]; sourceApp: string; sourceType: "ics" | "csv" },
  onProgress: (done: number, total: number) => void
) => Promise<SaveSummary>;

export type ClashChecker = (
  items: { key: string; proId: string; date: string; start: string; end: string }[]
) => Promise<Record<string, string>>;

type FileEntry = {
  id: string;
  name: string;
  kind: "ics" | "csv";
  status: "reading" | "ready" | "error";
  error?: string;
  text?: string;
  table?: CsvTable;
  parsed?: ParsedFile;
  mode: "one" | "several";
  proId: string;
  editingColumns?: boolean;
};

const MAX_BYTES = 10 * 1024 * 1024;

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function CalendarImport({
  team,
  teamHref,
  calendarHref,
  checkClashes,
  saveImport,
}: {
  team: TeamPro[];
  teamHref: string;
  calendarHref: string;
  checkClashes: ClashChecker;
  saveImport: SaveImport;
}) {
  const [summary, setSummary] = useState<SaveSummary | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [dragging, setDragging] = useState(false);
  // The owner's pro changes on the review, kept if they go back to the files.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  const update = useCallback((id: string, patch: Partial<FileEntry>) => {
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const parse = useCallback(
    (entry: Pick<FileEntry, "id" | "kind" | "text" | "table">): Partial<FileEntry> => {
      try {
        if (entry.kind === "ics") {
          const parsed = parseIcs(entry.text || "", entry.id, team);
          if (!parsed.rows.length && !parsed.skipped.length) return { status: "error", error: "There are no appointments in this calendar file." };
          return { status: "ready", parsed };
        }
        const table = entry.table || readCsv(entry.text || "");
        if (table.needsMapping) return { status: "ready", table, parsed: undefined, editingColumns: true };
        const parsed = csvRows(table, entry.id, team);
        if (!parsed.rows.length && !parsed.skipped.length) return { status: "error", error: "There are no appointments in this file." };
        return { status: "ready", table, parsed };
      } catch (error) {
        return { status: "error", error: error instanceof Error ? error.message : "This file couldn't be read." };
      }
    },
    [team]
  );

  async function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const id = newId();
      const lower = file.name.toLowerCase();
      const kind: "ics" | "csv" = lower.endsWith(".ics") || file.type === "text/calendar" ? "ics" : "csv";
      const entry: FileEntry = { id, name: file.name, kind, status: "reading", mode: kind === "ics" ? "one" : "several", proId: "" };
      setFiles((prev) => [...prev, entry]);
      if (!/\.(ics|csv|txt)$/i.test(lower)) {
        update(id, { status: "error", error: "Add an .ics calendar file or a .csv export." });
        continue;
      }
      if (file.size === 0) {
        update(id, { status: "error", error: "This file is empty." });
        continue;
      }
      if (file.size > MAX_BYTES) {
        update(id, { status: "error", error: "This file is over 10 MB. Export just the dates you need." });
        continue;
      }
      // Read off the main thread's critical path so the "Reading" state shows.
      const text = await file.text();
      await new Promise((r) => setTimeout(r, 0));
      const realKind = /BEGIN:VCALENDAR/i.test(text.slice(0, 2000)) ? "ics" : kind;
      update(id, { kind: realKind, text, mode: realKind === "ics" ? "one" : "several", ...parse({ id, kind: realKind, text }) });
    }
  }

  function setMapping(entry: FileEntry, mapping: CsvMapping) {
    const table = { ...entry.table!, mapping, needsMapping: mapping.date === -1 || mapping.start === -1 };
    update(entry.id, { table });
  }

  function applyMapping(entry: FileEntry) {
    if (!entry.table || entry.table.needsMapping) return;
    const parsed = csvRows(entry.table, entry.id, team);
    update(entry.id, { parsed, editingColumns: false });
  }

  const ready = useMemo(() => files.filter((f) => f.status === "ready" && f.parsed && !f.editingColumns), [files]);
  const reading = files.some((f) => f.status === "reading");
  const waitingOnPro = ready.some((f) => f.mode === "one" && !f.proId);
  const found = ready.reduce((n, f) => n + (f.parsed?.rows.length || 0), 0);

  // Rows as the review sees them: a "one person" file puts every row on
  // that person.
  const reviewFiles = useMemo(
    () =>
      ready.map((f) => ({
        id: f.id,
        name: f.name,
        rows:
          f.mode === "one"
            ? f.parsed!.rows.map((r) => ({ ...r, proId: f.proId || null, confidence: f.proId ? ("confident" as const) : ("none" as const) }))
            : f.parsed!.rows,
        skipped: f.parsed!.skipped,
      })),
    [ready]
  );

  // Where the files came from, for the import history.
  const source = useMemo(() => {
    const guess = ready.map((f) => {
      if (f.kind === "csv") return "other";
      const head = (f.text || "").slice(0, 400);
      return /apple/i.test(head) ? "apple" : /google/i.test(head) ? "google" : "other";
    });
    return {
      sourceApp: guess.length && guess.every((g) => g === guess[0]) ? guess[0] : "other",
      sourceType: (ready.every((f) => f.kind === "ics") ? "ics" : "csv") as "ics" | "csv",
      fileNames: ready.map((f) => f.name),
    };
  }, [ready]);

  if (summary) {
    return (
      <Summary
        summary={summary}
        team={team}
        calendarHref={calendarHref}
        onAnother={() => {
          setSummary(null);
          setFiles([]);
          setOverrides({});
          setStep("upload");
        }}
      />
    );
  }

  if (step === "review") {
    return (
      <Review
        files={reviewFiles}
        team={team}
        teamHref={teamHref}
        checkClashes={checkClashes}
        overrides={overrides}
        setOverrides={setOverrides}
        onBack={() => setStep("upload")}
        save={(rows, unmatched, onProgress) => saveImport({ rows, unmatched, ...source }, onProgress)}
        onSaved={setSummary}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Import your calendar</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">
          Bring your shop&apos;s appointments over from Apple, Google, Outlook, Squire, Booksy, Fresha or Square. We read the files
          here on your device and show you everything before anything is added. Nobody gets a message and nobody is charged.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
            }}
            className={`${panelClass} flex flex-col items-center gap-3 border border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? "border-ink/40 bg-ink/[0.03]" : "border-ink/15"
            }`}
          >
            <Upload className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <div>
              <p className="text-[15px] font-medium text-ink">Add your calendar files</p>
              <p className="mt-1 text-sm text-neutral-500">.ics from Apple, Google or Outlook, or .csv from a booking app. Add as many as you have.</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".ics,.csv,.txt,text/calendar,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="primary" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
          </div>

          {files.length ? (
            <ul className="space-y-3">
              {files.map((f) => (
                <li key={f.id} className={`${panelClass} p-4 sm:p-5`}>
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{f.name}</p>
                      <p className="mt-0.5 text-sm text-neutral-500" role={f.status === "error" ? "alert" : undefined}>
                        {f.status === "reading" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading…
                          </span>
                        ) : f.status === "error" ? (
                          <span className="text-red-700">{f.error}</span>
                        ) : f.editingColumns ? (
                          "Tell us which columns are which."
                        ) : (
                          `${f.parsed!.rows.length} ${f.parsed!.rows.length === 1 ? "appointment" : "appointments"} found${
                            f.parsed!.skipped.length ? `, ${f.parsed!.skipped.length} skipped` : ""
                          }.`
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((list) => list.filter((x) => x.id !== f.id))}
                      className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                    >
                      {f.status === "error" ? <X className="h-4 w-4" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>

                  {f.status === "ready" && f.editingColumns && f.table ? (
                    <ColumnMatch entry={f} onChange={(m) => setMapping(f, m)} onDone={() => applyMapping(f)} />
                  ) : null}

                  {f.status === "ready" && f.parsed && !f.editingColumns ? (
                    <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                      <Segmented
                        label={`Whose appointments are in ${f.name}`}
                        size="sm"
                        value={f.mode}
                        onChange={(mode) => update(f.id, { mode })}
                        options={[
                          { value: "one", label: "One person" },
                          { value: "several", label: "Several people" },
                        ]}
                      />
                      {f.mode === "one" ? (
                        <select
                          aria-label="Whose calendar this is"
                          value={f.proId}
                          onChange={(e) => update(f.id, { proId: e.target.value })}
                          className={`${fieldClass} sm:max-w-xs`}
                        >
                          <option value="">Whose calendar is it?</option>
                          {team.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs leading-5 text-neutral-500">
                          We&apos;ll match each appointment to your team by the staff name in the file. You can change any of them next.
                        </p>
                      )}
                      {f.kind === "csv" ? (
                        <button type="button" onClick={() => update(f.id, { editingColumns: true })} className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-ink">
                          Check which columns we used
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!ready.length || reading || waitingOnPro} onClick={() => setStep("review")}>
              {reading ? "Reading your files…" : found ? `Review ${found} ${found === 1 ? "appointment" : "appointments"}` : "Review"}
            </Button>
            {waitingOnPro ? <p className="text-sm text-neutral-500">Pick whose calendar each file is first.</p> : null}
          </div>
        </div>

        <aside>
          <p className="mb-3 text-[13px] font-medium text-neutral-800">How to export your calendar</p>
          <ExportHelp />
        </aside>
      </div>
    </div>
  );
}

function ColumnMatch({ entry, onChange, onDone }: { entry: FileEntry; onChange: (m: CsvMapping) => void; onDone: () => void }) {
  const table = entry.table!;
  const sample = (i: number) =>
    table.body
      .slice(0, 3)
      .map((r) => r[i])
      .filter(Boolean)
      .join(", ");
  return (
    <div className="mt-4 space-y-4 border-t border-hairline pt-4">
      <p className="text-sm leading-6 text-neutral-600">
        We couldn&apos;t tell which columns hold everything. Match them up below; only the date and start time are a must.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CSV_FIELDS.map((field) => {
          const index = table.mapping[field.key];
          return (
            <Field
              key={field.key}
              label={field.label}
              optional={!("required" in field && field.required)}
              htmlFor={`${entry.id}-${field.key}`}
              hint={index >= 0 && sample(index) ? `For example: ${sample(index)}` : undefined}
            >
              <select
                id={`${entry.id}-${field.key}`}
                value={index}
                onChange={(e) => onChange({ ...table.mapping, [field.key]: Number(e.target.value) })}
                className={fieldClass}
              >
                <option value={-1}>Not in this file</option>
                {table.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </Field>
          );
        })}
      </div>
      <Button variant="primary" disabled={table.needsMapping} onClick={onDone}>
        Use these columns
      </Button>
    </div>
  );
}
