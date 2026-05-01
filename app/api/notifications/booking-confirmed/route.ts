import { NextResponse } from "next/server";
import { baseEmailTemplate, escapeHtml, sendEmail } from "@/app/lib/email";
import { getProfileEmail, getServiceSupabase } from "@/app/lib/serverSupabase";

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

export async function POST(req: Request) {
  try {
    const { bookingId } = await req.json();
    if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

    const supabase = getServiceSupabase();

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, professional_id, customer_id, booking_date, start_time, end_time, service_name, formatted_address")
      .eq("id", bookingId)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: error?.message || "Booking not found" }, { status: 404 });
    }

    const [customer, professional] = await Promise.all([
      getProfileEmail(supabase, booking.customer_id),
      getProfileEmail(supabase, booking.professional_id),
    ]);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const href = `${siteUrl}/bookings/${booking.id}`;
    const service = escapeHtml(booking.service_name || "Booked service");
    const when = `${formatDate(booking.booking_date)} • ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}`;
    const location = escapeHtml(booking.formatted_address || "Location not provided");

    const body = `
      <p><strong>Service:</strong> ${service}</p>
      <p><strong>When:</strong> ${escapeHtml(when)}</p>
      <p><strong>Location:</strong> ${location}</p>
    `;

    await Promise.all([
      customer.email
        ? sendEmail({
            to: customer.email,
            subject: "Your LineUp booking is confirmed",
            html: baseEmailTemplate({ title: "Booking confirmed", body, ctaHref: href, ctaLabel: "View booking" }),
          })
        : null,
      professional.email
        ? sendEmail({
            to: professional.email,
            subject: "New LineUp booking confirmed",
            html: baseEmailTemplate({ title: "New booking confirmed", body, ctaHref: href, ctaLabel: "View booking" }),
          })
        : null,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("booking-confirmed notification failed:", error);
    return NextResponse.json({ error: error?.message || "Notification failed" }, { status: 500 });
  }
}
