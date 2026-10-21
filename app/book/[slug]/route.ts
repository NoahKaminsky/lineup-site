import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

// Short booking link: lineup-aesthetics.ca/book/<username or id> opens the
// professional's profile at their booking calendar. Booking links are a
// paid-plan feature: for anyone not on Apprentice, Pro or Master the link
// just opens their profile, not a calendar.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clean = decodeURIComponent(slug).trim();
  const safe = encodeURIComponent(clean);

  let paid = false;
  try {
    const query = getServiceSupabase().from("profiles").select("subscription_plan, subscription_status");
    const { data } = UUID.test(clean)
      ? await query.eq("id", clean).maybeSingle()
      : await query.ilike("username", clean).maybeSingle();
    paid =
      !!data &&
      ["apprentice", "pro", "master"].includes(data.subscription_plan || "") &&
      (data.subscription_status === "active" || data.subscription_status === "trialing");
  } catch (error) {
    console.error("Booking link lookup failed:", error);
  }

  return NextResponse.redirect(new URL(`/profile/${safe}${paid ? "#availability" : ""}`, req.url));
}
