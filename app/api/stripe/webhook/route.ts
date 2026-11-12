import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { studioPlanFromPriceId } from "@/app/lib/plans";
import { syncMemberPlan, syncStudioMemberPlans } from "@/app/lib/studios";
import { createPayAtShopBooking } from "@/app/lib/payAtShop";
import { recordBoost } from "@/app/lib/boostsServer";
import { activateGiftCard } from "@/app/lib/giftCardsServer";
import { onPaidPlanStarted } from "@/app/lib/referrals";
import { markMembershipPastDue, syncMembershipSubscription } from "@/app/lib/memberships";
import { handlePaymentIntentSucceeded } from "@/app/lib/paymentBookings";


export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET env var" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: any) {
    console.error("Stripe webhook signature failed:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      await handlePaymentIntentSucceeded(paymentIntent.id);
    }

    if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      const paymentIntent = event.data.object;
      const supabase = getServiceSupabase();

      if (paymentIntent.metadata?.offer_id) {
        await supabase
          .from("request_offers")
          .update({ status: "pending" })
          .eq("id", paymentIntent.metadata.offer_id)
          .eq("status", "payment_pending");
      }
    }

    // A client saved a card to book now and pay at the shop (backstop for
    // when the page closed before it could make the booking itself).
    if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object;
      if (setupIntent.metadata?.flow_type === "pay_at_shop_booking") {
        const result = await createPayAtShopBooking(setupIntent.id);
        if (!result.ok) console.error("Pay-at-shop booking from webhook not created:", result.error);
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "payment" && session.metadata?.boost_kind) {
        await recordBoost(session as unknown as Parameters<typeof recordBoost>[0]);
      }
      if (session.mode === "payment" && session.metadata?.gift_card_id) {
        await activateGiftCard(session as unknown as Parameters<typeof activateGiftCard>[0]);
      }
      if (session.mode === "subscription" && session.metadata?.membership_plan_id) {
        await syncMembershipSubscription(
          (await stripe.subscriptions.retrieve(session.subscription as string)) as unknown as StudioSubscription
        );
      } else if (session.mode === "subscription" && session.metadata?.studio_rent_member_id) {
        await handleRentSubscriptionChanged(
          (await stripe.subscriptions.retrieve(session.subscription as string)) as unknown as StudioSubscription,
          { fromCheckout: true }
        );
      } else if (session.mode === "subscription" && session.metadata?.studio_id) {
        await handleStudioSubscriptionChanged(
          (await stripe.subscriptions.retrieve(session.subscription as string)) as unknown as StudioSubscription,
          { customerId: session.customer as string }
        );
      } else if (session.mode === "subscription" && session.metadata?.supabase_user_id) {
        await handleSubscriptionCheckoutCompleted(session);
      }
    }

    if (event.type === "customer.subscription.updated") {
      if (event.data.object.metadata?.membership_plan_id) {
        await syncMembershipSubscription(event.data.object as unknown as StudioSubscription);
      } else if (event.data.object.metadata?.studio_rent_member_id) {
        await handleRentSubscriptionChanged(event.data.object as unknown as StudioSubscription);
      } else if (event.data.object.metadata?.studio_id) {
        await handleStudioSubscriptionChanged(event.data.object as unknown as StudioSubscription);
      } else {
        await handleSubscriptionUpdated(event.data.object);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      if (event.data.object.metadata?.membership_plan_id) {
        await syncMembershipSubscription(event.data.object as unknown as StudioSubscription, { deleted: true });
      } else if (event.data.object.metadata?.studio_rent_member_id) {
        await handleRentSubscriptionChanged(event.data.object as unknown as StudioSubscription, { deleted: true });
      } else if (event.data.object.metadata?.studio_id) {
        await handleStudioSubscriptionChanged(event.data.object as unknown as StudioSubscription, { deleted: true });
      } else {
        await handleSubscriptionDeleted(event.data.object);
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as any;
      // Newer Stripe API versions moved this under invoice.parent.
      const invoiceSubscription = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
      if (invoiceSubscription) {
        await handleInvoicePaymentFailed(
          typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription.id
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook handling failed:", error);

    return NextResponse.json(
      { error: error?.message || "Webhook handling failed" },
      { status: 500 }
    );
  }
}

function getPlanFromPriceId(priceId: string): string | null {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_APPRENTICE_PRICE_ID) return "apprentice";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_MASTER_PRICE_ID) return "master";
  // Unrecognised price: no plan. ("unknown" used to be stored here, and the
  // booking-cap check read any non-empty plan as unlimited.)
  return null;
}

async function handleSubscriptionCheckoutCompleted(session: any) {
  const supabase = getServiceSupabase();
  const userId = session.metadata.supabase_user_id;

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string) as any;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);

  await supabase
    .from("profiles")
    .update({
      stripe_customer_id: session.customer,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      subscription_plan: plan,
      subscription_current_period_end: periodEndIso(subscription),
      // Instant-booking calendar is available on any paid tier (not just
      // Master) — turn it on automatically instead of leaving it as a buried
      // settings toggle nobody knows to flip. Direct bookings are never
      // counted against the monthly request cap, regardless of tier.
      ...(plan && plan !== "unknown"
        ? { direct_booking_enabled: true, public_availability_enabled: true }
        : {}),
    })
    .eq("id", userId);

  // Their own paid plan from here on, not one granted by a studio. (Separate
  // write so it's harmless on a database without the studio migration.)
  await supabase.from("profiles").update({ plan_source: null }).eq("id", userId).eq("plan_source", "studio");

  // Referrals: reward whoever invited this pro, and apply any free months
  // this pro earned by inviting others.
  if (plan && plan !== "unknown") await onPaidPlanStarted(userId);
}

