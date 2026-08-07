import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

function timeToMinutes(timeString: string) {
  const [hours, minutes] = String(timeString).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

async function sendBookingConfirmedEmail(bookingId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    await fetch(`${siteUrl}/api/notifications/booking-confirmed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
  } catch (error) {
    console.error("Booking confirmation email failed:", error);
  }
}

async function handlePaymentIntentSucceeded(paymentIntentId: string) {
  const supabase = getServiceSupabase();

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  const metadata = paymentIntent.metadata || {};

  if (metadata.flow_type === "direct_booking") {
    await handleDirectBookingPaymentSucceeded(supabase, paymentIntent, metadata);
    return;
  }

  if (metadata.flow_type !== "request_offer") {
    return;
  }

  const offerId = metadata.offer_id;
  const requestId = metadata.request_id;

  if (!offerId || !requestId) {
    throw new Error("Missing Stripe metadata.");
  }

  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (existingBooking?.id) {
    return;
  }

  const { data: offer, error: offerError } = await supabase
    .from("request_offers")
    .select("*")
    .eq("id", offerId)
    .single();

  if (offerError || !offer) {
    throw new Error("Offer not found.");
  }

  const { data: requestRow, error: requestError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (requestError || !requestRow) {
    throw new Error("Request not found.");
  }

  if (requestRow.status !== "open") {
    throw new Error("Request is no longer open.");
  }

  if (!offer.proposed_date || !offer.proposed_start_time || !offer.proposed_end_time) {
    throw new Error("Offer is missing scheduling details.");
  }

  const proposedStart = String(offer.proposed_start_time).slice(0, 5);
  const proposedEnd = String(offer.proposed_end_time).slice(0, 5);

  const { data: existingBookings, error: bookingsCheckError } = await supabase
    .from("bookings")
    .select("id, start_time, end_time, status")
    .eq("professional_id", offer.professional_id)
    .eq("booking_date", offer.proposed_date)
    .in("status", ["confirmed", "completion_requested", "completed"]);

  if (bookingsCheckError) {
    throw new Error(bookingsCheckError.message);
  }

  const proposedStartMinutes = timeToMinutes(proposedStart);
  const proposedEndMinutes = timeToMinutes(proposedEnd);

  const hasBookingConflict = (existingBookings || []).some((booking) => {
    const bookingStart = timeToMinutes(String(booking.start_time).slice(0, 5));
    const bookingEnd = timeToMinutes(String(booking.end_time).slice(0, 5));
    return proposedStartMinutes < bookingEnd && proposedEndMinutes > bookingStart;
  });

  if (hasBookingConflict) {
    await supabase
      .from("request_offers")
      .update({ status: "pending" })
      .eq("id", offer.id);

    throw new Error("Booking conflict after payment.");
  }

  // Prefer the mode the professional actually proposed in their offer — a
  // request can be open to multiple modes, and the offer is what pins down
  // which one this specific booking is for. Fall back to the request's mode
  // for offers created before this field existed.
  const resolvedServiceMode = offer.proposed_service_mode || requestRow.service_mode;

  const usesProfessionalLocation =
    resolvedServiceMode === "in_shop" || resolvedServiceMode === "home_studio";

  let bookingLocation = {
    formatted_address: requestRow.formatted_address || requestRow.location || null,
    location_place_id: requestRow.location_place_id || null,
    location_lat: requestRow.location_lat ?? null,
    location_lng: requestRow.location_lng ?? null,
  };

  const { data: professionalProfile, error: professionalProfileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, stripe_account_id, stripe_payouts_enabled, formatted_address, location_place_id, location_lat, location_lng"
    )
    .eq("id", offer.professional_id)
    .single();

  if (professionalProfileError || !professionalProfile) {
    throw new Error("Professional profile not found.");
  }

  if (usesProfessionalLocation) {
    if (
      !professionalProfile.formatted_address ||
      typeof professionalProfile.location_lat !== "number" ||
      typeof professionalProfile.location_lng !== "number"
    ) {
      throw new Error("Professional location is missing.");
    }

    bookingLocation = {
      formatted_address: professionalProfile.formatted_address,
      location_place_id: professionalProfile.location_place_id || null,
      location_lat: professionalProfile.location_lat,
      location_lng: professionalProfile.location_lng,
    };
  }

  const amountCents = paymentIntent.amount_received || paymentIntent.amount;
  const platformFeeCents = Number(metadata.platform_fee_cents || 0);
  const depositAmountCents = Number(metadata.deposit_amount_cents || 0);
  const professionalPayoutCents = Number(metadata.professional_payout_cents || 0);
  const remainingPayoutCents = Number(metadata.remaining_payout_cents || 0);

  let chargeId: string | null = null;

  if (
    paymentIntent.latest_charge &&
    typeof paymentIntent.latest_charge !== "string"
  ) {
    chargeId = paymentIntent.latest_charge.id;
  }

  let depositTransferId: string | null = null;
  let payoutStatus = "not_ready";

  if (professionalProfile.stripe_account_id && depositAmountCents > 0) {
    try {
      const transfer = await stripe.transfers.create({
        amount: depositAmountCents,
        currency: "cad",
        destination: professionalProfile.stripe_account_id,
        transfer_group: `request_${requestRow.id}`,
        metadata: {
          flow_type: "request_offer_deposit",
          offer_id: offer.id,
          request_id: requestRow.id,
          professional_id: offer.professional_id,
        },
      });

      depositTransferId = transfer.id;
      payoutStatus = "deposit_released";
    } catch (transferError) {
      // Deposit payout is a nice-to-have, not a precondition for the booking
      // itself — a customer who already paid should still get their booking
      // confirmed even if the professional's payout account has an issue.
      console.error("Deposit transfer failed, continuing without it:", transferError);
    }
  }

  const { data: createdBooking, error: createBookingError } = await supabase
    .from("bookings")
    .insert([
      {
        request_id: requestRow.id,
        professional_id: offer.professional_id,
        customer_id: requestRow.client_id,
        booking_date: offer.proposed_date,
        start_time: proposedStart,
        end_time: proposedEnd,
        status: "confirmed",
        service_name: requestRow.service_detail || requestRow.title,
        service_mode: resolvedServiceMode,
        source: "request",
        formatted_address: bookingLocation.formatted_address,
        location_place_id: bookingLocation.location_place_id,
        location_lat: bookingLocation.location_lat,
        location_lng: bookingLocation.location_lng,
        service_price: amountCents / 100,
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        total_amount_cents: amountCents,
        deposit_amount_cents: depositAmountCents,
        platform_fee_cents: platformFeeCents,
        professional_payout_cents: professionalPayoutCents,
        remaining_payout_cents: remainingPayoutCents,
        payout_status: payoutStatus,
        stripe_deposit_transfer_id: depositTransferId,
      },
    ])
    .select("id")
    .single();

  if (createBookingError || !createdBooking) {
    const isDuplicateRequestBooking = createBookingError?.code === "23505";

    if (isDuplicateRequestBooking) {
      // Another payment intent for this same request already created the booking
      // (race between two payment attempts). Refund this duplicate charge instead
      // of failing — failing here would make Stripe retry this event indefinitely.
      try {
        await stripe.refunds.create({ payment_intent: paymentIntent.id });
      } catch (refundError) {
        console.error("Failed to refund duplicate booking payment:", refundError);
      }
      return;
    }

    throw new Error(createBookingError?.message || "Booking creation failed.");
  }

  await supabase
    .from("request_offers")
    .update({ status: "accepted" })
    .eq("id", offer.id)
    .eq("request_id", requestRow.id);

  const { data: declinedOffers } = await supabase
    .from("request_offers")
    .update({ status: "declined" })
    .eq("request_id", requestRow.id)
    .neq("id", offer.id)
    .select("id, professional_id");

  const declinedProfessionalIds = [
    ...new Set((declinedOffers || []).map((row) => row.professional_id)),
  ];

  if (declinedProfessionalIds.length > 0) {
    await supabase.from("notifications").insert(
      declinedProfessionalIds.map((professionalId) => ({
        user_id: professionalId,
        request_id: requestRow.id,
        is_read: false,
        type: "offer_declined",
        title: `Your offer wasn't selected${
          requestRow.title ? ` for ${requestRow.title}` : ""
        }`,
      }))
    );
  }

  const declinedOfferIds = (declinedOffers || []).map((row) => row.id);

  if (declinedOfferIds.length > 0) {
    await supabase.from("notifications").delete().in("offer_id", declinedOfferIds);
  }

  await supabase
    .from("service_requests")
    .update({
      status: "accepted",
      accepted_professional_id: offer.professional_id,
      scheduled_date: offer.proposed_date,
      scheduled_start_time: proposedStart,
      scheduled_end_time: proposedEnd,
    })
    .eq("id", requestRow.id);

  await supabase.from("booking_messages").insert([
    {
      booking_id: createdBooking.id,
      sender_id: requestRow.client_id,
      message: `Offer accepted after payment. Scheduled for ${offer.proposed_date} at ${proposedStart} - ${proposedEnd}. You can now chat here to coordinate details.`,
    },
  ]);

  await sendBookingConfirmedEmail(createdBooking.id);
  await notifyIfNearingMonthlyBookingCap(supabase, offer.professional_id);
}

function getMonthlyBookingCap(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed =
    profile.subscription_status === "active" || profile.subscription_status === "trialing";

  if (!subscribed || !profile.subscription_plan) return 15; // Basic
  if (profile.subscription_plan === "apprentice") return 25;
  return null; // Pro / Master — unlimited
}

// Request-sourced bookings count toward a subscribed professional's monthly
// cap (direct calendar bookings never do). Warn once at 80% used and once
// at the cap itself, rather than on every booking near the limit.
async function notifyIfNearingMonthlyBookingCap(
  supabase: ReturnType<typeof getServiceSupabase>,
  professionalId: string
) {
  const { data: professionalProfile } = await supabase
    .from("profiles")
    .select("subscription_status, subscription_plan")
    .eq("id", professionalId)
    .single();

  const cap = getMonthlyBookingCap(professionalProfile || {});
  if (cap === null) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", professionalId)
    .eq("source", "request")
    .in("status", ["confirmed", "completion_requested", "completed"])
    .gte("booking_date", monthStart)
    .lte("booking_date", monthEnd);

  const currentCount = count || 0;
  const nearingThreshold = Math.ceil(cap * 0.8);

  if (currentCount === cap) {
    await supabase.from("notifications").insert([{
      user_id: professionalId,
      is_read: false,
      type: "booking_cap_reached",
      title: `You've hit your monthly booking limit (${cap}) — it resets next month`,
    }]);
  } else if (currentCount === nearingThreshold) {
    await supabase.from("notifications").insert([{
      user_id: professionalId,
      is_read: false,
      type: "booking_cap_nearing",
      title: `You're nearing your monthly booking limit — ${currentCount} of ${cap} used`,
    }]);
  }
}

