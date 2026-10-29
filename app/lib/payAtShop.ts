// "Book online, pay at the shop" for studio teams, with no-show protection.
//
// Instead of paying when they book, the client saves a card (a Stripe
// SetupIntent). The booking is created once the card is saved. Nothing is
// charged unless the pro marks them a no-show after the start time; then the
// shop's no-show fee is charged to that card and sent to the pro, minus
// LineUp's share. See supabase/migrations/20261101_pay_at_shop.sql.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "./stripe";
import { getServiceSupabase } from "./serverSupabase";
import { NO_SHOW_LINEUP_PERCENT } from "./commission";
import { appointmentInstant } from "./bookingTime";
import { hasFrontDeskClash, hasOnlineBookingClash } from "./busyTimes";
import { getMembershipForProfile, getStudioForUser, studioCoversTeam } from "./studios";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

// How long after the start time a pro can mark a no-show.
export const NO_SHOW_GRACE_MINUTES = 15;

export type PayAtShopTerms =
  | { available: false }
  | { available: true; studioId: string; studioName: string; noShowFeePercent: number };

// Can clients of this pro book now and pay at the shop?
export async function getPayAtShopTerms(supabase: ServiceClient, professionalId: string): Promise<PayAtShopTerms> {
  const membership = await getMembershipForProfile(supabase, professionalId);
  if (!membership) return { available: false };

  const { data: settings, error } = await supabase
    .from("studios")
    .select("pay_at_shop_enabled, no_show_fee_percent")
    .eq("id", membership.studio.id)
    .maybeSingle();
  // An error means the pay-at-shop migration hasn't run.
  if (error || !settings?.pay_at_shop_enabled) return { available: false };
  if (!(await studioCoversTeam(supabase, membership.studio))) return { available: false };

  return {
    available: true,
    studioId: membership.studio.id,
    studioName: membership.studio.name,
    noShowFeePercent: Number(settings.no_show_fee_percent) || 0,
  };
}

export function noShowFeeCents(priceCents: number, percent: number) {
  return Math.max(Math.round(priceCents * (percent / 100)), 0);
}

// Step 1, after the usual direct-booking checks have passed: set up saving
// the client's card. The booking itself is made in createPayAtShopBooking.
export async function startPayAtShopBooking(params: {
  supabase: ServiceClient;
  user: { id: string; email: string | null };
  professionalId: string;
  serviceId: string;
  amountCents: number;
  date: string;
  startTime: string;
  endTime: string;
  mode: string;
}) {
  const { supabase, user } = params;
  const terms = await getPayAtShopTerms(supabase, params.professionalId);
  if (!terms.available) {
    return NextResponse.json({ error: "This professional takes payment when you book." }, { status: 409 });
  }

  const { data: client } = await supabase
    .from("profiles")
    .select("full_name, email, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = client?.stripe_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: client?.email || user.email || undefined,
      name: client?.full_name || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const feeCents = noShowFeeCents(params.amountCents, terms.noShowFeePercent);

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    // Cards only (no redirect-based methods), since a no-show fee is charged
    // later without the client there.
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: {
      flow_type: "pay_at_shop_booking",
      professional_id: params.professionalId,
      customer_id: user.id,
      service_id: params.serviceId,
      booking_date: params.date,
      start_time: params.startTime,
      end_time: params.endTime,
      service_mode: params.mode,
      price_cents: String(params.amountCents),
      no_show_fee_cents: String(feeCents),
      studio_id: terms.studioId,
    },
  });

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
    mode: "setup",
    amountCents: params.amountCents,
    noShowFeeCents: feeCents,
  });
}

export type CreatePayAtShopResult =
  | { ok: true; bookingId: string }
  | { ok: false; status: number; error: string };

