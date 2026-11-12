// Turning a successful booking payment into a booking (moved out of the
// Stripe webhook so a booking fully covered by a gift card, with no card
// payment at all, can go through exactly the same steps).

import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { cleanServiceLabel } from "@/app/lib/serviceLabel";
import { hasFrontDeskClash } from "@/app/lib/busyTimes";
import { getSiteUrl } from "@/app/lib/siteUrl";

function timeToMinutes(timeString: string) {
  const [hours, minutes] = String(timeString).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

// Postgres error codes that mean "this slot is already taken":
// 23505 = unique violation (same start time / same request),
// 23P01 = exclusion violation (overlapping time range, see
//         supabase/migrations/20261016_prevent_double_bookings.sql).
function isSlotTakenError(code: string | undefined) {
  return code === "23505" || code === "23P01";
}

// A customer paid for a time that someone else secured first. Never leave them
// charged without a booking: refund, claw back any deposit already sent to the
// professional, and tell the customer. Returning (instead of throwing) also
// stops Stripe from retrying this event forever.
async function releaseTakenSlot(
  supabase: ReturnType<typeof getServiceSupabase>,
  params: {
    paymentIntentId: string;
    customerId: string | null;
    depositTransferId?: string | null;
    requestId?: string | null;
  }
) {
  if (params.depositTransferId) {
    try {
      await stripe.transfers.createReversal(params.depositTransferId);
    } catch (reversalError) {
      console.error("Failed to reverse deposit for taken slot:", reversalError);
    }
  }

  try {
    await stripe.refunds.create({ payment_intent: params.paymentIntentId });
  } catch (refundError) {
    console.error("Failed to refund payment for taken slot:", refundError);
  }

  // A gift card used on this payment gets its amount back.
  await restoreGiftCard(supabase, params.paymentIntentId);

  if (params.customerId) {
    await supabase.from("notifications").insert([
      {
        user_id: params.customerId,
        is_read: false,
        type: "booking_slot_taken",
        title: "That time was just booked by someone else — you've been fully refunded",
        ...(params.requestId ? { request_id: params.requestId } : {}),
      },
    ]);
  }
}

async function restoreGiftCard(supabase: ReturnType<typeof getServiceSupabase>, paymentIntentId: string) {
  const { error } = await supabase.rpc("restore_gift_card_for_payment", { p_payment_intent: paymentIntentId });
  if (error) console.error(`Gift card restore failed for ${paymentIntentId}:`, error);
}

// A gift card on this payment: draw it down now, once (safe on retries).
// If its balance was spent elsewhere in the meantime, refund the payment and
// tell the client rather than book them for less than the price. Returns
// whether the booking should go ahead.
async function claimGiftCard(
  supabase: ReturnType<typeof getServiceSupabase>,
  paymentIntent: { id: string },
  metadata: Record<string, string>,
  customerId: string | null,
  requestId?: string | null
) {
  const giftCardId = metadata.gift_card_id;
  const giftCents = Number(metadata.gift_card_cents || 0);
  if (!giftCardId || giftCents <= 0) return true;

  const { data, error } = await supabase.rpc("redeem_gift_card_for_payment", {
    p_card: giftCardId,
    p_amount: giftCents,
    p_by: customerId,
    p_payment_intent: paymentIntent.id,
  });
  if (error) throw new Error(`Gift card redeem failed: ${error.message}`); // Stripe retries
  if (data !== null) return true;

  try {
    await stripe.refunds.create({ payment_intent: paymentIntent.id });
  } catch (refundError) {
    console.error("Refund after gift card shortfall failed:", refundError);
  }
  if (customerId) {
    await supabase.from("notifications").insert([
      {
        user_id: customerId,
        is_read: false,
        type: "booking_gift_card_failed",
        title: "Your gift card didn't have enough left for that booking, so you haven't been charged. Please book again.",
        ...(requestId ? { request_id: requestId } : {}),
      },
    ]);
  }
  return false;
}

async function sendBookingConfirmedEmail(bookingId: string) {
  const siteUrl = getSiteUrl();

  try {
    await fetch(`${siteUrl}/api/notifications/booking-confirmed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
      },
      body: JSON.stringify({ bookingId }),
    });
  } catch (error) {
    console.error("Booking confirmation email failed:", error);
  }
}

export async function handlePaymentIntentSucceeded(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  await bookFromPaymentIntent(paymentIntent);
}

// Creates the booking a payment was for. Also used with no real charge when
// a gift card covers the whole price (amount 0, no charge to transfer from).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bookFromPaymentIntent(paymentIntent: any) {
  const supabase = getServiceSupabase();
  const metadata = paymentIntent.metadata || {};

  // The gift card covered everything, yet a card payment went through anyway
  // (e.g. an Apple Pay sheet left open): give that money back and book it as
  // the gift card booking it is.
  if (metadata.gift_only === "1" && Number(paymentIntent.amount_received || 0) > 0) {
    try {
      await stripe.refunds.create({ payment_intent: paymentIntent.id });
    } catch (refundError) {
      console.error("Refund of card payment on a gift-only booking failed:", refundError);
    }
    paymentIntent = { ...paymentIntent, amount: 0, amount_received: 0, latest_charge: null };
  }

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

  const hasBookingConflict =
    (existingBookings || []).some((booking) => {
      const bookingStart = timeToMinutes(String(booking.start_time).slice(0, 5));
      const bookingEnd = timeToMinutes(String(booking.end_time).slice(0, 5));
      return proposedStartMinutes < bookingEnd && proposedEndMinutes > bookingStart;
    }) || (await hasFrontDeskClash(offer.professional_id, offer.proposed_date, proposedStart, proposedEnd));

  if (hasBookingConflict) {
    await supabase
      .from("request_offers")
      .update({ status: "pending" })
      .eq("id", offer.id);

    await releaseTakenSlot(supabase, {
      paymentIntentId: paymentIntent.id,
      customerId: requestRow.client_id,
      requestId: requestRow.id,
    });
    return;
  }

  if (!(await claimGiftCard(supabase, paymentIntent, metadata, requestRow.client_id, requestRow.id))) {
    await supabase.from("request_offers").update({ status: "pending" }).eq("id", offer.id);
    return;
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

  if (paymentIntent.latest_charge) {
    // Expanded object or bare id: either way it is the charge to tie transfers to.
    chargeId =
      typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge.id;
  }

  let depositTransferId: string | null = null;
  let payoutStatus = "not_ready";

  if (professionalProfile.stripe_account_id && depositAmountCents > 0) {
    try {
      const transfer = await stripe.transfers.create({
        amount: depositAmountCents,
        currency: "cad",
        destination: professionalProfile.stripe_account_id,
        // Tied to the charge so it succeeds while the payment is still pending
        // (new Stripe accounts hold funds ~7 days); it becomes available to the
        // pro when the charge settles.
        ...(chargeId ? { source_transaction: chargeId } : {}),
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
        service_name: cleanServiceLabel(requestRow.service_detail) || requestRow.title,
        service_mode: resolvedServiceMode,
        source: "request",
        formatted_address: bookingLocation.formatted_address,
        location_place_id: bookingLocation.location_place_id,
        location_lat: bookingLocation.location_lat,
        location_lng: bookingLocation.location_lng,
        // The service itself, not counting any tip on top.
        // The service itself (gift card portion included), not counting any tip.
        service_price: (amountCents - Number(metadata.tip_cents || 0) + Number(metadata.gift_card_cents || 0)) / 100,
        ...(Number(metadata.gift_card_cents || 0) > 0 && metadata.gift_card_id
          ? { gift_card_id: metadata.gift_card_id, gift_card_cents: Number(metadata.gift_card_cents) }
          : {}),
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        total_amount_cents: amountCents,
        deposit_amount_cents: depositAmountCents,
        platform_fee_cents: platformFeeCents,
        // Only studio bookings carry these, so bookings keep working on a
        // database where the studio migration hasn't been run yet.
        ...(metadata.studio_id
          ? { studio_id: metadata.studio_id, studio_cut_cents: Number(metadata.studio_cut_cents || 0) }
          : {}),
        professional_payout_cents: professionalPayoutCents,
        remaining_payout_cents: remainingPayoutCents,
        payout_status: payoutStatus,
        stripe_deposit_transfer_id: depositTransferId,
      },
    ])
    .select("id")
    .single();

  if (createBookingError || !createdBooking) {
    if (createBookingError?.code === "23P01") {
      // Overlapped another booking that landed a moment earlier.
      await supabase.from("request_offers").update({ status: "pending" }).eq("id", offer.id);
      await releaseTakenSlot(supabase, {
        paymentIntentId: paymentIntent.id,
        customerId: requestRow.client_id,
        depositTransferId,
        requestId: requestRow.id,
      });
      return;
    }

    const isDuplicateRequestBooking = createBookingError?.code === "23505";

    if (isDuplicateRequestBooking) {
      // Another payment intent for this same request already created the booking
      // (race between two payment attempts). Refund this duplicate charge instead
      // of failing — failing here would make Stripe retry this event indefinitely.
      // Also claw back any deposit this attempt already sent to the professional.
      if (depositTransferId) {
        try {
          await stripe.transfers.createReversal(depositTransferId);
        } catch (reversalError) {
          console.error("Failed to reverse duplicate booking deposit:", reversalError);
        }
      }
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
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("request_id", requestRow.id);

  // "not_selected" (not "declined") — this is the request being filled by someone
  // else, not the customer explicitly rejecting this offer. Keeping the two states
  // distinct lets the UI show "Outbid" here instead of implying the customer looked
  // at this specific offer and turned it down. Only pending/payment_pending offers
  // are touched so an offer the customer already explicitly declined (or one the
  // professional withdrew) keeps its real status instead of being overwritten.
  const { data: declinedOffers } = await supabase
    .from("request_offers")
    .update({ status: "not_selected", responded_at: new Date().toISOString() })
    .eq("request_id", requestRow.id)
    .neq("id", offer.id)
    .in("status", ["pending", "payment_pending"])
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

  if (!subscribed) return 15; // Basic
  if (profile.subscription_plan === "apprentice") return 25;
  if (profile.subscription_plan === "pro" || profile.subscription_plan === "master") return null; // unlimited
  return 15; // anything unrecognised gets the Basic limit, never unlimited
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

  const hasBookingConflict =
    (existingBookings || []).some((booking) => {
      const bookingStart = timeToMinutes(String(booking.start_time).slice(0, 5));
      const bookingEnd = timeToMinutes(String(booking.end_time).slice(0, 5));
      return startMinutes < bookingEnd && endMinutes > bookingStart;
    }) || (await hasFrontDeskClash(professionalId, bookingDate, startTime, endTime));

  if (hasBookingConflict) {
    await releaseTakenSlot(supabase, { paymentIntentId: paymentIntent.id, customerId });
    return;
  }

  if (!(await claimGiftCard(supabase, paymentIntent, metadata, customerId))) return;

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

  if (paymentIntent.latest_charge) {
    // Expanded object or bare id: either way it is the charge to tie transfers to.
    chargeId =
      typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge.id;
  }

  let depositTransferId: string | null = null;
  let payoutStatus = "not_ready";

  if (professionalProfile.stripe_account_id && depositAmountCents > 0) {
    try {
      const transfer = await stripe.transfers.create({
        amount: depositAmountCents,
        currency: "cad",
        destination: professionalProfile.stripe_account_id,
        // Tied to the charge so it succeeds while the payment is still pending
        // (new Stripe accounts hold funds ~7 days); it becomes available to the
        // pro when the charge settles.
        ...(chargeId ? { source_transaction: chargeId } : {}),
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
        ...(metadata.standing_id ? { standing_id: metadata.standing_id } : {}),
        formatted_address: professionalProfile.formatted_address || null,
        location_place_id: professionalProfile.location_place_id || null,
        location_lat: professionalProfile.location_lat ?? null,
        location_lng: professionalProfile.location_lng ?? null,
        // The service itself, not counting any tip on top.
        // The service itself (gift card portion included), not counting any tip.
        service_price: (amountCents - Number(metadata.tip_cents || 0) + Number(metadata.gift_card_cents || 0)) / 100,
        ...(Number(metadata.gift_card_cents || 0) > 0 && metadata.gift_card_id
          ? { gift_card_id: metadata.gift_card_id, gift_card_cents: Number(metadata.gift_card_cents) }
          : {}),
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        total_amount_cents: amountCents,
        deposit_amount_cents: depositAmountCents,
        platform_fee_cents: platformFeeCents,
        // Only studio bookings carry these, so bookings keep working on a
        // database where the studio migration hasn't been run yet.
        ...(metadata.studio_id
          ? { studio_id: metadata.studio_id, studio_cut_cents: Number(metadata.studio_cut_cents || 0) }
          : {}),
        professional_payout_cents: professionalPayoutCents,
        remaining_payout_cents: remainingPayoutCents,
        payout_status: payoutStatus,
        stripe_deposit_transfer_id: depositTransferId,
      },
    ])
    .select("id")
    .single();

  if (createBookingError || !createdBooking) {
    if (isSlotTakenError(createBookingError?.code)) {
      // Another booking for this slot landed a moment earlier (race between
      // two concurrent direct-booking attempts).
      await releaseTakenSlot(supabase, { paymentIntentId: paymentIntent.id, customerId, depositTransferId });
      return;
    }

    throw new Error(createBookingError?.message || "Booking creation failed.");
  }

  await sendBookingConfirmedEmail(createdBooking.id);
}

