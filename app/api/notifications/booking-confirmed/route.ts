import { NextResponse } from "next/server";
import { sendEmail } from "@/app/lib/email";
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
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;

  return `${twelveHour}:${minuteString} ${suffix}`;
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
    const date = formatDate(booking.booking_date);
    const start = formatTime(booking.start_time);
    const end = formatTime(booking.end_time);
    const locationLine = booking.formatted_address
      ? `<p><strong>Location:</strong> ${booking.formatted_address}</p>`
      : "";

    const html = `
      <h2>Booking confirmed</h2>
      <p>Your LineUp booking is confirmed.</p>
      <p><strong>Service:</strong> ${serviceName}</p>
      <p><strong>Time:</strong> ${date} · ${start} - ${end}</p>
      ${locationLine}
      <p><a href="${bookingUrl}">View booking</a></p>
    `;

    const recipients = [customer?.email, professional?.email].filter(Boolean) as string[];

    for (const email of recipients) {
      await sendEmail({
        to: email,
        subject: "Your LineUp booking is confirmed",
        html,
      });
    }

    return NextResponse.json({ ok: true, sent: recipients.length });
  } catch (error: any) {
    console.error("booking-confirmed notification failed:", error);
    return NextResponse.json(
      { error: error?.message || "Notification failed" },
      { status: 500 }
    );
  }
}
