"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { jurisdictionLabel } from "@/app/lib/verificationRules";

type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  professional_types?: string[] | null;
  professional_type?: string | null;
  formatted_address?: string | null;
  location?: string | null;
  verification_status?: string | null;
  created_at?: string;
};

type Submission = {
  id: string;
  professional_id: string;
  track: "licensed" | "student";
  profession_type: string;
  jurisdiction: string | null;
  license_number: string | null;
  issuing_body: string | null;
  license_expiry: string | null;
  school_name: string | null;
  enrollment_end_date: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  admin_note: string | null;
  is_manual: boolean;
  reviewed_at: string | null;
  created_at: string;
  document_url: string | null;
  id_document_url?: string | null;
  professional: Person | null;
};

async function authedFetch(url: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
}

function typesOf(person: Person | null) {
  if (!person) return "";
  const types =
    person.professional_types && person.professional_types.length > 0
      ? person.professional_types
      : person.professional_type
      ? [person.professional_type]
      : [];
  return types.map((t) => t.replaceAll("_", " ")).join(", ");
}

export default function AdminVerifications() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Submission[]>([]);
  const [recent, setRecent] = useState<Submission[]>([]);
  const [needsAttention, setNeedsAttention] = useState<Person[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/verifications");
    const json = await res.json();

    if (!res.ok) {
      setMessage(json.error || "Could not load verifications.");
      setLoading(false);
      return;
    }

    setPending(json.pending || []);
    setRecent(json.recent || []);
    setNeedsAttention(json.needsAttention || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch; state is only set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function post(body: Record<string, unknown>, busyKey: string) {
    setBusyId(busyKey);
    setMessage("");

    const res = await authedFetch("/api/admin/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    setBusyId(null);

    if (!res.ok) {
      setMessage(json.error || "Something went wrong.");
      return false;
    }

    setRejectingId(null);
    await load();
    return true;
  }

  return (
    <div className="mt-6 space-y-8">
      {message ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">{message}</div>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">Waiting for review ({pending.length})</h2>
        {loading ? (
          <p className="mt-3 text-sm text-neutral-500">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nothing to review right now.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pending.map((s) => (
              <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {s.professional?.full_name || "Unnamed"}{" "}
                      <span className="text-sm font-normal text-neutral-500">{s.professional?.email}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Signed up as: {typesOf(s.professional) || "—"} · submitted{" "}
                      {new Date(s.created_at).toLocaleString("en-CA")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      s.track === "student" ? "bg-sky-100 text-sky-800" : "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {s.track === "student" ? "Student" : "Licensed"}
                  </span>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="inline text-neutral-500">Profession: </dt>
                    <dd className="inline font-medium">{s.profession_type.replaceAll("_", " ")}</dd>
                  </div>
                  {s.track === "licensed" ? (
                    <>
                      <div>
                        <dt className="inline text-neutral-500">Region: </dt>
                        <dd className="inline font-medium">{jurisdictionLabel(s.jurisdiction) || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-neutral-500">Number: </dt>
                        <dd className="inline font-medium">{s.license_number || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-neutral-500">Issued by: </dt>
                        <dd className="inline font-medium">{s.issuing_body || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-neutral-500">Expires: </dt>
                        <dd className="inline font-medium">{s.license_expiry || "no expiry given"}</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt className="inline text-neutral-500">School: </dt>
                        <dd className="inline font-medium">{s.school_name || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-neutral-500">Finishes: </dt>
                        <dd className="inline font-medium">{s.enrollment_end_date || "—"}</dd>
                      </div>
                    </>
                  )}
                </dl>

                <div className="mt-3">
                  {s.document_url ? (
                    <a
                      href={s.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium underline"
                    >
                      View document ↗
                    </a>
                  ) : (
                    <span className="text-sm text-neutral-500">No document attached</span>
                  )}
                  {s.id_document_url ? (
                    <a
                      href={s.id_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 text-sm font-medium underline"
                    >
                      View ID ↗
                    </a>
                  ) : (
                    <span className="ml-4 text-sm text-neutral-500">No ID attached</span>
                  )}
                  <span className="ml-2 text-xs text-neutral-400">(link expires in 10 minutes — reload for a new one)</span>
                </div>

                {rejectingId === s.id ? (
                  <div className="mt-4 space-y-2">
                    <input
                      value={reasons[s.id] || ""}
                      onChange={(e) => setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      placeholder="Reason (they'll see this) — e.g. document is unreadable"
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => post({ action: "reject", id: s.id, reason: reasons[s.id] || "" }, s.id)}
                        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(null)}
                        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => post({ action: "approve", id: s.id }, s.id)}
                      className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {busyId === s.id ? "Working…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectingId(s.id)}
                      className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Professionals without verification ({needsAttention.length})</h2>
        <p className="mt-1 text-sm text-neutral-500">
          These are hidden from Browse and can&apos;t send offers. Approve someone you know is legitimate
          (test or founding accounts, say) without documents — a note is required and saved on the record.
        </p>
        {needsAttention.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Everyone is verified or has something waiting.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {needsAttention.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold">{p.full_name || "Unnamed"}</p>
                  <p className="text-xs text-neutral-500">
                    {p.email} · {typesOf(p) || "—"} · {p.verification_status}
                  </p>
                </div>
                <input
                  value={notes[p.id] || ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="Why approve without documents?"
                  className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() =>
                    post({ action: "manual_approve", professionalId: p.id, note: notes[p.id] || "" }, p.id)
                  }
                  className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busyId === p.id ? "Working…" : "Approve"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recently reviewed</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No reviews yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {recent.map((s) => (
              <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                <span className="font-semibold">{s.professional?.full_name || "Unnamed"}</span>{" "}
                <span className="text-neutral-500">
                  · {s.track} · {s.status}
                  {s.is_manual ? " (manual)" : ""}
                  {s.rejection_reason ? ` — ${s.rejection_reason}` : ""}
                  {s.admin_note ? ` — ${s.admin_note}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
