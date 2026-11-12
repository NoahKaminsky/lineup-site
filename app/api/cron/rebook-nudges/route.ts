import { NextResponse } from "next/server";
import { getServiceSupabase, isCronAuthorized } from "@/app/lib/serverSupabase";
import { sendPushToUser } from "@/app/lib/push";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { getProfileHref } from "@/app/lib/profileLink";
import { cleanServiceLabel } from "@/app/lib/serviceLabel";

// Daily (vercel.json). Three weeks after a completed booking, if the client
// hasn't booked that pro again and isn't a regular with them, send one
// "time for your next one?" nudge (bookings.rebook_nudge_sent_at), with a
// link straight to the pro's open times. Bookings older than four weeks are
// left alone, so switching this on doesn't nudge about old visits.

const AFTER_DAYS = 21;
const UNTIL_DAYS = 28;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceSupabase();
  const now = Date.now();
  const { data: due, error } = await supabase
    .from("bookings")
    .select("id, professional_id, customer_id, booking_date, service_name")
    .eq("status", "completed")
    .is("rebook_nudge_sent_at", null)
    .lte("completed_at", new Date(now - AFTER_DAYS * 86_400_000).toISOString())
    .gte("completed_at", new Date(now - UNTIL_DAYS * 86_400_000).toISOString())
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const site = getSiteUrl("https://www.lineup-aesthetics.ca");
  let nudged = 0;

  for (const booking of due || []) {
    // Claim first so overlapping runs can't double-send.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({ rebook_nudge_sent_at: new Date().toISOString() })
      .eq("id", booking.id)
      .is("rebook_nudge_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;

    // Already booked them again, or a regular with them: nothing to say.
    const [{ count: later }, { count: regular }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", booking.customer_id)
        .eq("professional_id", booking.professional_id)
        .gt("booking_date", booking.booking_date)
        .in("status", ["confirmed", "completion_requested", "completed"]),
      supabase
        .from("standing_appointments")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", booking.customer_id)
        .eq("professional_id", booking.professional_id)
        .eq("status", "active"),
    ]);
    if ((later || 0) > 0 || (regular || 0) > 0) continue;

    const [{ data: pro }, { data: client }] = await Promise.all([
      supabase.from("profiles").select("id, username, full_name").eq("id", booking.professional_id).maybeSingle(),
      supabase.from("profiles").select("email, full_name, unsubscribed_from_marketing").eq("id", booking.customer_id).maybeSingle(),
    ]);
    if (!pro) continue;
    const proName = pro.full_name || "your pro";
    const service = cleanServiceLabel(booking.service_name) || "appointment";
    const link = `${site}${getProfileHref(pro)}#availability`;

    await supabase.from("notifications").insert([
      {
        user_id: booking.customer_id,
        is_read: false,
        type: "rebook_nudge",
        title: `Time for your next ${service}? Book ${proName} again`,
      },
    ]);
    await sendPushToUser(booking.customer_id, {
      title: `Time for your next ${service}?`,
      body: `It's been three weeks. See ${proName}'s open times.`,
      url: link,
    }).catch(() => {});

    // Email only to clients who haven't opted out of LineUp emails.
    if (client?.email && !client.unsubscribed_from_marketing) {
      try {
        await sendEmail({
          to: client.email,
          subject: `Time for your next ${service}?`,
          html: createEmailLayout({
            title: `Time for your next ${escapeHtml(service)}?`,
            preview: `It's been three weeks since your visit with ${proName}.`,
            ctaLabel: `See ${proName.split(" ")[0]}'s open times`,
            ctaUrl: link,
            content: `
              <p style="margin:0 0 16px 0;">It's been about three weeks since your ${escapeHtml(service)} with <strong>${escapeHtml(proName)}</strong>.</p>
              <p style="margin:0 0 16px 0;">Book your next one now while there's still a time that suits you.</p>
              <p style="margin:0;color:#666666;font-size:13px;">Want the same time every few weeks without thinking about it? Open your last booking and make it a regular appointment.</p>
            `,
          }),
        });
      } catch (emailError) {
        console.error(`Rebook nudge email failed for ${booking.id}:`, emailError);
      }
    }
    nudged++;
  }

  return NextResponse.json({ ok: true, nudged });
}
