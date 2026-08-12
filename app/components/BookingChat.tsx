"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { containsProfanity } from "@/app/lib/profanityFilter";

type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

export default function BookingChat({ bookingId, viewerId }: { bookingId: string; viewerId: string | null }) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    async function loadMessages() {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("booking_messages")
        .select("id, booking_id, sender_id, message, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) {
        setError(error.message);
        setMessages([]);
      } else {
        setMessages((data || []) as BookingMessage[]);
      }
      setLoading(false);
    }
    loadMessages();
    const channel = supabase
      .channel(`booking-chat-${bookingId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "booking_messages", filter: `booking_id=eq.${bookingId}` }, (payload) => {
        setMessages((prev) => {
          const incoming = payload.new as BookingMessage;
          if (prev.some((msg) => msg.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  useEffect(() => {
    // Scroll only within the chat's own message list — never the page. Using
    // scrollIntoView here would drag the whole page down to this section on
    // every load, since most bookings already have a system message.
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  async function sendMessage() {
    const cleanText = text.trim();
    if (!cleanText || !viewerId || sending) return;

    if (containsProfanity(cleanText)) {
      setError("That message contains language that isn't allowed here. Please rephrase it.");
      return;
    }

    setSending(true);
    setError("");
    const { error } = await supabase.from("booking_messages").insert({ booking_id: bookingId, sender_id: viewerId, message: cleanText });
    if (error) setError(error.message);
    else setText("");
    setSending(false);
  }

  return (
    <div className="mt-5">
      <div
        ref={scrollContainerRef}
        className="min-h-[180px] max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
      >
        {loading ? (
          <p className="text-sm text-neutral-500">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-neutral-500">No messages yet. Send the first message about this booking.</p>
        ) : (
          messages.map((msg) => {
            const mine = msg.sender_id === viewerId;
            return (
              <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm leading-6 ${mine ? "bg-black text-white" : "border border-neutral-200 bg-white text-neutral-900"}`}>
                  <p>{msg.message}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/60" : "text-neutral-400"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      {error ? <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} placeholder="Message about this booking..." className="min-w-0 flex-1 rounded-full border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-black" />
        <button type="button" onClick={sendMessage} disabled={!viewerId || !text.trim() || sending} className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
