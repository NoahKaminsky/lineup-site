import { NextResponse } from "next/server";
import { sendEmail } from "@/app/lib/email";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

export const dynamic = "force-dynamic";

function formatDate(dateString?: string | null) {
  if (!dateString) return "Date not provided";

  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeString?: string | null) {
  if (!timeString) return "Time not provided";

  const [hourString, minuteString = "00"] = String(timeString).slice(0, 5).split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;

  return `${twelveHour}:${minuteString} ${suffix}`;
}

function bookingStartDate(booking: any) {
  return new Date(`${booking.booking_date}T${String(booking.start_time).slice(0, 5)}:00`);
}

async function sendReminderEmail({
  supabase,
  booking,
  reminderLabel,
}: {
  supabase: ReturnType<typeof getServiceSupabase>;
  booking: any;
  reminderLabel: string;
}) {
  const { data: customer } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", booking.customer_id)
    .single();

  const { data: professional } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", booking.professional_id)
    .single();

  const recipients = [customer?.email, professional?.email].filter(Boolean) as string[];

  if (recipients.length === 0) return false;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const bookingUrl = `${siteUrl}/bookings/${booking.id}`;

  const html = `
    <h2>Appointment reminder</h2>
    <p>This is your ${reminderLabel} appointment reminder.</p>
    <p><strong>Service:</strong> ${booking.service_name || "Booked service"}</p>
    <p><strong>Time:</strong> ${formatDate(booking.booking_date)} · ${formatTime(
      booking.start_time
    )} - ${formatTime(booking.end_time)}</p>
    ${
      booking.formatted_address
        ? `<p><strong>Location:</strong> ${booking.formatted_address}</p>`
        : ""
    }
    <p><a href="${bookingUrl}">View booking</a></p>
  `;

  for (const email of recipients) {
    await sendEmail({
      to: email,
      subject: `LineUp appointment reminder: ${reminderLabel}`,
      html,
    });
  }

  return true;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const now = new Date();
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const today = now.toISOString().slice(0, 10);
    const maxDate = in25Hours.toISOString().slice(0, 10);

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("status", "confirmed")
      .gte("booking_date", today)
      .lte("booking_date", maxDate);

    if (error) throw error;

    let sent24h = 0;
    let sent2h = 0;

    for (const booking of bookings || []) {
      const start = bookingStartDate(booking);
      const minutesUntil = (start.getTime() - now.getTime()) / 60000;

      if (
        minutesUntil <= 24 * 60 &&
        minutesUntil > 23 * 60 &&
        !booking.reminder_24h_sent_at
      ) {
        const sent = await sendReminderEmail({
          supabase,
          booking,
          reminderLabel: "24-hour",
        });

        if (sent) {
          await supabase
            .from("bookings")
            .update({ reminder_24h_sent_at: new Date().toISOString() })
            .eq("id", booking.id);

          sent24h += 1;
        }
      }

      if (
        minutesUntil <= 2 * 60 &&
        minutesUntil > 90 &&
        !booking.reminder_2h_sent_at
      ) {
        const sent = await sendReminderEmail({
          supabase,
          booking,
          reminderLabel: "2-hour",
        });

        if (sent) {
          await supabase
            .from("bookings")
            .update({ reminder_2h_sent_at: new Date().toISOString() })
            .eq("id", booking.id);

          sent2h += 1;
        }
      }
    }

    return NextResponse.json({ ok: true, sent24h, sent2h });
  } catch (error: any) {
    console.error("Reminder route failed:", error);
    return NextResponse.json(
      { error: error?.message || "Reminder route failed" },
      { status: 500 }
    );
  }
}
