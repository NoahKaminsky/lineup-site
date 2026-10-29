import { NextResponse } from "next/server";
import { platformFeeCentsFor, splitBookingPayment } from "@/app/lib/commission";
import { getStudioPricingForPro } from "@/app/lib/studios";
import { getBookingWindows, getTimeOffDays } from "@/app/lib/busyTimes";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

const DEPOSIT_PERCENT = 20;
const CURRENCY = "cad";

function getMonthlyBookingCap(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed =
    profile.subscription_status === "active" || profile.subscription_status === "trialing";

  if (!subscribed) return 15; // Basic
  if (profile.subscription_plan === "apprentice") return 25;
  if (profile.subscription_plan === "pro" || profile.subscription_plan === "master") return null; // unlimited
  return 15; // anything unrecognised gets the Basic limit, never unlimited
}

async function checkMonthlyBookingCap(
  supabase: ReturnType<typeof getServiceSupabase>,
  professionalId: string
) {
  const { data: professionalProfile } = await supabase
    .from("profiles")
    .select("subscription_status, subscription_plan")
    .eq("id", professionalId)
    .single();

  const cap = getMonthlyBookingCap(professionalProfile || {});

  if (cap === null) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Only request/offer-sourced jobs count toward the cap — direct calendar bookings
  // are a separate, ungated mechanism for any subscribed (non-Basic) tier.
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", professionalId)
    .eq("source", "request")
    .in("status", ["confirmed", "completion_requested", "completed"])
    .gte("booking_date", monthStart)
    .lte("booking_date", monthEnd);

  if ((count || 0) >= cap) {
    return "This professional has reached their monthly request limit. They'll be available again next month.";
  }

  return null;
}

