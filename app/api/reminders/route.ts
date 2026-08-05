import { NextResponse } from "next/server";
import { sendEmail } from "@/app/lib/email";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

function formatDate(dateString?: string | null) {
  if (!dateString) return "Date not provided";

  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timeString?: string | null) {
  if (!timeString) return "Time not provided";

  const [hourString, minuteString] = String(timeString).slice(0, 5).split(":");
  const hour = Number(hourString);
  const minute = minuteString || "00";
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;

  return `${twelveHour}:${minute} ${suffix}`;
}

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

    const now = new Date();

    // This cron runs once a day (see vercel.json). Matching a narrow time-of-day
    // window (e.g. "23-24h out right now") only reliably reaches bookings whose
    // start time happens to align with when the cron fires, silently skipping
    // everyone else. Matching on calendar date instead guarantees every confirmed
    // booking scheduled for tomorrow gets exactly one reminder from this run.
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowDateString = tomorrow.toISOString().slice(0, 10);

    const { data: bookings } = await supabase
      .from("bookings")
      .select(`
        *,
        customer:customer_id ( email ),
        professional:professional_id ( email )
      `)
      .eq("status", "confirmed")
      .eq("booking_date", tomorrowDateString);

    for (const booking of bookings || []) {
      const emails = [
        booking.customer?.email,
        booking.professional?.email,
      ].filter(Boolean);

      // 🔹 24 HOUR REMINDER
      if (!booking.reminder_24h_sent_at) {
        for (const email of emails) {
          await sendEmail({
            to: email,
            subject: "Appointment tomorrow",
            html: `
              <h2>Reminder</h2>
              <p>Your appointment is tomorrow.</p>
              <p><strong>${formatDate(booking.booking_date)}</strong></p>
              <p>${formatTime(booking.start_time)}</p>
            `,
          });
        }

        await supabase
          .from("bookings")
          .update({
            reminder_24h_sent_at: new Date().toISOString(),
          })
          .eq("id", booking.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Reminder error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}