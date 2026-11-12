"use client";

// Bring your book over: a pro uploads their upcoming appointments and client
// list from another booking app. Appointments are held on their LineUp
// calendar (so nobody can book over them); clients can be invited once to
// book on LineUp. Paid plans only.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Mail, Trash2, Upload, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { parseAppointments } from "@/app/lib/appointmentImport";
import { parseClientList } from "@/app/studio/clientImport";

type Appt = { id: string; client: string; service: string; date: string; start: string; end: string };
type Client = { id: string; name: string | null; email: string; phone: string | null; invited: boolean; unsubscribed: boolean };
type State = { subscribed: boolean; ready: boolean; appointments: Appt[]; clients: Client[] };

async function api<T>(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as T & { error?: string } };
}

function prettyDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function prettyTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const panel = "rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07] sm:p-8";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50";
const secondary = "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-ink/15 hover:bg-neutral-50 disabled:opacity-50";

function FilePicker({ onText, label }: { onText: (text: string, name: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && file.size < 5 * 1024 * 1024) onText(await file.text(), file.name);
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className={secondary}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    </>
  );
}

export default function ImportPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [apptText, setApptText] = useState("");
  const [apptFile, setApptFile] = useState<string | null>(null);
  const [clientText, setClientText] = useState("");
  const [clientFile, setClientFile] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  async function reload() {
    const res = await api<State>("/api/pro/import");
    if (res.status === 401) return window.location.assign("/login?next=/import");
    if (res.ok) setState(res.json);
    else setError(res.json.error || "Couldn't load this page.");
  }

  useEffect(() => {
    let cancelled = false;
    api<State>("/api/pro/import").then((res) => {
      if (cancelled) return;
      if (res.status === 401) return window.location.assign("/login?next=/import");
      if (res.ok) setState(res.json);
      else setError(res.json.error || "Couldn't load this page.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const appts = useMemo(() => parseAppointments(apptText), [apptText]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appts.appointments.filter((a) => a.date >= today);
  const clients = useMemo(() => parseClientList(clientText), [clientText]);

  async function addAppointments() {
    setBusy("appts");
    setNotice(null);
    const res = await api<{ added: number; past: number; clashCount: number; clashes: string[] }>("/api/pro/import", {
      method: "POST",
      body: JSON.stringify({ action: "appointments", rows: upcoming }),
    });
    setBusy(null);
    if (!res.ok) return setNotice({ tone: "error", text: res.json.error || "Couldn't add those." });
    const { added, clashCount, clashes } = res.json;
    setNotice({
      tone: "ok",
      text: `Added ${added} ${added === 1 ? "appointment" : "appointments"} to your calendar.${
        clashCount ? ` ${clashCount} overlapped something already booked and were skipped (${clashes.slice(0, 3).join(", ")}${clashCount > 3 ? "…" : ""}).` : ""
      }`,
    });
    setApptText("");
    setApptFile(null);
    void reload();
  }

  async function addClients() {
    setBusy("clients");
    setNotice(null);
    const res = await api<{ added: number; alreadyThere: number }>("/api/pro/import", {
      method: "POST",
      body: JSON.stringify({ action: "clients", consent, rows: clients.clients }),
    });
    setBusy(null);
    if (!res.ok) return setNotice({ tone: "error", text: res.json.error || "Couldn't add your clients." });
    setNotice({ tone: "ok", text: `Added ${res.json.added} ${res.json.added === 1 ? "client" : "clients"}${res.json.alreadyThere ? `, ${res.json.alreadyThere} already on your list` : ""}.` });
    setClientText("");
    setClientFile(null);
    setConsent(false);
    void reload();
  }

  async function invite(count: number) {
    if (!window.confirm(`Email ${count} ${count === 1 ? "client" : "clients"} an invite to book you on LineUp? Each client only ever gets one.`)) return;
    setBusy("invite");
    const res = await api<{ sent: number; failed: number }>("/api/pro/import", {
      method: "POST",
      body: JSON.stringify({ action: "invite", confirmCount: count }),
    });
    setBusy(null);
    if (!res.ok && !res.json.sent) return setNotice({ tone: "error", text: res.json.error || "The invites didn't send." });
    setNotice({ tone: "ok", text: `Invites sent to ${res.json.sent}.${res.json.failed ? ` ${res.json.failed} didn't go through.` : ""}` });
    void reload();
  }

  async function remove(action: "remove-appointment" | "remove-client", id: string) {
    await api("/api/pro/import", { method: "POST", body: JSON.stringify({ action, id }) });
    void reload();
  }

  if (!state) return <main className="min-h-screen bg-paper px-4 py-16 text-center text-sm text-neutral-500">{error || "Loading…"}</main>;

  const toInvite = state.clients.filter((c) => !c.invited && !c.unsubscribed).length;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6 py-6 sm:py-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Bring your clients over</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">
            Moving from Squire, Booksy, Fresha, Vagaro or Square? Export your upcoming appointments and your client list as CSV
            files and add them here. Your appointments are held on your LineUp calendar so nobody can book over them.
          </p>
        </div>

        {!state.subscribed ? (
          <div className={panel}>
            <p className="font-semibold">Importing is part of the paid plans.</p>
            <p className="mt-1 text-sm text-neutral-600">Upgrade to bring your appointments and clients over in a few minutes.</p>
            <Link href="/subscription" className={`${primary} mt-5`}>
              See plans
            </Link>
          </div>
        ) : null}

        {notice ? (
          <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${notice.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
            {notice.text}
          </p>
        ) : null}

        {/* ── Appointments ───────────────────────────────────── */}
        <section className={`${panel} ${!state.subscribed ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em]">Your upcoming appointments</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                We look for the date, time, client and service columns, so the export works as it comes. Past appointments are left
                out.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <FilePicker label={apptFile ? `Chosen: ${apptFile}` : "Choose a CSV file"} onText={(t, n) => { setApptText(t); setApptFile(n); }} />
          </div>

          {apptText ? (
            <div className="mt-5">
              <p className="text-sm font-medium">
                Found {upcoming.length} upcoming {upcoming.length === 1 ? "appointment" : "appointments"}
                {appts.appointments.length - upcoming.length ? ` (${appts.appointments.length - upcoming.length} in the past, left out)` : ""}.
              </p>
              {upcoming.some((a) => a.guessedEnd) ? (
                <p className="mt-1 text-xs text-neutral-500">Some rows had no end time or length, so they&apos;re set to one hour. You can change them on your calendar.</p>
              ) : null}
              {appts.problems.length ? (
                <p className="mt-1 text-xs text-red-700">
                  {appts.problems.length} {appts.problems.length === 1 ? "row" : "rows"} couldn&apos;t be read: {appts.problems.slice(0, 3).map((p) => `line ${p.line}: ${p.reason}`).join("; ")}
                  {appts.problems.length > 3 ? "…" : ""}
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
                        {prettyDate(a.date)}, {prettyTime(a.start)}–{prettyTime(a.end)}
                      </span>
                    </li>
                  ))}
                  {upcoming.length > 5 ? <li className="px-4 py-2.5 text-neutral-400">and {upcoming.length - 5} more</li> : null}
                </ul>
              ) : null}
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={addAppointments} disabled={!upcoming.length || busy === "appts"} className={primary}>
                  {busy === "appts" ? "Adding…" : `Add ${upcoming.length} to my calendar`}
                </button>
                <button type="button" onClick={() => { setApptText(""); setApptFile(null); }} className={secondary}>
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          {state.appointments.length ? (
            <div className="mt-6">
              <p className="text-xs font-medium text-neutral-500">{state.appointments.length} imported and coming up</p>
              <ul className="mt-2 max-h-72 divide-y divide-hairline overflow-y-auto rounded-2xl ring-1 ring-ink/[0.06]">
                {state.appointments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {a.client} · {a.service}
                    </span>
                    <span className="shrink-0 text-neutral-500">
                      {prettyDate(a.date)}, {prettyTime(a.start)}
                    </span>
                    <button type="button" aria-label="Remove" onClick={() => remove("remove-appointment", a.id)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-700">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* ── Clients ────────────────────────────────────────── */}
        <section className={`${panel} ${!state.subscribed ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em]">Your client list</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                Add your clients, then send each one a single email inviting them to book you on LineUp.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <FilePicker label={clientFile ? `Chosen: ${clientFile}` : "Choose a CSV file"} onText={(t, n) => { setClientText(t); setClientFile(n); }} />
          </div>

          {clientText ? (
            <div className="mt-5">
              <p className="text-sm font-medium">Found {clients.clients.length} {clients.clients.length === 1 ? "client" : "clients"} with an email.</p>
              {clients.noEmail || clients.duplicates ? (
                <p className="mt-1 text-xs text-neutral-500">
                  {[clients.noEmail ? `${clients.noEmail} without an email left out` : null, clients.duplicates ? `${clients.duplicates} repeats left out` : null].filter(Boolean).join(", ")}.
                </p>
              ) : null}
              <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-neutral-700">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-ink" />
                <span>These are my own clients, and each of them has booked with me in the last two years. I&apos;m allowed to email them about booking with me.</span>
              </label>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={addClients} disabled={!clients.clients.length || !consent || busy === "clients"} className={primary}>
                  {busy === "clients" ? "Adding…" : `Add ${clients.clients.length} clients`}
                </button>
                <button type="button" onClick={() => { setClientText(""); setClientFile(null); }} className={secondary}>
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          {state.clients.length ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-medium text-neutral-500">
                  {state.clients.length} on your list · {state.clients.filter((c) => c.invited).length} invited
                </p>
                <button type="button" onClick={() => invite(toInvite)} disabled={!toInvite || busy === "invite"} className={primary}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {busy === "invite" ? "Sending…" : toInvite ? `Invite ${toInvite}` : "Everyone's invited"}
                </button>
              </div>
              <ul className="mt-3 max-h-72 divide-y divide-hairline overflow-y-auto rounded-2xl ring-1 ring-ink/[0.06]">
                {state.clients.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {c.name || c.email}
                      {c.name ? <span className="text-neutral-500"> · {c.email}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">{c.unsubscribed ? "Unsubscribed" : c.invited ? "Invited" : ""}</span>
                    <button type="button" aria-label="Remove" onClick={() => remove("remove-client", c.id)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-700">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
