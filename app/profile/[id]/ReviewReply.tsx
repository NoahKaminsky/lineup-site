"use client";

// The pro's public reply under a review, and (for that pro) a box to write
// or change it.

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ReviewReply({
  reviewId,
  reply,
  proName,
  canReply,
  onSaved,
}: {
  reviewId: string;
  reply: string | null;
  proName: string;
  canReply: boolean;
  onSaved: (reply: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reply || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = proName.split(" ")[0];

  async function save() {
    setBusy(true);
    setError("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/reviews/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ reviewId, reply: text }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "Couldn't save your reply.");
    onSaved(json.reply ?? null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-4 max-w-2xl">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={3}
          autoFocus
          placeholder="Thanks for coming in! See you next time."
          aria-label="Your reply"
          className="w-full rounded-2xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-ink outline-none ring-1 ring-inset ring-ink/[0.08] focus:bg-white focus:ring-2 focus:ring-ink"
        />
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={save} disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
            {busy ? "Saving…" : "Post reply"}
          </button>
          <button type="button" onClick={() => { setEditing(false); setText(reply || ""); }} className="rounded-full px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
            Cancel
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Everyone who visits your profile can see this. Leave it empty and post to remove it.</p>
      </div>
    );
  }

  return (
    <>
      {reply ? (
        <div className="mt-4 max-w-2xl rounded-2xl bg-neutral-50 px-4 py-3 ring-1 ring-inset ring-ink/[0.05]">
          <p className="text-xs font-medium text-neutral-500">Reply from {first}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-neutral-700">{reply}</p>
        </div>
      ) : null}
      {canReply ? (
        <button type="button" onClick={() => setEditing(true)} className="mt-3 text-sm font-medium text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
          {reply ? "Edit your reply" : "Reply"}
        </button>
      ) : null}
    </>
  );
}
