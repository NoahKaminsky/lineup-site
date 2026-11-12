import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import {
  STUDIO_COLUMNS,
  effectiveCutPercent,
  getStudioForUser,
  isStudioLive,
  syncMemberPlan,
  type StudioMemberRow,
  type StudioRow,
  errorMessage,
  uniqueStudioSlug,
  getStudioPlace,
  takesClients,
  STUDIO_MIN_PROS,
} from "@/app/lib/studios";
import { cleanTrades, parsePlace } from "@/app/lib/shopAccount";
import { PROFESSION_LABELS } from "@/app/lib/verificationRules";

// GET  /api/studio  — everything the /studio page shows for the signed-in user.
// POST /api/studio  — create a studio (the creator becomes its owner).

const SCHEDULE_DAYS = 14;

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();

    // Independent lookups run side by side: this route feeds every /studio
    // page, and one-after-another queries made those pages slow to open.
    const [{ data: myProfile }, ctx] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, email, full_name, professional_types")
        .eq("id", user.id)
        .maybeSingle(),
      getStudioForUser(supabase, user.id),
    ]);

    if (!ctx) {
      // Not on a team yet: show any invites waiting for their email.
      const email = (myProfile?.email || user.email || "").toLowerCase();
      const { data: invites } = email
        ? await supabase
            .from("studio_members")
            .select("id, studio_id, invite_expires_at, studios(name)")
            .eq("status", "invited")
            .eq("invited_email", email)
        : { data: [] };

      const now = Date.now();
      return NextResponse.json({
        studio: null,
        role: myProfile?.role || null,
        myTrades: myProfile?.professional_types || [],
        professions: PROFESSION_LABELS,
        invites: (invites || [])
          .filter((i) => !i.invite_expires_at || Date.parse(i.invite_expires_at) > now)
          .map((i) => ({
            id: i.id,
            studioName: (i.studios as unknown as { name: string } | null)?.name || "A studio",
          })),
      });
    }

    const { studio, member: me, canManage, isOwner } = ctx;

    // These don't depend on anything below, so start them now.
    const placePromise = getStudioPlace(supabase, studio.id);
    // Separate query: errors just mean the pay-at-shop migration hasn't run.
    const payAtShopPromise = supabase
      .from("studios")
      .select("pay_at_shop_enabled, no_show_fee_percent")
      .eq("id", studio.id)
      .maybeSingle();
    const payoutsPromise: Promise<{ connected: boolean; ready: boolean } | null> = isOwner
      ? (async () => {
          const result = { connected: !!studio.stripe_account_id, ready: false };
          if (studio.stripe_account_id) {
            try {
              const account = await stripe.accounts.retrieve(studio.stripe_account_id);
              result.ready = Boolean(account.payouts_enabled && account.details_submitted);
            } catch (error) {
              console.error("Studio payout account lookup failed:", error);
            }
          }
          return result;
        })()
      : Promise.resolve(null);

    // Members with their profiles in one round trip (falls back to two).
    type MemberProfile = { id: string; full_name: string | null; avatar_url: string | null; verification_status: string | null; professional_types: string[] | null };
    const PROFILE_COLS = "id, full_name, avatar_url, verification_status, professional_types";
    const joined = await supabase
      .from("studio_members")
      .select(`*, profile:profiles!studio_members_profile_id_fkey(${PROFILE_COLS})`)
      .eq("studio_id", studio.id)
      .order("created_at", { ascending: true });

    let members: StudioMemberRow[];
    let profiles: MemberProfile[];
    if (!joined.error) {
      const rows = (joined.data || []) as (StudioMemberRow & { profile: MemberProfile | null })[];
      members = rows.map(({ profile: _profile, ...m }) => m as StudioMemberRow);
      profiles = rows
        .filter((r) => r.status === "active" && r.profile)
        .map((r) => r.profile as MemberProfile);
    } else {
      const { data: memberRows } = await supabase
        .from("studio_members")
        .select("*")
        .eq("studio_id", studio.id)
        .order("created_at", { ascending: true });
      members = (memberRows as StudioMemberRow[]) || [];
      const ids = members.filter((m) => m.status === "active" && m.profile_id).map((m) => m.profile_id!);
      const { data } = ids.length ? await supabase.from("profiles").select(PROFILE_COLS).in("id", ids) : { data: [] };
      profiles = (data || []) as MemberProfile[];
    }
    const activeIds = members.filter((m) => m.status === "active" && m.profile_id).map((m) => m.profile_id!);
    // People with a column on the calendar: active and taking clients.
    const bookableIds = members
      .filter((m) => m.status === "active" && m.profile_id && takesClients(m))
      .map((m) => m.profile_id!);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const team = members
      // Everyone sees the team; only managers see pending invites.
      .filter((m) => m.status === "active" || canManage)
      .map((m) => {
        const p = m.profile_id ? profileMap.get(m.profile_id) : null;
        return {
          id: m.id,
          profileId: m.profile_id,
          name: p?.full_name || null,
          avatarUrl: p?.avatar_url || null,
          verificationStatus: p?.verification_status || null,
          role: m.role,
          status: m.status,
          takesClients: takesClients(m),
          trades: p?.professional_types || [],
          invitedEmail: canManage ? m.invited_email : null,
          inviteExpired:
            m.status === "invited" && !!m.invite_expires_at && Date.parse(m.invite_expires_at) < Date.now(),
          commissionOverride: canManage || m.id === me.id ? (m.commission_percent === null ? null : Number(m.commission_percent)) : null,
          effectiveCut: canManage || m.id === me.id ? effectiveCutPercent(studio, m) : null,
          ...(canManage || m.id === me.id
            ? {
                arrangement: m.arrangement,
                rentCents: m.rent_cents,
                rentInterval: m.rent_interval,
                rentStatus: m.rent_status,
                rentPaidUntil: m.rent_current_period_end,
              }
            : { arrangement: null, rentCents: null, rentInterval: null, rentStatus: null, rentPaidUntil: null }),
          joinedAt: m.joined_at,
        };
      });

    // This month's numbers for managers: runs alongside the schedule below.
    const earningsPromise: Promise<unknown> =
      canManage && activeIds.length
        ? (async () => {
          // This month's numbers, per member: online bookings plus front desk.
          const today = new Date();
          const monthStart = dateKey(new Date(today.getFullYear(), today.getMonth(), 1));
          const [{ data: monthBookings }, { data: monthFrontDesk }] = await Promise.all([
            supabase
              .from("bookings")
              .select("professional_id, status, service_price, studio_cut_cents, stripe_studio_transfer_id")
              .eq("studio_id", studio.id)
              .gte("booking_date", monthStart)
              .in("status", ["confirmed", "completion_requested", "completed"]),
            supabase
              .from("shop_appointments")
              .select("professional_id, price_cents, shop_cut_cents")
              .eq("studio_id", studio.id)
              .gte("appointment_date", monthStart)
              .eq("status", "completed"),
          ]);

          type MemberStats = { bookings: number; salesCents: number; shopCutCents: number; inShopSalesCents: number; inShopCutCents: number };
          const byMember: Record<string, MemberStats> = {};
          const blank = (): MemberStats => ({ bookings: 0, salesCents: 0, shopCutCents: 0, inShopSalesCents: 0, inShopCutCents: 0 });
          let paidCents = 0;
          let owedCents = 0;
          let inShopCutCents = 0;
          for (const b of monthBookings || []) {
            const row = (byMember[b.professional_id] ||= blank());
            row.bookings += 1;
            row.salesCents += Math.round(Number(b.service_price || 0) * 100);
            row.shopCutCents += Number(b.studio_cut_cents || 0);
            if (b.status === "completed" && Number(b.studio_cut_cents) > 0) {
              if (b.stripe_studio_transfer_id) paidCents += Number(b.studio_cut_cents);
              else owedCents += Number(b.studio_cut_cents);
            }
          }
          for (const a of monthFrontDesk || []) {
            const row = (byMember[a.professional_id] ||= blank());
            row.bookings += 1;
            row.inShopSalesCents += Number(a.price_cents || 0);
            row.inShopCutCents += Number(a.shop_cut_cents || 0);
            inShopCutCents += Number(a.shop_cut_cents || 0);
          }
          return { byMember, paidCents, owedCents, inShopCutCents };
          })()
        : Promise.resolve(null);

    let schedule: unknown[] = [];
    let services: Record<string, { id: string; name: string; durationMinutes: number; priceCents: number | null }[]> = {};
    let earnings: unknown = null;
    let payouts: { connected: boolean; ready: boolean } | null = null;

    // Owners and managers see the whole team's day; members see their own.
    const scheduleIds = canManage ? bookableIds : me.profile_id && takesClients(me) ? [me.profile_id] : [];

    if (scheduleIds.length) {
      const today = new Date();
      const from = dateKey(new Date(today.getTime() - 86_400_000)); // yesterday, for late check-offs
      const to = dateKey(new Date(today.getTime() + (SCHEDULE_DAYS - 1) * 86_400_000));

      const [{ data: bookings }, { data: frontDesk }, { data: serviceRows }] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, professional_id, customer_id, booking_date, start_time, end_time, status, service_name, source, payment_status, service_price")
          .in("professional_id", scheduleIds)
          .gte("booking_date", from)
          .lte("booking_date", to)
          .in("status", ["confirmed", "completion_requested", "completed"]),
        supabase
          .from("shop_appointments")
          .select("id, professional_id, kind, client_name, client_phone, service_name, appointment_date, start_time, end_time, price_cents, status, note")
          .eq("studio_id", studio.id)
          .in("professional_id", scheduleIds)
          .gte("appointment_date", from)
          .lte("appointment_date", to)
          .neq("status", "cancelled"),
        supabase
          .from("professional_services")
          .select("id, professional_id, service_name, duration_minutes, price")
          .in("professional_id", scheduleIds)
          .eq("is_active", true),
      ]);

      // Member bookings: separate, best-effort read (needs 20261107_member_bookings.sql).
      const memberPlanByBooking = new Map<string, string>();
      const payAtShopIds = (bookings || []).filter((b) => b.payment_status === "pay_at_shop").map((b) => b.id);
      if (payAtShopIds.length) {
        const { data: tagged } = await supabase
          .from("bookings")
          .select("id, membership_id")
          .in("id", payAtShopIds)
          .not("membership_id", "is", null);
        const membershipIds = [...new Set((tagged || []).map((t) => t.membership_id as string))];
        if (membershipIds.length) {
          const { data: ms } = await supabase.from("client_memberships").select("id, plan_id").in("id", membershipIds);
          const { data: plans } = await supabase
            .from("membership_plans")
            .select("id, name")
            .in("id", [...new Set((ms || []).map((m) => m.plan_id))]);
          const planName = new Map((plans || []).map((p) => [p.id, p.name as string]));
          const planOf = new Map((ms || []).map((m) => [m.id, planName.get(m.plan_id) || "their membership"]));
          for (const t of tagged || []) memberPlanByBooking.set(t.id, planOf.get(t.membership_id as string) || "their membership");
        }
      }

      const customerIds = [...new Set((bookings || []).map((b) => b.customer_id).filter(Boolean))];
      const { data: customers } = customerIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", customerIds)
        : { data: [] };
      const customerMap = new Map((customers || []).map((c) => [c.id, c.full_name]));

      schedule = [
        ...(bookings || []).map((b) => ({
          id: b.id,
          kind: "online" as const,
          professionalId: b.professional_id,
          date: b.booking_date,
          start: String(b.start_time).slice(0, 5),
          end: String(b.end_time).slice(0, 5),
          status: b.status,
          service: b.service_name,
          source: b.source,
          payAtShop: b.payment_status === "pay_at_shop",
          memberPlan: memberPlanByBooking.get(b.id) || null,
          clientName: customerMap.get(b.customer_id) || null,
          clientPhone: null,
          // Nothing to collect for a member's visit.
          priceCents:
            b.payment_status === "pay_at_shop" && b.service_price && !memberPlanByBooking.has(b.id)
              ? Math.round(Number(b.service_price) * 100)
              : null,
          note: null,
        })),
        ...(frontDesk || []).map((a) => ({
          id: a.id,
          kind: a.kind as "walk_in" | "phone" | "imported",
          professionalId: a.professional_id,
          date: a.appointment_date,
          start: String(a.start_time).slice(0, 5),
          end: String(a.end_time).slice(0, 5),
          status: a.status,
          service: a.service_name,
          source: "front_desk",
          payAtShop: true,
          clientName: a.client_name,
          clientPhone: a.client_phone,
          priceCents: a.price_cents,
          note: a.note,
        })),
      ].sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));

      for (const row of serviceRows || []) {
        const price = Number(String(row.price ?? "").replace(/[^0-9.]/g, ""));
        (services[row.professional_id] ||= []).push({
          id: row.id,
          name: row.service_name,
          durationMinutes: Number(row.duration_minutes) || 30,
          priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
        });
      }
    } else {
      services = {};
    }

    earnings = await earningsPromise;

    const [place, { data: payAtShop }, payoutsResult] = await Promise.all([placePromise, payAtShopPromise, payoutsPromise]);
    payouts = payoutsResult;

    return NextResponse.json({
      role: myProfile?.role || null,
      myTrades: myProfile?.professional_types || [],
      professions: PROFESSION_LABELS,
      me: { memberId: me.id, role: me.role, canManage, isOwner, takesClients: takesClients(me), profileId: me.profile_id },
      studio: {
        id: studio.id,
        name: studio.name,
        plan: studio.plan,
        subscriptionStatus: studio.subscription_status,
        live: isStudioLive(studio),
        coversTeam: isStudioLive(studio) && bookableIds.length >= STUDIO_MIN_PROS,
        proCount: bookableIds.length,
        address: place.address,
        areaLabel: place.area_label,
        trades: place.trades || [],
        minPros: STUDIO_MIN_PROS,
        periodEnd: studio.subscription_current_period_end,
        commissionPercent: Number(studio.commission_percent),
        hasBilling: !!studio.stripe_customer_id,
        slug: studio.slug,
        tagline: studio.tagline,
        payAtShop: !!payAtShop?.pay_at_shop_enabled,
        noShowFeePercent: payAtShop ? Number(payAtShop.no_show_fee_percent) : 50,
      },
      team,
      schedule,
      services,
      earnings,
      payouts,
    });
  } catch (error) {
    console.error("GET /api/studio failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load your studio.") }, { status: 500 });
  }
}

