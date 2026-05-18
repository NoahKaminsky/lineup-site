import { NextResponse } from "next/server";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

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

  if (Number.isNaN(hour)) return "Time not provided";

  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;

  return `${twelveHour}:${minuteString} ${suffix}`;
}

function formatPrice(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return null;

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return null;

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(numericValue);
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

function bookingDetails({
  serviceName,
  price,
  date,
  start,
  end,
  location,
  otherPersonLabel,
  otherPersonName,
}: {
  serviceName: string;
  price?: string | null;
  date: string;
  start: string;
  end: string;
  location?: string | null;
  otherPersonLabel: string;
  otherPersonName?: string | null;
}) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;">
      ${detailRow("Service", serviceName)}
      ${detailRow("Price", price || null)}
      ${detailRow("Date", date)}
      ${detailRow("Time", `${start} - ${end}`)}
      ${detailRow(otherPersonLabel, otherPersonName || "Not provided")}
      ${detailRow("Location", location || null)}
    </table>
  `;
}

export async function POST(req: Request) {
  try {
    const { bookingId } = await req.json();

    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const { data: customer } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", booking.customer_id)
      .single();

    const { data: professional } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", booking.professional_id)
      .single();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const bookingUrl = `${siteUrl}/bookings/${booking.id}`;

    const serviceName = booking.service_name || "Booked service";
    const price = formatPrice(booking.service_price);
    const date = formatDate(booking.booking_date);
    const start = formatTime(booking.start_time);
    const end = formatTime(booking.end_time);
    const location = booking.formatted_address || null;

    let sent = 0;

    if (customer?.email) {
      const customerFirstName = customer.full_name?.split(" ")[0] || "there";
      const professionalName = professional?.full_name || "your professional";

      const customerHtml = createEmailLayout({
        title: "Your booking is confirmed",
        preview: `${serviceName} is booked for ${date} at ${start}.`,
        ctaLabel: "View booking",
        ctaUrl: bookingUrl,
        content: `
          <p style="margin:0 0 16px 0;">Hey ${escapeHtml(customerFirstName)},</p>

          <p style="margin:0 0 16px 0;">
            Your LineUp booking with <strong>${escapeHtml(professionalName)}</strong> is confirmed.
          </p>

          ${bookingDetails({
            serviceName,
            price,
            date,
            start,
            end,
            location,
            otherPersonLabel: "Professional",
            otherPersonName: professionalName,
          })}

          <p style="margin:20px 0 0 0;color:#525252;">
            You can view the booking details anytime from your LineUp account.
          </p>
        `,
      });

      await sendEmail({
        to: customer.email,
        subject: "Your LineUp booking is confirmed",
        html: customerHtml,
      });

      sent += 1;
    }

    if (professional?.email) {
      const professionalFirstName = professional.full_name?.split(" ")[0] || "there";
      const customerName = customer?.full_name || "your client";

      const professionalHtml = createEmailLayout({
        title: "New booking confirmed",
        preview: `${customerName} booked ${serviceName} for ${date} at ${start}.`,
        ctaLabel: "View booking",
        ctaUrl: bookingUrl,
        content: `
          <p style="margin:0 0 16px 0;">Hey ${escapeHtml(professionalFirstName)},</p>

          <p style="margin:0 0 16px 0;">
            You have a confirmed LineUp booking with <strong>${escapeHtml(customerName)}</strong>.
          </p>

          ${bookingDetails({
            serviceName,
            price,
            date,
            start,
            end,
            location,
            otherPersonLabel: "Client",
            otherPersonName: customerName,
          })}

          <p style="margin:20px 0 0 0;color:#525252;">
            Make sure your availability and service details are up to date before the appointment.
          </p>
        `,
      });

      await sendEmail({
        to: professional.email,
        subject: "New LineUp booking confirmed",
        html: professionalHtml,
      });

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (error: any) {
    console.error("booking-confirmed notification failed:", error);

    return NextResponse.json(
      { error: error?.message || "Notification failed" },
      { status: 500 }
    );
  }
}
