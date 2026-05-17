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

export async function GET() {
  try {
    const supabase = getServiceSupabase();

    const now = new Date();

    const { data: bookings } = await supabase
      .from("bookings")
      .select(`
        *,
        customer:customer_id ( email ),
        professional:professional_id ( email )
      `)
      .eq("status", "confirmed");

    for (const booking of bookings || []) {
      const start = new Date(
        `${booking.booking_date}T${booking.start_time}`
      );

      const diffMinutes =
        (start.getTime() - now.getTime()) / (1000 * 60);

      const emails = [
        booking.customer?.email,
        booking.professional?.email,
      ].filter(Boolean);

      // 🔹 24 HOUR REMINDER
      if (
        diffMinutes <= 1440 &&
        diffMinutes > 1380 &&
        !booking.reminder_24h_sent_at
      ) {
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

      // 🔹 2 HOUR REMINDER
      if (
        diffMinutes <= 120 &&
        diffMinutes > 90 &&
        !booking.reminder_2h_sent_at
      ) {
        for (const email of emails) {
          await sendEmail({
            to: email,
            subject: "Appointment soon",
            html: `
              <h2>Reminder</h2>
              <p>Your appointment is in 2 hours.</p>
              <p><strong>${formatDate(booking.booking_date)}</strong></p>
              <p>${formatTime(booking.start_time)}</p>
            `,
          });
        }

        await supabase
          .from("bookings")
          .update({
            reminder_2h_sent_at: new Date().toISOString(),
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