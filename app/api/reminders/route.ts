import { NextResponse } from "next/server";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
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

  const [hourString, minuteString = "00"] = String(timeString).slice(0, 5).split(":");
  const hour = Number(hourString);

  if (Number.isNaN(hour)) return "Time not provided";

  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;

  return `${twelveHour}:${minuteString} ${suffix}`;
}

function detailRow(label: string, value: string | null | undefined) {
  if (!value) return "";

  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#737373;font-size:14px;">
        ${escapeHtml(label)}
      </td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#111111;font-size:14px;font-weight:600;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
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
        customer:customer_id ( email, full_name ),
        professional:professional_id ( email, full_name )
      `)
      .eq("status", "confirmed")
      .eq("booking_date", tomorrowDateString);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    let sent = 0;

    for (const booking of bookings || []) {
      if (booking.reminder_24h_sent_at) continue;

      const bookingUrl = `${siteUrl}/bookings/${booking.id}`;
      const serviceName = booking.service_name || "your appointment";
      const date = formatDate(booking.booking_date);
      const start = formatTime(booking.start_time);
      const end = formatTime(booking.end_time);
      const location = booking.formatted_address || null;

      const customerName = booking.customer?.full_name || "your client";
      const professionalName = booking.professional?.full_name || "your professional";

      if (booking.customer?.email) {
        const customerFirstName = booking.customer.full_name?.split(" ")[0] || "there";

        const html = createEmailLayout({
          title: "Appointment tomorrow",
          preview: `${serviceName} with ${professionalName} is tomorrow at ${start}.`,
          ctaLabel: "Message your professional",
          ctaUrl: bookingUrl,
          content: `
            <p style="margin:0 0 16px 0;">Hey ${escapeHtml(customerFirstName)},</p>

            <p style="margin:0 0 16px 0;">
              Just a heads up — your booking with <strong>${escapeHtml(professionalName)}</strong> is tomorrow.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;">
              ${detailRow("Service", serviceName)}
              ${detailRow("Date", date)}
              ${detailRow("Time", `${start} - ${end}`)}
              ${detailRow("Professional", professionalName)}
              ${detailRow("Location", location)}
            </table>

            <p style="margin:20px 0 0 0;color:#525252;">
              Running late or need to change something? Send ${escapeHtml(professionalName.split(" ")[0] || "them")} a quick message on LineUp so you're both on the same page before you meet.
            </p>
          `,
        });

        await sendEmail({
          to: booking.customer.email,
          subject: "Your LineUp appointment is tomorrow",
          html,
        });

        sent += 1;
      }

      if (booking.professional?.email) {
        const professionalFirstName = booking.professional.full_name?.split(" ")[0] || "there";

        const html = createEmailLayout({
          title: "Booking tomorrow",
          preview: `Booking with ${customerName} at ${start} tomorrow.`,
          ctaLabel: "Message your client",
          ctaUrl: bookingUrl,
          content: `
            <p style="margin:0 0 16px 0;">Hey ${escapeHtml(professionalFirstName)},</p>

            <p style="margin:0 0 16px 0;">
              You're booked with <strong>${escapeHtml(customerName)}</strong> tomorrow.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;">
              ${detailRow("Service", serviceName)}
              ${detailRow("Date", date)}
              ${detailRow("Time", `${start} - ${end}`)}
              ${detailRow("Client", customerName)}
              ${detailRow("Location", location)}
            </table>

            <p style="margin:20px 0 0 0;color:#525252;">
              Worth sending ${escapeHtml(customerName.split(" ")[0] || "your client")} a quick message on LineUp to confirm details before the appointment.
            </p>
          `,
        });

        await sendEmail({
          to: booking.professional.email,
          subject: "You have a LineUp booking tomorrow",
          html,
        });

        sent += 1;
      }

      await supabase
        .from("bookings")
        .update({
          reminder_24h_sent_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err: any) {
    console.error("Reminder error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
