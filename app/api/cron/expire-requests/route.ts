import { NextResponse } from "next/server";
import { getServiceSupabase, isCronAuthorized } from "@/app/lib/serverSupabase";
import { appointmentInstant } from "@/app/lib/bookingTime";

// Requests with no date ("anytime") are cleared this long after posting if
// no offer was accepted.
const ANYTIME_MAX_AGE_DAYS = 14;

// Offer states that mean the client went ahead with a pro — a request with
// one of these is never deleted here.
const COMMITTED_OFFER_STATUSES = ["accepted", "payment_pending"];

// Deletes open requests whose time has passed without the client accepting
// an offer, along with their offers and notifications, so stale requests stop
// cluttering pros' and clients' dashboards. Runs once a day (see vercel.json).
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: openRequests, error } = await supabase
      .from("service_requests")
      .select("id, status, preferred_date, preferred_start_time, timing_flexibility, created_at")
      .eq("status", "open");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = Date.now();
    const anytimeCutoff = now - ANYTIME_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    const expired = (openRequests || []).filter((request) => {
      if (request.preferred_date) {
        // Request times are local (Winnipeg); the server runs in UTC. With no
        // start time, the request stays up until the end of that day.
        const startAt = request.preferred_start_time
          ? appointmentInstant(request.preferred_date, request.preferred_start_time)
          : appointmentInstant(request.preferred_date, "23:59:59");
        return startAt.getTime() <= now;
      }
      return !!request.created_at && new Date(request.created_at).getTime() <= anytimeCutoff;
    });

    if (expired.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const expiredIds = expired.map((request) => request.id);

    // Skip anything the client actually committed to, or that already has a
    // booking hanging off it.
    const [{ data: committedOffers }, { data: linkedBookings }] = await Promise.all([
      supabase
        .from("request_offers")
        .select("request_id")
        .in("request_id", expiredIds)
        .in("status", COMMITTED_OFFER_STATUSES),
      supabase.from("bookings").select("request_id").in("request_id", expiredIds),
    ]);

    const keep = new Set<string>([
      ...(committedOffers || []).map((row) => row.request_id),
      ...(linkedBookings || []).map((row) => row.request_id),
    ]);

    const toDelete = expiredIds.filter((id) => !keep.has(id));

    let deleted = 0;
    let failed = 0;

    for (const requestId of toDelete) {
      // Children first so foreign keys without ON DELETE CASCADE don't block
      // the request itself.
      const { error: offersError } = await supabase
        .from("request_offers")
        .delete()
        .eq("request_id", requestId);
      const { error: notificationsError } = await supabase
        .from("notifications")
        .delete()
        .eq("request_id", requestId);
      const { error: requestError } = await supabase
        .from("service_requests")
        .delete()
        .eq("id", requestId)
        .eq("status", "open");

      if (offersError || notificationsError || requestError) {
        failed += 1;
        console.error(
          `Failed to delete expired request ${requestId}:`,
          offersError || notificationsError || requestError
        );
        continue;
      }

      deleted += 1;
    }

    return NextResponse.json({ ok: true, deleted, failed, skipped: keep.size });
  } catch (error: any) {
    console.error("expire-requests failed:", error);
    return NextResponse.json({ error: error?.message || "Expire requests failed" }, { status: 500 });
  }
}