async function handleDirectBookingPaymentSucceeded(
  supabase: ReturnType<typeof getServiceSupabase>,
  paymentIntent: any,
  metadata: Record<string, string>
) {
  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (existingBooking?.id) {
    return;
  }

  const professionalId = metadata.professional_id;
  const customerId = metadata.customer_id;
  const serviceId = metadata.service_id;
  const bookingDate = metadata.booking_date;
  const startTime = metadata.start_time;
  const endTime = metadata.end_time;
  const serviceMode = metadata.service_mode;

  if (!professionalId || !customerId || !bookingDate || !startTime || !endTime) {
    throw new Error("Missing direct booking metadata.");
  }

  const { data: existingBookings, error: bookingsCheckError } = await supabase
    .from("bookings")
    .select("id, start_time, end_time, status")
    .eq("professional_id", professionalId)
    .eq("booking_date", bookingDate)
    .in("status", ["confirmed", "completion_requested", "completed"]);

  if (bookingsCheckError) {
    throw new Error(bookingsCheckError.message);
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  const hasBookingConflict = (existingBookings || []).some((booking) => {
    const bookingStart = timeToMinutes(String(booking.start_time).slice(0, 5));
    const bookingEnd = timeToMinutes(String(booking.end_time).slice(0, 5));
    return startMinutes < bookingEnd && endMinutes > bookingStart;
  });

  if (hasBookingConflict) {
    throw new Error("Booking conflict after payment.");
  }

  const { data: professionalProfile, error: professionalProfileError } = await supabase
    .from("profiles")
    .select("id, full_name, stripe_account_id, formatted_address, location_place_id, location_lat, location_lng")
    .eq("id", professionalId)
    .single();

  if (professionalProfileError || !professionalProfile) {
    throw new Error("Professional profile not found.");
  }

  const { data: service } = await supabase
    .from("professional_services")
    .select("service_name")
    .eq("id", serviceId)
    .maybeSingle();

  const amountCents = paymentIntent.amount_received || paymentIntent.amount;
  const platformFeeCents = Number(metadata.platform_fee_cents || 0);
  const depositAmountCents = Number(metadata.deposit_amount_cents || 0);
  const professionalPayoutCents = Number(metadata.professional_payout_cents || 0);
  const remainingPayoutCents = Number(metadata.remaining_payout_cents || 0);

  let chargeId: string | null = null;

  if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string") {
    chargeId = paymentIntent.latest_charge.id;
  }

  let depositTransferId: string | null = null;
  let payoutStatus = "not_ready";

  if (professionalProfile.stripe_account_id && depositAmountCents > 0) {
    try {
      const transfer = await stripe.transfers.create({
        amount: depositAmountCents,
        currency: "cad",
        destination: professionalProfile.stripe_account_id,
        transfer_group: `direct_booking_${paymentIntent.id}`,
        metadata: {
          flow_type: "direct_booking_deposit",
          professional_id: professionalId,
        },
      });

      depositTransferId = transfer.id;
      payoutStatus = "deposit_released";
    } catch (transferError) {
      console.error("Deposit transfer failed, continuing without it:", transferError);
    }
  }

  const { data: createdBooking, error: createBookingError } = await supabase
    .from("bookings")
    .insert([
      {
        professional_id: professionalId,
        customer_id: customerId,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        status: "confirmed",
        service_id: serviceId || null,
        service_name: service?.service_name || "Booked service",
        service_mode: serviceMode || null,
        source: "direct_booking",
        formatted_address: professionalProfile.formatted_address || null,
        location_place_id: professionalProfile.location_place_id || null,
        location_lat: professionalProfile.location_lat ?? null,
        location_lng: professionalProfile.location_lng ?? null,
        service_price: amountCents / 100,
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        total_amount_cents: amountCents,
        deposit_amount_cents: depositAmountCents,
        platform_fee_cents: platformFeeCents,
        professional_payout_cents: professionalPayoutCents,
        remaining_payout_cents: remainingPayoutCents,
        payout_status: payoutStatus,
        stripe_deposit_transfer_id: depositTransferId,
      },
    ])
    .select("id")
    .single();

  if (createBookingError || !createdBooking) {
    const isDuplicateSlotBooking = createBookingError?.code === "23505";

    if (isDuplicateSlotBooking) {
      // Another payment intent for this same slot already created a booking
      // (race between two concurrent direct-booking attempts). Refund this
      // duplicate charge instead of failing — failing here would make Stripe
      // retry this event indefinitely.
      try {
        await stripe.refunds.create({ payment_intent: paymentIntent.id });
      } catch (refundError) {
        console.error("Failed to refund duplicate direct booking payment:", refundError);
      }
      return;
    }

    throw new Error(createBookingError?.message || "Booking creation failed.");
  }

  await sendBookingConfirmedEmail(createdBooking.id);
}

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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" && session.metadata?.supabase_user_id) {
        await handleSubscriptionCheckoutCompleted(session);
      }
    }

    if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(event.data.object);
    }

    if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as any;
      if (invoice.subscription) {
        await handleInvoicePaymentFailed(invoice.subscription as string);
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

function getPlanFromPriceId(priceId: string): string {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_APPRENTICE_PRICE_ID) return "apprentice";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_MASTER_PRICE_ID) return "master";
  return "unknown";
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
      subscription_current_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      // Instant-booking calendar is available on any paid tier (not just
      // Master) — turn it on automatically instead of leaving it as a buried
      // settings toggle nobody knows to flip. Direct bookings are never
      // counted against the monthly request cap, regardless of tier.
      ...(plan && plan !== "unknown"
        ? { direct_booking_enabled: true, public_availability_enabled: true }
        : {}),
    })
    .eq("id", userId);
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
      subscription_current_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      ...(isSubscribed
        ? { direct_booking_enabled: true, public_availability_enabled: true }
        : { direct_booking_enabled: false, public_availability_enabled: false }),
    })
    .eq("id", userId);
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
}

async function handleInvoicePaymentFailed(subscriptionId: string) {
  const supabase = getServiceSupabase();

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