// POST /api/studio { name, place?, trades?, takesClients?, myTrades? }
// Sets up the whole shop in one go. Anyone signed in as a shop or a pro can
// open one; a shop-only owner who says they take clients becomes a pro in
// the trades they pick.
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Give your shop a name (2 to 80 characters)." }, { status: 400 });
    }
    const place = body?.place === undefined ? null : parsePlace(body.place);
    if (place === "invalid") return NextResponse.json({ error: "Pick the shop's address from the list." }, { status: 400 });
    const trades = cleanTrades(body?.trades);
    const myTrades = cleanTrades(body?.myTrades);

    const supabase = getServiceSupabase();

    const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
    if (!profile || (profile.role !== "professional" && profile.role !== "shop")) {
      return NextResponse.json(
        { error: "Studios are for shop and professional accounts. This one is set up for booking as a client." },
        { status: 403 }
      );
    }
    // Default: pros take clients, shop accounts don't.
    const ownerTakesClients = typeof body?.takesClients === "boolean" ? body.takesClients : profile.role === "professional";
    if (ownerTakesClients && profile.role !== "professional" && !myTrades.length) {
      return NextResponse.json({ error: "Pick what you do so clients can book you." }, { status: 400 });
    }

    if (await getStudioForUser(supabase, user.id)) {
      return NextResponse.json({ error: "You're already on a studio's team." }, { status: 409 });
    }

    const { data: studio, error: studioError } = await supabase
      .from("studios")
      .insert({ name, owner_id: user.id, slug: await uniqueStudioSlug(supabase, name) })
      .select(STUDIO_COLUMNS)
      .single<StudioRow>();

    if (studioError || !studio) {
      const message =
        studioError?.code === "23505" ? "You already own a studio." : studioError?.message || "Could not create studio.";
      return NextResponse.json({ error: message }, { status: studioError?.code === "23505" ? 409 : 500 });
    }

    // Shop-accounts columns: best effort, so an older database still works.
    const placeUpdate: Record<string, unknown> = { trades: trades.length ? trades : myTrades };
    if (place) Object.assign(placeUpdate, place);
    const { error: placeError } = await supabase.from("studios").update(placeUpdate).eq("id", studio.id);
    if (placeError) console.warn("Studio address not saved (run 20261104_shop_accounts.sql):", placeError.message);

    const memberRow = {
      studio_id: studio.id,
      profile_id: user.id,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    };
    let { error: memberError } = await supabase.from("studio_members").insert({ ...memberRow, takes_clients: ownerTakesClients });
    if (memberError && /takes_clients/.test(memberError.message)) {
      ({ error: memberError } = await supabase.from("studio_members").insert(memberRow));
    }

    if (memberError) {
      await supabase.from("studios").delete().eq("id", studio.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    if (ownerTakesClients && profile.role !== "professional") {
      await supabase
        .from("profiles")
        .update({ role: "professional", professional_type: myTrades[0], professional_types: myTrades })
        .eq("id", user.id);
    }

    await syncMemberPlan(supabase, user.id);

    return NextResponse.json({ ok: true, studioId: studio.id });
  } catch (error) {
    console.error("POST /api/studio failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not create studio.") }, { status: 500 });
  }
}