function parsePriceToCents(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;

  const cleaned = String(value)
    .replace(/cad/gi, "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount <= 0) return null;

  return Math.round(amount * 100);
}

function timeToMinutes(timeString: string) {
  const [hours, minutes] = String(timeString).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function isSubscribedToScheduleFeature(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed =
    profile.subscription_status === "active" || profile.subscription_status === "trialing";
  return subscribed && ["apprentice", "pro", "master"].includes(profile.subscription_plan || "");
}

// Never take a customer's money for a professional who isn't currently
// verified (never approved, still pending, rejected, or lapsed) — the
// booking would otherwise proceed with nobody having checked who's doing it.
async function checkProfessionalVerified(
  serviceSupabase: ReturnType<typeof getServiceSupabase>,
  professionalId: string
) {
  const { data } = await serviceSupabase
    .from("profiles")
    .select("verification_status, verified_until")
    .eq("id", professionalId)
    .maybeSingle();

  if (!isVerifiedNow(data)) {
    return "This professional isn't available to book right now.";
  }

  return null;
}

async function handleDirectBookingIntent(req: Request, body: any) {
  const { professionalId, serviceId, date, startTime, endTime, mode } = body;

  if (!professionalId || !serviceId || !date || !startTime || !endTime || !mode) {
    return NextResponse.json({ error: "Missing booking details." }, { status: 400 });
  }

  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const serviceSupabase = getServiceSupabase();

  const { data: professional, error: professionalError } = await serviceSupabase
    .from("profiles")
    .select(
      "id, role, direct_booking_enabled, public_availability_enabled, formatted_address, location_lat, location_lng, location_place_id, subscription_status, subscription_plan, stripe_account_id"
    )
    .eq("id", professionalId)
    .single();

  if (professionalError || !professional) {
    return NextResponse.json({ error: "Professional not found" }, { status: 404 });
  }

  const verificationError = await checkProfessionalVerified(serviceSupabase, professionalId);

  if (verificationError) {
    return NextResponse.json({ error: verificationError }, { status: 409 });
  }

  if (!professional.direct_booking_enabled || !professional.public_availability_enabled) {
    return NextResponse.json({ error: "This professional does not accept direct bookings." }, { status: 409 });
  }

  if (!isSubscribedToScheduleFeature(professional)) {
    return NextResponse.json(
      { error: "This professional's schedule isn't available for direct booking right now." },
      { status: 409 }
    );
  }

  // Direct bookings are never gated by the request-marketplace monthly cap —
  // that cap only applies to request/offer-sourced jobs.

  if (mode !== "in_shop" && mode !== "home_studio") {
    return NextResponse.json(
      { error: "Direct booking is only available for in-shop or home-studio appointments." },
      { status: 400 }
    );
  }

  if (
    !professional.formatted_address ||
    typeof professional.location_lat !== "number" ||
    typeof professional.location_lng !== "number"
  ) {
    return NextResponse.json(
      { error: "This professional needs to add their shop or studio address before direct bookings can be accepted." },
      { status: 409 }
    );
  }

  const { data: service, error: serviceError } = await serviceSupabase
    .from("professional_services")
    .select("id, professional_id, service_name, duration_minutes, price, is_active, is_bookable")
    .eq("id", serviceId)
    .eq("professional_id", professionalId)
    .eq("is_active", true)
    .eq("is_bookable", true)
    .single();

  if (serviceError || !service) {
    return NextResponse.json({ error: "Service not found or not bookable." }, { status: 404 });
  }

  const normalizedStart = String(startTime).slice(0, 5);
  const normalizedEnd = String(endTime).slice(0, 5);

  if (normalizedEnd <= normalizedStart) {
    return NextResponse.json({ error: "End time must be later than start time." }, { status: 400 });
  }

  const amountCents = parsePriceToCents(service.price);

  if (!amountCents) {
    return NextResponse.json({ error: "This service does not have a valid price set." }, { status: 400 });
  }

  // The chosen service has to fit inside the time being reserved — otherwise
  // the booking would block less time than the appointment actually takes and
  // the next customer could book on top of it.
  const requestedMinutes = timeToMinutes(normalizedEnd) - timeToMinutes(normalizedStart);
  if (Number(service.duration_minutes) > requestedMinutes) {
    return NextResponse.json(
      { error: "That service is longer than the time you picked. Please choose a longer time." },
      { status: 400 }
    );
  }

  // The time must sit inside one of the professional's active availability
  // windows for that weekday (the page already only offers these, but the
  // server is the source of truth).
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const { data: availabilityRows, error: availabilityError } = await serviceSupabase
    .from("professional_availability")
    .select("start_time, end_time, is_active")
    .eq("professional_id", professionalId)
    .eq("day_of_week", weekday)
    .eq("is_active", true);

  if (availabilityError) {
    return NextResponse.json({ error: availabilityError.message }, { status: 500 });
  }

  const insideAvailability = (availabilityRows || []).some((row) => {
    const windowStart = timeToMinutes(String(row.start_time).slice(0, 5));
    const windowEnd = timeToMinutes(String(row.end_time).slice(0, 5));
    return timeToMinutes(normalizedStart) >= windowStart && timeToMinutes(normalizedEnd) <= windowEnd;
  });

  if (!insideAvailability) {
    return NextResponse.json(
      { error: "That time is outside this professional's availability. Please pick another time." },
      { status: 409 }
    );
  }

  // The pro's scheduling controls: how far ahead they take bookings, and
  // days they've marked as time off.
  const [windows, offDays] = await Promise.all([
    getBookingWindows([professionalId]),
    getTimeOffDays([professionalId], date, date),
  ]);
  // A day of slack for the gap between the client's and the server's clocks.
  const todayKey = new Date().toISOString().slice(0, 10);
  const daysAhead = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000
  );
  if (daysAhead > (windows[professionalId] ?? 56)) {
    return NextResponse.json(
      { error: "This professional isn't taking bookings that far ahead yet. Please pick an earlier date." },
      { status: 409 }
    );
  }
  if (offDays.length > 0) {
    return NextResponse.json(
      { error: "This professional is off that day. Please pick another date." },
      { status: 409 }
    );
  }

  const { data: existingBookings, error: bookingsCheckError } = await serviceSupabase
    .from("bookings")
    .select("id, start_time, end_time, status")
    .eq("professional_id", professionalId)
    .eq("booking_date", date)
    .in("status", ["confirmed", "completion_requested", "completed"]);

  if (bookingsCheckError) {
    return NextResponse.json({ error: bookingsCheckError.message }, { status: 500 });
  }

  const startMinutes = timeToMinutes(normalizedStart);
  const endMinutes = timeToMinutes(normalizedEnd);

  const hasBookingConflict = (existingBookings || []).some((booking) => {
    const bookingStart = timeToMinutes(String(booking.start_time).slice(0, 5));
    const bookingEnd = timeToMinutes(String(booking.end_time).slice(0, 5));
    return startMinutes < bookingEnd && endMinutes > bookingStart;
  });

  if (hasBookingConflict) {
    return NextResponse.json(
      { error: "That professional already has a booking at this time." },
      { status: 409 }
    );
  }

  // Master pros pay a reduced commission; studio members pay only card
  // processing on their own clients, and their shop may take a cut.
  const studioPricing = await getStudioPricingForPro(serviceSupabase, professionalId);
  const { platformFeeCents, depositAmountCents, studioCutCents, professionalPayoutCents, remainingPayoutCents } =
    splitBookingPayment({
      amountCents,
      platformFeeCents: platformFeeCentsFor({
        amountCents,
        source: "direct_booking",
        inLiveStudio: studioPricing.inLiveStudio,
        profile: professional,
      }),
      depositPercent: DEPOSIT_PERCENT,
      studioCutPercent: studioPricing.cutPercent,
    });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: CURRENCY,
    automatic_payment_methods: { enabled: true },
    metadata: {
      flow_type: "direct_booking",
      professional_id: professionalId,
      customer_id: user.id,
      service_id: service.id,
      booking_date: date,
      start_time: normalizedStart,
      end_time: normalizedEnd,
      service_mode: mode,
      platform_fee_cents: String(platformFeeCents),
      studio_id: studioPricing.studioId || "",
      studio_cut_cents: String(studioCutCents),
      deposit_amount_cents: String(depositAmountCents),
      professional_payout_cents: String(professionalPayoutCents),
      remaining_payout_cents: String(remainingPayoutCents),
      // The price before any tip; /api/stripe/tip adds the tip on top.
      base_amount_cents: String(amountCents),
      tip_cents: "0",
    },
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amountCents,
    currency: CURRENCY,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { flowType, offerId } = body;

    if (flowType === "direct_booking") {
      return await handleDirectBookingIntent(req, body);
    }

    if (flowType !== "request_offer") {
      return NextResponse.json(
        { error: "Only request offer and direct booking payments are supported right now." },
        { status: 400 }
      );
    }

    if (!offerId) {
      return NextResponse.json({ error: "Missing offerId" }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const serviceSupabase = getServiceSupabase();

    const { data: offer, error: offerError } = await serviceSupabase
      .from("request_offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    const { data: requestRow, error: requestError } = await serviceSupabase
      .from("service_requests")
      .select("*")
      .eq("id", offer.request_id)
      .single();

    if (requestError || !requestRow) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (requestRow.client_id !== user.id) {
      return NextResponse.json({ error: "You do not own this request." }, { status: 403 });
    }

    if (requestRow.status !== "open") {
      return NextResponse.json({ error: "This request is no longer open." }, { status: 409 });
    }

    if (offer.status !== "pending" && offer.status !== "payment_pending") {
      return NextResponse.json({ error: "This offer is not available." }, { status: 409 });
    }

    const { data: existingRequestBooking } = await serviceSupabase
      .from("bookings")
      .select("id")
      .eq("request_id", requestRow.id)
      .in("status", ["confirmed", "completion_requested", "completed"])
      .maybeSingle();

    if (existingRequestBooking?.id) {
      return NextResponse.json(
        { error: "This request already has a confirmed booking." },
        { status: 409 }
      );
    }

    const verificationError = await checkProfessionalVerified(serviceSupabase, offer.professional_id);

    if (verificationError) {
      return NextResponse.json({ error: verificationError }, { status: 409 });
    }

    const capError = await checkMonthlyBookingCap(serviceSupabase, offer.professional_id);

    if (capError) {
      return NextResponse.json({ error: capError }, { status: 409 });
    }

    if (!offer.proposed_date || !offer.proposed_start_time || !offer.proposed_end_time) {
      return NextResponse.json(
        { error: "This offer needs a date, start time, and end time." },
        { status: 400 }
      );
    }

    const proposedStart = String(offer.proposed_start_time).slice(0, 5);
    const proposedEnd = String(offer.proposed_end_time).slice(0, 5);

    if (proposedEnd <= proposedStart) {
      return NextResponse.json(
        { error: "Offer end time must be later than start time." },
        { status: 400 }
      );
    }

    const amountCents = parsePriceToCents(offer.proposed_price);

    if (!amountCents) {
      return NextResponse.json(
        { error: "Offer price is missing or invalid." },
        { status: 400 }
      );
    }

    const { data: existingBookings, error: bookingsCheckError } =
      await serviceSupabase
        .from("bookings")
        .select("id, start_time, end_time, status")
        .eq("professional_id", offer.professional_id)
        .eq("booking_date", offer.proposed_date)
        .in("status", ["confirmed", "completion_requested", "completed"]);

    if (bookingsCheckError) {
      return NextResponse.json({ error: bookingsCheckError.message }, { status: 500 });
    }

    const proposedStartMinutes = timeToMinutes(proposedStart);
    const proposedEndMinutes = timeToMinutes(proposedEnd);

    const hasBookingConflict = (existingBookings || []).some((booking) => {
      const bookingStart = timeToMinutes(String(booking.start_time).slice(0, 5));
      const bookingEnd = timeToMinutes(String(booking.end_time).slice(0, 5));
      return proposedStartMinutes < bookingEnd && proposedEndMinutes > bookingStart;
    });

    if (hasBookingConflict) {
      return NextResponse.json(
        { error: "That professional already has a booking at this time." },
        { status: 409 }
      );
    }

    // Master pros pay a reduced commission.
    const { data: offerPro } = await serviceSupabase
      .from("profiles")
      .select("subscription_plan, subscription_status")
      .eq("id", offer.professional_id)
      .maybeSingle();
    // Request bookings are new clients LineUp found, so they pay the normal
    // commission even for studio members; the shop's cut still applies.
    const studioPricing = await getStudioPricingForPro(serviceSupabase, offer.professional_id);
    const { platformFeeCents, depositAmountCents, studioCutCents, professionalPayoutCents, remainingPayoutCents } =
      splitBookingPayment({
        amountCents,
        platformFeeCents: platformFeeCentsFor({
          amountCents,
          source: "request",
          inLiveStudio: studioPricing.inLiveStudio,
          profile: offerPro,
        }),
        depositPercent: DEPOSIT_PERCENT,
        studioCutPercent: studioPricing.cutPercent,
      });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: CURRENCY,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        flow_type: "request_offer",
        offer_id: offer.id,
        request_id: requestRow.id,
        customer_id: requestRow.client_id,
        professional_id: offer.professional_id,
        platform_fee_cents: String(platformFeeCents),
        studio_id: studioPricing.studioId || "",
        studio_cut_cents: String(studioCutCents),
        deposit_amount_cents: String(depositAmountCents),
        professional_payout_cents: String(professionalPayoutCents),
        remaining_payout_cents: String(remainingPayoutCents),
        // The price before any tip; /api/stripe/tip adds the tip on top.
        base_amount_cents: String(amountCents),
        tip_cents: "0",
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
      platformFeeCents,
      depositAmountCents,
      professionalPayoutCents,
      remainingPayoutCents,
      currency: CURRENCY,
    });
  } catch (error: any) {
    console.error("create-payment-intent failed:", error);

    return NextResponse.json(
      { error: error?.message || "Payment setup failed" },
      { status: 500 }
    );
  }
}
