import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { RENT_PROCESSING_FEE_PERCENT } from "@/app/lib/commission";
import {
  MEMBER_COLUMNS,
  cancelRent,
  errorMessage,
  getStudioForUser,
  isLiveStatus,
  isStudioLive,
  type StudioMemberRow,
} from "@/app/lib/studios";

// PATCH /api/studio/rent { memberId, arrangement, rentCents?, rentInterval? }
//   Owner only (Studio Plus): put a pro on commission or booth rent.
// POST  /api/studio/rent { action: "setup" | "manage" }
//   The pro themselves: pay rent by card (Stripe Checkout), or manage it.
//
// Rent is a Stripe subscription on the pro's card. Each payment goes straight
// to the shop's payout account (transfer_data), minus card processing.

const MIN_RENT_CENTS = 500;
const MAX_RENT_CENTS = 1_000_000;

export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.isOwner) return NextResponse.json({ error: "Only the studio owner can change this." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { data: member } = await supabase
      .from("studio_members")
      .select(MEMBER_COLUMNS)
      .eq("id", typeof body?.memberId === "string" ? body.memberId : "")
      .eq("studio_id", ctx.studio.id)
      .eq("status", "active")
      .maybeSingle<StudioMemberRow>();
    if (!member) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

    if (body?.arrangement === "commission") {
      // Their rent stops at the end of what they've already paid for.
      await cancelRent(supabase, member, { immediately: false });
      const { error } = await supabase.from("studio_members").update({ arrangement: "commission" }).eq("id", member.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body?.arrangement !== "booth_rent") return NextResponse.json({ error: "Unknown arrangement." }, { status: 400 });

    if (!isStudioLive(ctx.studio) || ctx.studio.plan !== "studio_plus") {
      return NextResponse.json({ error: "Booth rent is part of Studio Plus." }, { status: 402 });
    }

    const rentCents = Math.round(Number(body?.rentCents));
    const rentInterval = body?.rentInterval === "week" ? "week" : body?.rentInterval === "month" ? "month" : null;
    if (!Number.isFinite(rentCents) || rentCents < MIN_RENT_CENTS || rentCents > MAX_RENT_CENTS || !rentInterval) {
      return NextResponse.json({ error: "Set a rent between $5 and $10,000, weekly or monthly." }, { status: 400 });
    }

    // Already paying: change the amount from their next payment on. Switching
    // between weekly and monthly ends the current rent at its period end; the
    // pro then sets up the new schedule.
    if (member.rent_subscription_id && isLiveStatus(member.rent_status)) {
      if (rentInterval !== member.rent_interval) {
        await cancelRent(supabase, member, { immediately: false });
      } else if (rentCents !== member.rent_cents) {
        const subscription = await stripe.subscriptions.retrieve(member.rent_subscription_id);
        const item = subscription.items.data[0];
        const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
        await stripe.subscriptions.update(member.rent_subscription_id, {
          items: [
            {
              id: item.id,
              price_data: { currency: "cad", product, unit_amount: rentCents, recurring: { interval: rentInterval } },
            },
          ],
          proration_behavior: "none",
        });
      }
    }

    const { error } = await supabase
      .from("studio_members")
      .update({ arrangement: "booth_rent", rent_cents: rentCents, rent_interval: rentInterval })
      .eq("id", member.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/studio/rent failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save rent.") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    const { studio } = ctx;
    const { data: member } = await supabase
      .from("studio_members")
      .select(MEMBER_COLUMNS)
      .eq("id", ctx.member.id)
      .maybeSingle<StudioMemberRow>();
    if (!member) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const body = await req.json().catch(() => ({}));

    if (body?.action === "manage") {
      if (!profile?.stripe_customer_id) return NextResponse.json({ error: "No rent payments set up yet." }, { status: 400 });
      const portal = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${siteUrl}/studio`,
      });
      return NextResponse.json({ url: portal.url });
    }

    if (body?.action !== "setup") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

    if (member.arrangement !== "booth_rent" || !member.rent_cents || !member.rent_interval) {
      return NextResponse.json({ error: "Your studio hasn't set up booth rent for you." }, { status: 400 });
    }
    if (member.rent_subscription_id && isLiveStatus(member.rent_status)) {
      return NextResponse.json({ error: "Your rent is already set up." }, { status: 409 });
    }
    if (!studio.stripe_account_id) {
      return NextResponse.json({ error: "The studio hasn't set up its payout account yet. Ask the owner." }, { status: 409 });
    }
    const shopAccount = await stripe.accounts.retrieve(studio.stripe_account_id);
    if (!shopAccount.charges_enabled && !shopAccount.payouts_enabled) {
      return NextResponse.json({ error: "The studio's payout account isn't finished yet. Ask the owner." }, { status: 409 });
    }

    // The pro's Stripe customer (shared with their own LineUp plan, if any).
    let customerId = profile?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email || undefined,
        name: profile?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    // Note: no studio_id in this metadata. The webhook reads studio_id as
    // "the studio's own plan"; rent is told apart by studio_rent_member_id.
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: member.rent_cents,
            recurring: { interval: member.rent_interval },
            product_data: { name: `Chair rent at ${studio.name}` },
          },
        },
      ],
      success_url: `${siteUrl}/studio?rent=1`,
      cancel_url: `${siteUrl}/studio`,
      metadata: { studio_rent_member_id: member.id },
      subscription_data: {
        metadata: { studio_rent_member_id: member.id },
        transfer_data: { destination: studio.stripe_account_id },
        application_fee_percent: RENT_PROCESSING_FEE_PERCENT,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("POST /api/studio/rent failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not set up rent.") }, { status: 500 });
  }
}
