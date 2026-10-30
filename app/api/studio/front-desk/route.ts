import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { hasFrontDeskClash, hasOnlineBookingClash } from "@/app/lib/busyTimes";
import { effectiveCutPercent, errorMessage, getStudioForUser, isStudioLive, type StudioMemberRow } from "@/app/lib/studios";

// POST  /api/studio/front-desk — book a walk-in or phone-in for a pro.
// PATCH /api/studio/front-desk { id, status } — done, no-show, cancelled.
//
// The client pays at the shop, so nothing goes through Stripe: these just
// hold the time (online clients can't book over them) and keep the shop's
// records. Owners and managers book for anyone on the team; a pro can book
// their own walk-ins.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ["booked", "completed", "cancelled", "no_show"] as const;

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  if (total > 24 * 60 - 1) return null; // can't run past midnight
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function cleanText(value: unknown, max: number) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text.slice(0, max);
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });
    if (!isStudioLive(ctx.studio)) {
      return NextResponse.json({ error: "The front desk needs an active studio plan." }, { status: 402 });
    }

    const body = await req.json().catch(() => ({}));
    const professionalId = typeof body?.professionalId === "string" ? body.professionalId : "";
    if (!ctx.canManage && professionalId !== user.id) {
      return NextResponse.json({ error: "You can only book your own walk-ins." }, { status: 403 });
    }

    const { data: member } = await supabase
      .from("studio_members")
      .select("commission_percent, arrangement")
      .eq("studio_id", ctx.studio.id)
      .eq("profile_id", professionalId)
      .eq("status", "active")
      .maybeSingle<Pick<StudioMemberRow, "commission_percent" | "arrangement">>();
    if (!member) return NextResponse.json({ error: "That pro isn't on your team." }, { status: 404 });

    const clientName = cleanText(body?.clientName, 80);
    const serviceName = cleanText(body?.serviceName, 120);
    const clientPhone = cleanText(body?.clientPhone, 30) || null;
    const note = cleanText(body?.note, 500) || null;
    const kind = body?.kind === "phone" ? "phone" : "walk_in";
    const date = String(body?.date || "");
    const startTime = String(body?.startTime || "");
    const duration = Math.round(Number(body?.durationMinutes));

    if (!clientName) return NextResponse.json({ error: "Add the client's name." }, { status: 400 });
    if (!serviceName) return NextResponse.json({ error: "Pick or type a service." }, { status: 400 });
    if (!DATE.test(date) || !TIME.test(startTime)) {
      return NextResponse.json({ error: "Pick a date and start time." }, { status: 400 });
    }
    if (!Number.isFinite(duration) || duration < 5 || duration > 12 * 60) {
      return NextResponse.json({ error: "Length must be between 5 minutes and 12 hours." }, { status: 400 });
    }
    const endTime = addMinutes(startTime, duration);
    if (!endTime) return NextResponse.json({ error: "Appointments can't run past midnight." }, { status: 400 });

    let priceCents: number | null = null;
    if (body?.priceCents !== undefined && body?.priceCents !== null && body?.priceCents !== "") {
      priceCents = Math.round(Number(body.priceCents));
      if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 10_000_000) {
        return NextResponse.json({ error: "That price doesn't look right." }, { status: 400 });
      }
    }

    if (
      (await hasOnlineBookingClash(professionalId, date, startTime, endTime)) ||
      (await hasFrontDeskClash(professionalId, date, startTime, endTime))
    ) {
      return NextResponse.json({ error: "They already have someone booked at that time." }, { status: 409 });
    }

    // The shop's share, for its records only (paid at the shop, not by LineUp).
    const cutPercent = effectiveCutPercent(ctx.studio, member);
    const shopCutCents = priceCents ? Math.round(priceCents * (cutPercent / 100)) : 0;

    const { data: created, error } = await supabase
      .from("shop_appointments")
      .insert({
        studio_id: ctx.studio.id,
        professional_id: professionalId,
        created_by: user.id,
        kind,
        client_name: clientName,
        client_phone: clientPhone,
        service_name: serviceName,
        appointment_date: date,
        start_time: startTime,
        end_time: endTime,
        price_cents: priceCents,
        shop_cut_cents: shopCutCents,
        note,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23P01") {
        return NextResponse.json({ error: "They already have someone booked at that time." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    console.error("POST /api/studio/front-desk failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not book that in.") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const status = body?.status;
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });

    const { data: appointment } = await supabase
      .from("shop_appointments")
      .select("id, professional_id, appointment_date, start_time, end_time, status")
      .eq("id", typeof body?.id === "string" ? body.id : "")
      .eq("studio_id", ctx.studio.id)
      .maybeSingle();
    if (!appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    if (!ctx.canManage && appointment.professional_id !== user.id) {
      return NextResponse.json({ error: "You can only change your own appointments." }, { status: 403 });
    }

    // Bringing a cancelled one back means taking the time again.
    if (status === "booked" && appointment.status === "cancelled") {
      const start = String(appointment.start_time).slice(0, 5);
      const end = String(appointment.end_time).slice(0, 5);
      if (await hasOnlineBookingClash(appointment.professional_id, appointment.appointment_date, start, end)) {
        return NextResponse.json({ error: "That time has been booked since." }, { status: 409 });
      }
    }

    const { error } = await supabase.from("shop_appointments").update({ status }).eq("id", appointment.id);
    if (error) {
      const taken = error.code === "23P01";
      return NextResponse.json({ error: taken ? "That time has been booked since." : error.message }, { status: taken ? 409 : 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/studio/front-desk failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not update the appointment.") }, { status: 500 });
  }
}
