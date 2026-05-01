import { NextResponse } from "next/server";
import { baseEmailTemplate, escapeHtml, sendEmail } from "@/app/lib/email";
import { getProfileEmail, getServiceSupabase } from "@/app/lib/serverSupabase";

export const dynamic = "force-dynamic";

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time: string) {
  const [hourString, minute = "00"] = String(time).slice(0, 5).split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${suffix}`;
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
  const customer = await getProfileEmail(supabase, booking.customer_id);
  const professional = await getProfileEmail(supabase, booking.professional_id);

  const recipients = [customer.email, professional.email].filter(Boolean) as string[];
  if (recipients.length === 0) return false;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const href = `${siteUrl}/bookings/${booking.id}`;

  const body = `
    <p>This is your ${escapeHtml(reminderLabel)} appointment reminder.</p>
    <p><strong>Service:</strong> ${escapeHtml(booking.service_name || "Booked service")}</p>
    <p><strong>Time:</strong> ${escapeHtml(formatDate(booking.booking_date))} · ${escapeHtml(
      formatTime(booking.start_time)
    )} - ${escapeHtml(formatTime(booking.end_time))}</p>
    ${
      booking.formatted_address
        ? `<p><strong>Location:</strong> ${escapeHtml(booking.formatted_address)}</p>`
        : ""
    }
  `;

  await sendEmail({
    to: recipients,
    subject: `LineUp appointment reminder: ${reminderLabel}`,
    html: baseEmailTemplate({
      title: "Appointment reminder",
      body,
      ctaHref: href,
      ctaLabel: "View booking",
    }),
  });

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
