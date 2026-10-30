import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { MEMBERSHIP_FEE_PERCENT } from "@/app/lib/commission";
import { errorMessage, isStudioLive } from "@/app/lib/studios";
import {
  CLIENT_MEMBERSHIP_COLUMNS,
  MEMBERSHIP_PLAN_COLUMNS,
  USABLE_STATUSES,
  visitsThisPeriod,
  type ClientMembershipRow,
  type MembershipPlanRow,
} from "@/app/lib/memberships";
import { getSiteUrl } from "@/app/lib/siteUrl";

// Client side of memberships.
// GET  /api/memberships?slug=<shop> — the shop's plans, and the signed-in
//      client's own memberships there.
// POST /api/memberships { action: "join", planId } — Stripe Checkout.
// POST /api/memberships { action: "manage", slug? } — card / cancel (Stripe portal).

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function shopBySlug(supabase: ReturnType<typeof getServiceSupabase>, slug: string) {
  if (!SLUG.test(slug)) return null;
  const { data } = await supabase
    .from("studios")
    .select("id, name, slug, plan, subscription_status, stripe_account_id")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug") || "";
    const supabase = getServiceSupabase();
    const studio = await shopBySlug(supabase, slug);
    if (!studio) return NextResponse.json({ plans: [], mine: [] });

    const { data: plans } = await supabase
      .from("membership_plans")
      .select(MEMBERSHIP_PLAN_COLUMNS)
      .eq("studio_id", studio.id)
      .eq("active", true)
      .order("price_cents", { ascending: true });

    const canJoin = isStudioLive(studio) && !!studio.stripe_account_id;

    let mine: unknown[] = [];
    const user = await getAuthenticatedUser(req).catch(() => null);
    if (user) {
      const { data: rows } = await supabase
        .from("client_memberships")
        .select(CLIENT_MEMBERSHIP_COLUMNS)
        .eq("studio_id", studio.id)
        .eq("customer_id", user.id)
        .in("status", USABLE_STATUSES);
      const memberships = (rows as ClientMembershipRow[]) || [];
      const { counts } = await visitsThisPeriod(supabase, memberships);
      const planMap = new Map(((plans as MembershipPlanRow[]) || []).map((p) => [p.id, p]));
      mine = memberships.map((m) => ({
        id: m.id,
        planId: m.plan_id,
        planName: planMap.get(m.plan_id)?.name || "Membership",
        status: m.status,
        cancelAtPeriodEnd: m.cancel_at_period_end,
        renewsOn: m.current_period_end,
        visitsUsed: counts.get(m.id) || 0,
        visitsIncluded: planMap.get(m.plan_id)?.visits_per_period ?? null,
      }));
    }

    return NextResponse.json({
      canJoin,
      plans: ((plans as MembershipPlanRow[]) || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.price_cents,
        visitsPerPeriod: p.visits_per_period,
      })),
      mine,
    });
  } catch (error) {
    console.error("GET /api/memberships failed:", error);
    return NextResponse.json({ plans: [], mine: [] });
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in to join." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const supabase = getServiceSupabase();
    const siteUrl = getSiteUrl();

    const { data: me } = await supabase
      .from("profiles")
      .select("id, email, full_name, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (body?.action === "manage") {
      if (!me?.stripe_customer_id) return NextResponse.json({ error: "No membership to manage yet." }, { status: 400 });
      const slug = typeof body?.slug === "string" && SLUG.test(body.slug) ? body.slug : null;
      const portal = await stripe.billingPortal.sessions.create({
        customer: me.stripe_customer_id,
        return_url: slug ? `${siteUrl}/shop/${slug}` : `${siteUrl}/account`,
      });
      return NextResponse.json({ url: portal.url });
    }

    if (body?.action !== "join") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

    const { data: plan } = await supabase
      .from("membership_plans")
      .select(MEMBERSHIP_PLAN_COLUMNS)
      .eq("id", typeof body?.planId === "string" ? body.planId : "")
      .eq("active", true)
      .maybeSingle<MembershipPlanRow>();
    if (!plan) return NextResponse.json({ error: "That membership isn't available." }, { status: 404 });

    const { data: studio } = await supabase
      .from("studios")
      .select("id, name, slug, plan, subscription_status, stripe_account_id")
      .eq("id", plan.studio_id)
      .maybeSingle();
    if (!studio || !isStudioLive(studio) || !studio.stripe_account_id) {
      return NextResponse.json({ error: "This shop isn't taking memberships right now." }, { status: 409 });
    }

    const { data: existing } = await supabase
      .from("client_memberships")
      .select("id")
      .eq("plan_id", plan.id)
      .eq("customer_id", user.id)
      .in("status", USABLE_STATUSES)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "You already have this membership." }, { status: 409 });

    let customerId = me?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: me?.email || user.email || undefined,
        name: me?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    // No studio_id key in metadata: the webhook reads that as the studio's
    // own plan. Memberships are told apart by membership_plan_id.
    const metadata = { membership_plan_id: plan.id, membership_customer_id: user.id };
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: plan.price_cents,
            recurring: { interval: "month" },
            product_data: { name: `${plan.name} at ${studio.name}` },
          },
        },
      ],
      success_url: `${siteUrl}/shop/${studio.slug}?joined=1`,
      cancel_url: `${siteUrl}/shop/${studio.slug}`,
      metadata,
      subscription_data: {
        metadata,
        transfer_data: { destination: studio.stripe_account_id },
        application_fee_percent: MEMBERSHIP_FEE_PERCENT,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("POST /api/memberships failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not start checkout.") }, { status: 500 });
  }
}
