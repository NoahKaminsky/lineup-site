import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { completeBooking } from "@/app/lib/bookingCompletion";

const AUTO_COMPLETE_HOURS_PAST_END = 24;

// Safety net so a professional always gets paid even if the customer never
// taps "confirm completion" (or the professional forgets to request it).
// Runs once a day (see vercel.json) — actual latency past the 24h mark
// depends on how often this cron fires, not a hard real-time guarantee.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = req.headers.get("authorization");

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabase = getServiceSupabase();

    const { data: candidates, error } = await supabase
      .from("bookings")
      .select("id, booking_date, end_time, status, request_id, professional_id, customer_id, service_name")
      .in("status", ["confirmed", "completion_requested"]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cutoff = Date.now() - AUTO_COMPLETE_HOURS_PAST_END * 60 * 60 * 1000;

    const stale = (candidates || []).filter((booking) => {
      if (!booking.booking_date || !booking.end_time) return false;
      const endAt = new Date(`${booking.booking_date}T${String(booking.end_time).slice(0, 5)}`);
      return endAt.getTime() <= cutoff;
    });

    let completed = 0;
    let failed = 0;

    for (const booking of stale) {
      const result = await completeBooking(booking.id, "auto");

      if (result.ok) {
        completed += 1;

        await supabase.from("notifications").insert([
          {
            user_id: booking.professional_id,
            request_id: booking.request_id || null,
            is_read: false,
            type: "booking_completed",
            title: `${booking.service_name || "Your service"} was automatically marked complete`,
          },
          {
            user_id: booking.customer_id,
            request_id: booking.request_id || null,
            is_read: false,
            type: "booking_completed",
            title: `${booking.service_name || "Your booking"} was automatically marked complete`,
          },
        ]);
      } else {
        failed += 1;
        console.error(`Auto-complete failed for booking ${booking.id}:`, result.error);
      }
    }

    return NextResponse.json({ ok: true, checked: stale.length, completed, failed });
  } catch (err: any) {
    console.error("Auto-complete cron error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
