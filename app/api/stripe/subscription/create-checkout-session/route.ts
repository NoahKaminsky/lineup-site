import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

export async function POST(req: Request) {
  const { priceId } = await req.json();

  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!priceId) {
    return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
  }

  const service = getServiceSupabase();

  const { data: profile } = await service
    .from("profiles")
    .select("role, stripe_customer_id, email, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const normalizedRole = String(profile.role || "").toLowerCase().trim();
  const isProfessional = !!normalizedRole && !normalizedRole.includes("customer");

  if (!isProfessional) {
    return NextResponse.json(
      { error: "Subscriptions are for professionals only." },
      { status: 403 }
    );
  }

  let customerId: string = profile.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email || user.email,
      name: profile.full_name || undefined,
      metadata: { supabase_user_id: user.id },
    });

    customerId = customer.id;

    await service
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const trialDaysByPriceId: Record<string, number> = {
    [process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || ""]: 7,
    [process.env.NEXT_PUBLIC_STRIPE_MASTER_PRICE_ID || ""]: 5,
  };

  const trialDays = trialDaysByPriceId[priceId];

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/subscription?success=true`,
    cancel_url: `${siteUrl}/subscription`,
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      metadata: { supabase_user_id: user.id },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
