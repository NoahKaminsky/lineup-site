import { NextResponse } from "next/server";
import { getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";

// Newsletter sign-up from /news (and anywhere else on the public site).
// Adds the email to lineup_signups with marketing consent, or re-subscribes
// it if it was there before. Every email has an unsubscribe link.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const service = getServiceSupabase();
    const { data: existing } = await service.from("lineup_signups").select("email").eq("email", email).limit(1);

    const fields = { marketing_consent: true, unsubscribed_from_marketing: false, unsubscribed_at: null };
    const { error } =
      existing && existing.length > 0
        ? await service.from("lineup_signups").update(fields).eq("email", email)
        : await service.from("lineup_signups").insert({ email, ...fields });

    if (error) {
      console.error("Newsletter sign-up failed:", error.message);
      return NextResponse.json({ error: "Couldn't sign you up just now. Try again in a minute." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Newsletter sign-up failed:", error);
    return NextResponse.json({ error: "Couldn't sign you up just now. Try again in a minute." }, { status: 500 });
  }
}