// Step 2: the card is saved, so make the booking. Called by the client right
// after saving the card, and by the webhook (setup_intent.succeeded) as a
// backstop if the client closed the page. Safe to call twice.
export async function createPayAtShopBooking(
  setupIntentId: string,
  expectedCustomerId?: string
): Promise<CreatePayAtShopResult> {
  const supabase = getServiceSupabase();

  const { data: existing } = await supabase
    .from("bookings")
    .select("id")
    .eq("stripe_setup_intent_id", setupIntentId)
    .maybeSingle();
  if (existing?.id) return { ok: true, bookingId: existing.id };

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const m = setupIntent.metadata || {};

  if (m.flow_type !== "pay_at_shop_booking") return { ok: false, status: 400, error: "Not a booking." };
  if (expectedCustomerId && m.customer_id !== expectedCustomerId) {
    return { ok: false, status: 403, error: "Not your booking." };
  }
  if (setupIntent.status !== "succeeded") {
    return { ok: false, status: 409, error: "Your card wasn't saved. Please try again." };
  }

  if (
    (await hasOnlineBookingClash(m.professional_id, m.booking_date, m.start_time, m.end_time)) ||
    (await hasFrontDeskClash(m.professional_id, m.booking_date, m.start_time, m.end_time))
  ) {
    // Nothing was charged, so there's nothing to refund.
    return { ok: false, status: 409, error: "Someone just booked that time. Please pick another." };
  }

  const [{ data: pro }, { data: service }] = await Promise.all([
    supabase
      .from("profiles")
      .select("formatted_address, location_place_id, location_lat, location_lng")
      .eq("id", m.professional_id)
      .maybeSingle(),
    supabase.from("professional_services").select("service_name").eq("id", m.service_id).maybeSingle(),
  ]);

  const priceCents = Number(m.price_cents) || 0;
  const paymentMethodId =
    typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id || null;

  const { data: created, error } = await supabase
    .from("bookings")
    .insert({
      professional_id: m.professional_id,
      customer_id: m.customer_id,
      booking_date: m.booking_date,
      start_time: m.start_time,
      end_time: m.end_time,
      status: "confirmed",
      service_id: m.service_id || null,
      service_name: service?.service_name || "Booked service",
      service_mode: m.service_mode || null,
      source: "direct_booking",
      formatted_address: pro?.formatted_address || null,
      location_place_id: pro?.location_place_id || null,
      location_lat: pro?.location_lat ?? null,
      location_lng: pro?.location_lng ?? null,
      service_price: priceCents / 100,
      // Paid at the shop: LineUp moves no money unless there's a no-show.
      payment_status: "pay_at_shop",
      total_amount_cents: 0,
      deposit_amount_cents: 0,
      platform_fee_cents: 0,
      professional_payout_cents: 0,
      remaining_payout_cents: 0,
      payout_status: "not_ready",
      studio_id: m.studio_id || null,
      stripe_setup_intent_id: setupIntent.id,
      stripe_customer_id: typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id || null,
      stripe_payment_method_id: paymentMethodId,
      no_show_fee_cents: Number(m.no_show_fee_cents) || 0,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Created a moment ago by the other caller (client vs webhook).
      const { data: again } = await supabase
        .from("bookings")
        .select("id")
        .eq("stripe_setup_intent_id", setupIntent.id)
        .maybeSingle();
      if (again?.id) return { ok: true, bookingId: again.id };
    }
    if (error.code === "23P01") {
      return { ok: false, status: 409, error: "Someone just booked that time. Please pick another." };
    }
    console.error("Pay-at-shop booking insert failed:", error);
    return { ok: false, status: 500, error: "Could not make the booking." };
  }

  await notifyBookingConfirmed(created.id);
  return { ok: true, bookingId: created.id };
}