async function handleSubscriptionUpdated(subscription: any) {
  const supabase = getServiceSupabase();
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) return;

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  const isSubscribed =
    (subscription.status === "active" || subscription.status === "trialing") &&
    plan &&
    plan !== "unknown";

  await supabase
    .from("profiles")
    .update({
      subscription_status: subscription.status,
      subscription_plan: plan,
      subscription_current_period_end: periodEndIso(subscription),
      ...(isSubscribed
        ? { direct_booking_enabled: true, public_availability_enabled: true }
        : { direct_booking_enabled: false, public_availability_enabled: false }),
    })
    .eq("id", userId);

  // A studio member whose own plan just lapsed falls back to the studio's.
  await syncMemberPlan(supabase, userId);
}

async function handleSubscriptionDeleted(subscription: any) {
  const supabase = getServiceSupabase();
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) return;

  await supabase
    .from("profiles")
    .update({
      stripe_subscription_id: null,
      subscription_status: "canceled",
      subscription_plan: null,
      subscription_current_period_end: null,
      direct_booking_enabled: false,
      public_availability_enabled: false,
    })
    .eq("id", userId);

  await syncMemberPlan(supabase, userId);
}

async function handleInvoicePaymentFailed(subscriptionId: string) {
  const supabase = getServiceSupabase();

  // A studio's payment failed: the shop is past due, and so is every
  // member's studio-granted plan.
  const { data: studio } = await supabase
    .from("studios")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (studio) {
    await supabase.from("studios").update({ subscription_status: "past_due" }).eq("id", studio.id);
    await syncStudioMemberPlans(supabase, studio.id);
    return;
  }

  // A client's membership payment failed.
  if (await markMembershipPastDue(subscriptionId)) return;

  // A pro's booth rent payment failed.
  const { data: renter } = await supabase
    .from("studio_members")
    .select("id")
    .eq("rent_subscription_id", subscriptionId)
    .maybeSingle();

  if (renter) {
    await supabase.from("studio_members").update({ rent_status: "past_due" }).eq("id", renter.id);
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!profile) return;

  await supabase
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("id", profile.id);
}

// A studio's subscription was bought, changed, renewed or cancelled. The
// studio row records it, then every member's studio-granted plan follows.
type StudioSubscription = {
  id: string;
  status: string;
  metadata?: Record<string, string> | null;
  // Older Stripe API versions put the period end on the subscription, newer
  // ones on each item; read either.
  current_period_end?: number;
  items?: { data?: { price?: { id?: string }; current_period_end?: number }[] };
};

async function handleStudioSubscriptionChanged(
  subscription: StudioSubscription,
  options: { deleted?: boolean; customerId?: string } = {}
) {
  const supabase = getServiceSupabase();
  const studioId = subscription.metadata?.studio_id;
  if (!studioId) return;

  // Ignore late events from a subscription the shop has already replaced
  // (e.g. the old one's "deleted" arriving after they re-subscribed).
  if (!options.customerId) {
    const { data: current } = await supabase
      .from("studios")
      .select("stripe_subscription_id")
      .eq("id", studioId)
      .maybeSingle();
    if (current?.stripe_subscription_id && current.stripe_subscription_id !== subscription.id) return;
  }

  const plan = options.deleted ? null : studioPlanFromPriceId(subscription.items?.data?.[0]?.price?.id);
  const periodEnd = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;

  await supabase
    .from("studios")
    .update({
      plan,
      subscription_status: options.deleted ? "canceled" : subscription.status,
      stripe_subscription_id: options.deleted ? null : subscription.id,
      subscription_current_period_end:
        !options.deleted && periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      ...(options.customerId ? { stripe_customer_id: options.customerId } : {}),
    })
    .eq("id", studioId);

  await syncStudioMemberPlans(supabase, studioId);
}

// A pro's booth rent was set up, renewed, changed or ended.
async function handleRentSubscriptionChanged(
  subscription: StudioSubscription,
  options: { deleted?: boolean; fromCheckout?: boolean } = {}
) {
  const supabase = getServiceSupabase();
  const memberId = subscription.metadata?.studio_rent_member_id;
  if (!memberId) return;

  const { data: member } = await supabase
    .from("studio_members")
    .select("id, rent_subscription_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return;

  // Ignore events from a rent subscription that's since been replaced.
  if (!options.fromCheckout && member.rent_subscription_id && member.rent_subscription_id !== subscription.id) return;

  const periodEnd = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;

  await supabase
    .from("studio_members")
    .update(
      options.deleted
        ? { rent_subscription_id: null, rent_status: "canceled", rent_current_period_end: null }
        : {
            rent_subscription_id: subscription.id,
            rent_status: subscription.status,
            rent_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          }
    )
    .eq("id", member.id);
}

// When a subscription's current period ends, as an ISO string. Newer Stripe
// API versions (the SDK's default since 2025) put it on each item instead of
// the subscription; reading only the old field threw "Invalid time value".
function periodEndIso(subscription: { current_period_end?: number; items?: { data?: { current_period_end?: number }[] } }) {
  const end = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}
