import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { priceId, cancel } = await req.json().catch(() => ({}) as { priceId?: string; cancel?: boolean });

  const service = getServiceSupabase();

  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found." }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const returnUrl = `${siteUrl}/subscription`;

  let flowData: any = undefined;

  if (profile.stripe_subscription_id && cancel) {
    flowData = {
      type: "subscription_cancel",
      subscription_cancel: { subscription: profile.stripe_subscription_id },
      after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
    };
  } else if (profile.stripe_subscription_id && priceId) {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const itemId = subscription.items.data[0]?.id;

    if (itemId) {
      flowData = {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: profile.stripe_subscription_id,
          items: [{ id: itemId, price: priceId, quantity: 1 }],
        },
        after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
      };
    }
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: returnUrl,
    ...(flowData ? { flow_data: flowData } : {}),
  });

  return NextResponse.json({ url: session.url });
}
