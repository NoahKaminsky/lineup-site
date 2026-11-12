import { NextResponse } from "next/server";
import { getServiceSupabase, isCronAuthorized } from "@/app/lib/serverSupabase";
import { sendPushToUser } from "@/app/lib/push";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { shopNow } from "@/app/lib/bookingTime";
import {
  STANDING_RELEASE_DAYS,
  STANDING_REMIND_DAYS,
  addDays,
  daysBetween,
  everyLabel,
  type StandingRow,
} from "@/app/lib/standing";

// Daily (vercel.json). For each regular appointment:
//  - once its visit day has passed, move on to the next visit;
//  - a week before an unbooked visit, send the client a link to confirm and
//    pay (once per visit);
//  - two days before, an unbooked visit is released so others can book it,
//    and the regular moves on to the following visit.

function prettyDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function prettyTime(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceSupabase();
  const today = shopNow().dateKey;
  const site = getSiteUrl("https://www.lineup-aesthetics.ca");

  const { data, error } = await supabase.from("standing_appointments").select("*").eq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let reminded = 0;
  let released = 0;

  for (const series of (data || []) as StandingRow[]) {
    const step = series.interval_weeks * 7;
    let next = series.next_date;
    while (next < today) next = addDays(next, step);

    const { data: booked } = await supabase
      .from("bookings")
      .select("id")
      .eq("professional_id", series.professional_id)
      .eq("customer_id", series.customer_id)
      .eq("booking_date", next)
      .in("status", ["confirmed", "completion_requested", "completed"])
      .limit(1);
    const isBooked = !!booked?.length;
    const daysOut = daysBetween(today, next);
    const service = series.service_name || "appointment";
    const when = `${prettyDate(next)} at ${prettyTime(series.start_time)}`;

    // Unconfirmed too close to the day: let it go, move to the next visit.
    if (!isBooked && daysOut < STANDING_RELEASE_DAYS) {
      const releasedDate = next;
      next = addDays(next, step);
      released++;
      await supabase.from("notifications").insert([
        {
          user_id: series.customer_id,
          is_read: false,
          type: "standing_released",
          title: `Your ${service} on ${prettyDate(releasedDate)} wasn't confirmed, so that time was released. Your next one is ${prettyDate(next)}.`,
        },
        {
          user_id: series.professional_id,
          is_read: false,
          type: "standing_released",
          title: `A regular's ${service} on ${prettyDate(releasedDate)} wasn't confirmed, so that time is open again.`,
        },
      ]);
    } else if (!isBooked && daysOut <= STANDING_REMIND_DAYS && series.reminded_for !== next) {
      // A week out: one reminder, with the one-tap link.
      const link = `${site}/regular/${series.id}`;
      const [{ data: client }, { data: pro }] = await Promise.all([
        supabase.from("profiles").select("email, full_name").eq("id", series.customer_id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", series.professional_id).maybeSingle(),
      ]);
      const proName = pro?.full_name || "your pro";
      const confirmBy = prettyDate(addDays(next, -STANDING_RELEASE_DAYS));

      await supabase.from("notifications").insert([
        {
          user_id: series.customer_id,
          is_read: false,
          type: "standing_reminder",
          title: `Confirm your ${service} with ${proName} on ${when}`,
        },
      ]);
      await sendPushToUser(series.customer_id, {
        title: `Your regular ${service}`,
        body: `${when} with ${proName}. Tap to confirm.`,
        url: link,
      }).catch(() => {});
      if (client?.email) {
        try {
          await sendEmail({
            to: client.email,
            subject: `Confirm your ${service} with ${proName}`,
            html: createEmailLayout({
              title: `Your regular ${escapeHtml(service)}`,
              preview: `${when} with ${proName}. Confirm by ${confirmBy}.`,
              ctaLabel: "Confirm and pay",
              ctaUrl: link,
              content: `
                <p style="margin:0 0 16px 0;">Your next ${escapeHtml(service)} with <strong>${escapeHtml(proName)}</strong> is <strong>${escapeHtml(when)}</strong>. We're holding that time for you.</p>
                <p style="margin:0 0 16px 0;">Confirm and pay by <strong>${escapeHtml(confirmBy)}</strong>. If it isn't confirmed by then, the time is released.</p>
                <p style="margin:0;color:#666666;font-size:13px;">You booked this ${escapeHtml(everyLabel(series.interval_weeks))}. You can stop it any time from the same link.</p>
              `,
            }),
          });
        } catch (emailError) {
          console.error(`Regular reminder email failed for ${series.id}:`, emailError);
        }
      }
      await supabase.from("standing_appointments").update({ reminded_for: next }).eq("id", series.id);
      reminded++;
    }

    if (next !== series.next_date) {
      await supabase.from("standing_appointments").update({ next_date: next }).eq("id", series.id);
    }
  }

  return NextResponse.json({ ok: true, reminded, released });
}