async function notifyBookingConfirmed(bookingId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    await fetch(`${siteUrl}/api/notifications/booking-confirmed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
      body: JSON.stringify({ bookingId }),
    });
  } catch (error) {
    console.error("Booking confirmation email failed:", error);
  }
}

export type NoShowResult =
  | { ok: true; charged: boolean; feeCents: number; message: string }
  | { ok: false; status: number; error: string };

// The pro (or a studio manager) marks a pay-at-shop client as a no-show:
// charge the no-show fee to the saved card and close the booking.
export async function markNoShow(bookingId: string, actorId: string): Promise<NoShowResult> {
  const supabase = getServiceSupabase();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, professional_id, customer_id, studio_id, service_name, booking_date, start_time, status, payment_status, stripe_customer_id, stripe_payment_method_id, no_show_fee_cents, no_show_status"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, status: 404, error: "Booking not found." };

  let allowed = booking.professional_id === actorId;
  if (!allowed && booking.studio_id) {
    const ctx = await getStudioForUser(supabase, actorId);
    allowed = !!ctx?.canManage && ctx.studio.id === booking.studio_id;
  }
  if (!allowed) return { ok: false, status: 403, error: "Only the pro or the studio can do this." };

  if (booking.payment_status !== "pay_at_shop") {
    return { ok: false, status: 400, error: "This booking was paid online, so there's no no-show fee to charge." };
  }
  if (booking.no_show_status) return { ok: false, status: 409, error: "Already marked as a no-show." };
  if (booking.status !== "confirmed") return { ok: false, status: 409, error: "This booking isn't open anymore." };

  const graceEnds = appointmentInstant(booking.booking_date, booking.start_time).getTime() + NO_SHOW_GRACE_MINUTES * 60_000;
  if (Date.now() < graceEnds) {
    return { ok: false, status: 409, error: `You can mark a no-show ${NO_SHOW_GRACE_MINUTES} minutes after the start time.` };
  }

  const feeCents = Number(booking.no_show_fee_cents) || 0;
  let chargeStatus: "charged" | "failed" | "waived" = "waived";
  let paymentIntentId: string | null = null;
  let transferId: string | null = null;

  if (feeCents >= 50 && booking.stripe_customer_id && booking.stripe_payment_method_id) {
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: feeCents,
          currency: "cad",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `No-show fee: ${booking.service_name || "booking"}`,
          metadata: { flow_type: "no_show_fee", booking_id: booking.id },
        },
        { idempotencyKey: `no_show_${booking.id}` }
      );
      paymentIntentId = intent.id;
      chargeStatus = intent.status === "succeeded" ? "charged" : "failed";

      if (chargeStatus === "charged") {
        transferId = await payNoShowToPro(supabase, booking.professional_id, booking.id, feeCents, intent);
      }
    } catch (error) {
      // Usually a declined card. The booking still closes as a no-show.
      console.error(`No-show charge failed for booking ${booking.id}:`, error);
      const stripeError = error as { payment_intent?: { id?: string } };
      paymentIntentId = stripeError.payment_intent?.id || null;
      chargeStatus = "failed";
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_by: actorId,
      cancelled_at: now,
      no_show_status: chargeStatus,
      no_show_at: now,
      stripe_no_show_payment_intent_id: paymentIntentId,
      stripe_no_show_transfer_id: transferId,
    })
    .eq("id", booking.id)
    .eq("status", "confirmed");
  if (error) return { ok: false, status: 500, error: error.message };

  const feeText = `$${(feeCents / 100).toFixed(2)}`;
  await supabase.from("notifications").insert({
    user_id: booking.customer_id,
    request_id: null,
    is_read: false,
    type: "booking_no_show",
    title:
      chargeStatus === "charged"
        ? `You missed your ${booking.service_name || "appointment"}. A ${feeText} no-show fee was charged.`
        : `You missed your ${booking.service_name || "appointment"}. It was marked as a no-show.`,
  });

  return {
    ok: true,
    charged: chargeStatus === "charged",
    feeCents,
    message:
      chargeStatus === "charged"
        ? `Marked as a no-show. ${feeText} was charged to their card.`
        : chargeStatus === "failed"
        ? "Marked as a no-show, but their card was declined, so no fee was collected."
        : "Marked as a no-show.",
  };
}

async function payNoShowToPro(
  supabase: ServiceClient,
  professionalId: string,
  bookingId: string,
  feeCents: number,
  intent: Stripe.PaymentIntent
) {
  const { data: pro } = await supabase.from("profiles").select("stripe_account_id").eq("id", professionalId).maybeSingle();
  if (!pro?.stripe_account_id) return null;

  const amount = feeCents - Math.round(feeCents * (NO_SHOW_LINEUP_PERCENT / 100));
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  try {
    const transfer = await stripe.transfers.create(
      {
        amount,
        currency: "cad",
        destination: pro.stripe_account_id,
        ...(chargeId ? { source_transaction: chargeId } : {}),
        transfer_group: `booking_${bookingId}`,
        metadata: { flow_type: "no_show_fee", booking_id: bookingId },
      },
      { idempotencyKey: `no_show_transfer_${bookingId}` }
    );
    return transfer.id;
  } catch (error) {
    console.error(`No-show payout failed for booking ${bookingId}:`, error);
    return null;
  }
}
