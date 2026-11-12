"use client";

// A pro's private notes on a client: shown on every booking with them, only
// to that pro ("a 2 on the sides", colour formula, allergies). Saved as they
// type stops; the database only lets the pro read and write their own notes.

import { useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function ClientNotes({ professionalId, customerId, clientName }: { professionalId: string; customerId: string; clientName: string }) {
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const timer = useRef<number | null>(null);
  const saved = useRef("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("pro_client_notes")
      .select("note")
      .eq("professional_id", professionalId)
      .eq("customer_id", customerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setNote(data?.note || "");
        saved.current = data?.note || "";
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [professionalId, customerId]);

  async function save(value: string) {
    if (value === saved.current) return;
    setStatus("saving");
    const { error } = await supabase
      .from("pro_client_notes")
      .upsert({ professional_id: professionalId, customer_id: customerId, note: value, updated_at: new Date().toISOString() });
    if (error) return setStatus("error");
    saved.current = value;
    setStatus("saved");
  }

  function change(value: string) {
    setNote(value);
    setStatus("");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(value), 800);
  }

  const first = clientName.split(" ")[0] || "this client";

  return (
    <section className="mt-4 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <NotebookPen className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ink">Your notes on {first}</p>
            <p className="mt-1 text-sm text-neutral-500">Only you see these. They show on every booking with {first}.</p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-neutral-400" aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Didn't save" : ""}
        </span>
      </div>
      <textarea
        value={note}
        disabled={!loaded}
        onChange={(e) => change(e.target.value)}
        onBlur={() => void save(note)}
        maxLength={4000}
        rows={4}
        placeholder="e.g. Skin fade, a 2 on the sides, keeps the length on top. Sensitive scalp."
        aria-label={`Your notes on ${first}`}
        className="mt-4 w-full rounded-2xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-ink outline-none ring-1 ring-inset ring-ink/[0.08] focus:bg-white focus:ring-2 focus:ring-ink"
      />
    </section>
  );
}
