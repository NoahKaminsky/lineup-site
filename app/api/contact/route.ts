import { NextResponse } from "next/server";
import { Resend } from "resend";
import { escapeHtml } from "@/app/lib/email";
import { isSameOriginRequest } from "@/app/lib/serverSupabase";

// Contact form on /contact: emails the LineUp inbox, with Reply going
// straight back to the person who wrote in.
const TO = "lineupmb@gmail.com";
const FROM = "LineUp <hello@lineup-aesthetics.ca>";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOPICS = ["Client", "Pro", "Business", "Press", "Other"];

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  // Bots fill every field; people never see this one.
  if (body?.website) return NextResponse.json({ ok: true });

  const name = String(body?.name || "").trim().slice(0, 100);
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 254);
  const topic = TOPICS.includes(body?.topic) ? String(body.topic) : "Other";
  const message = String(body?.message || "").trim().slice(0, 4000);

  if (!name) return NextResponse.json({ error: "Add your name." }, { status: 400 });
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email so we can reply." }, { status: 400 });
  if (message.length < 5) return NextResponse.json({ error: "Write a short message." }, { status: 400 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Messages aren't set up yet. Email us instead." }, { status: 500 });

  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: FROM,
    to: [TO],
    replyTo: email,
    subject: `Contact form (${topic}): ${name}`,
    html: `<p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) · ${escapeHtml(topic)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
  });

  if (error) {
    console.error("Contact form send failed:", error);
    return NextResponse.json({ error: "Couldn't send that. Try again, or email us directly." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
