import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { sendPushToUser } from "@/app/lib/push";
import { appointmentInstant } from "@/app/lib/bookingTime";
import { cleanServiceLabel } from "@/app/lib/serviceLabel";

// Once an appointment's end time passes, nudge the professional to mark it
// complete. Marking it sends the customer a "confirm your appointment is
// complete" push (app/api/bookings/complete), and confirming releases the
// payout. Each booking is nudged once (bookings.completion_nudge_sent_at).
//
// Meant to run every ~15 minutes (.github/workflows/completion-nudges.yml);
// vercel.json also runs it daily as a fallback.
const NUDGE_WINDOW_HOURS = 24; // older than this, auto-complete takes over

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data: candidates, error } = await supabase
    .from("bookings")
    .select("id, booking_date, end_time, professional_id, customer_id, request_id, service_name")
    .eq("status", "confirmed")
    .is("completion_nudge_sent_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const due = (candidates || []).filter((booking) => {
    if (!booking.booking_date || !booking.end_time) return false;
    const endedAt = appointmentInstant(booking.booking_date, booking.end_time).getTime();
    return endedAt <= now && now - endedAt <= NUDGE_WINDOW_HOURS * 3600 * 1000;
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.lineup-aesthetics.ca";
  let nudged = 0;

  for (const booking of due) {
    // Claim it first so overlapping runs can't double-send.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({ completion_nudge_sent_at: new Date().toISOString() })
      .eq("id", booking.id)
      .is("completion_nudge_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const service = cleanServiceLabel(booking.service_name) || "Your appointment";

    await supabase.from("notifications").insert([
      {
        user_id: booking.professional_id,
        request_id: booking.request_id || null,
        is_read: false,
        type: "completion_nudge",
        title: `${service} has ended — mark it complete to get paid`,
      },
    ]);

    await sendPushToUser(booking.professional_id, {
      title: "Mark it complete",
      body: `${service} has ended. Mark it complete so your client can confirm and you get paid.`,
      url: `${siteUrl}/bookings/${booking.id}`,
    }).catch((err) => console.error(`Completion nudge push failed for ${booking.id}:`, err));

    nudged += 1;
  }

  return NextResponse.json({ ok: true, checked: (candidates || []).length, nudged });
}
