"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Counts = {
  recipients: number;
  profiles: number;
  signups: number;
  everyone: number;
  unsubscribed: number;
  noConsent: number;
};

async function authedFetch(url: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
}

export default function AdminNewsletter() {
  const [subject, setSubject] = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authedFetch("/api/admin/newsletter");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load the mailing list.");
    } else {
      setSubject(json.subject);
      setCounts(json.counts);
      setAdminEmail(json.adminEmail);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendTest() {
    setBusy("test");
    setError("");
    setNotice("");
    const res = await authedFetch("/api/admin/newsletter", {
      method: "POST",
      body: JSON.stringify({ action: "test" }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setTestSent(true);
      setNotice(`Test sent to ${json.sentTo}. Check your inbox (and spam folder).`);
    } else {
      setError(json.error || "Test send failed.");
    }
    setBusy(null);
  }

  async function sendAll() {
    if (!counts) return;
    setBusy("send");
    setError("");
    setNotice("");
    const res = await authedFetch("/api/admin/newsletter", {
      method: "POST",
      body: JSON.stringify({ action: "send", confirmCount: counts.recipients }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok || json.sent) {
      setNotice(
        json.failed
          ? `Sent to ${json.sent} of ${json.total}. ${json.failed} failed — check the Resend dashboard.`
          : `Done — sent to all ${json.sent} people.`
      );
    } else {
      setError(json.error || "Send failed.");
    }
    setConfirming(false);
    setBusy(null);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Launch newsletter</p>
        <h2 className="mt-1 text-lg font-semibold">{subject || "…"}</h2>

        {loading ? (
          <p className="mt-3 text-sm text-neutral-500">Loading the mailing list…</p>
        ) : counts ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-neutral-50 p-3">
              <p className="text-2xl font-semibold">{counts.recipients}</p>
              <p className="text-xs text-neutral-500">will get it (opted in)</p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-3">
              <p className="text-2xl font-semibold">{counts.noConsent}</p>
              <p className="text-xs text-neutral-500">never opted in — skipped</p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-3">
              <p className="text-2xl font-semibold">{counts.unsubscribed}</p>
              <p className="text-xs text-neutral-500">unsubscribed — skipped</p>
            </div>
            <p className="text-xs text-neutral-500 sm:col-span-3">
              From {counts.profiles} accounts and {counts.signups} waitlist sign-ups ({counts.everyone} unique emails).
              Anyone on both lists gets one copy.
            </p>
          </div>
        ) : null}

        {notice ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
        ) : null}
        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={sendTest}
            disabled={!!busy || loading}
            className="rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 disabled:opacity-50"
          >
            {busy === "test" ? "Sending test…" : `1. Send a test to ${adminEmail || "me"}`}
          </button>

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!!busy || loading || !counts || counts.recipients === 0 || !testSent}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              2. Send to everyone
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center">
              <p className="text-sm text-red-800">
                Email {counts?.recipients} people now? This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={sendAll}
                  disabled={!!busy}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "send" ? "Sending…" : "Yes, send it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={!!busy}
                  className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {!testSent && counts && counts.recipients > 0 ? (
          <p className="mt-3 text-xs text-neutral-500">Send yourself a test first — then the send button unlocks.</p>
        ) : null}
      </div>
    </div>
  );
}
