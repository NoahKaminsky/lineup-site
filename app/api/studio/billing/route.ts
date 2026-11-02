import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { studioPriceIdFor, type StudioPlan } from "@/app/lib/plans";
import { getStudioForUser, isStudioLive, errorMessage } from "@/app/lib/studios";
import { getSiteUrl } from "@/app/lib/siteUrl";

// POST /api/studio/billing { action: "checkout", plan } | { action: "portal" }
// Owner only. The studio has its own Stripe customer and subscription,
// separate from the owner's personal one; the webhook finds it by
// metadata.studio_id.
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.isOwner) return NextResponse.json({ error: "Only the studio owner manages billing." }, { status: 403 });

    const { studio } = ctx;
    const body = await req.json().catch(() => ({}));
    const siteUrl = getSiteUrl();

    if (body?.action === "portal") {
      if (!studio.stripe_customer_id) {
        return NextResponse.json({ error: "There's no billing set up for this studio yet." }, { status: 400 });
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: studio.stripe_customer_id,
        return_url: `${siteUrl}/studio`,
      });
      return NextResponse.json({ url: portal.url });
    }

    if (body?.action !== "checkout") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

    const plan: StudioPlan = body?.plan === "studio_plus" ? "studio_plus" : "studio";
    const priceId = studioPriceIdFor(plan);
    if (!priceId) {
      return NextResponse.json({ error: "Studio plans aren't set up in Stripe yet." }, { status: 503 });
    }

    // Already subscribed: plan changes go through the billing portal so
    // Stripe handles proration.
    if (isStudioLive(studio) && studio.stripe_customer_id) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: studio.stripe_customer_id,
        return_url: `${siteUrl}/studio`,
      });
      return NextResponse.json({ url: portal.url });
    }

    let customerId = studio.stripe_customer_id;
    if (!customerId) {
      const { data: owner } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
      const customer = await stripe.customers.create({
        email: owner?.email || user.email || undefined,
        name: studio.name,
        metadata: { studio_id: studio.id, owner_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("studios").update({ stripe_customer_id: customerId }).eq("id", studio.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/studio?subscribed=1`,
      cancel_url: `${siteUrl}/studio`,
      metadata: { studio_id: studio.id },
      subscription_data: { metadata: { studio_id: studio.id } },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("POST /api/studio/billing failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Billing failed.") }, { status: 500 });
  }
}
