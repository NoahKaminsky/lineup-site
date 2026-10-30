import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { BOOSTS, type BoostKind } from "@/app/lib/boosts";
import { errorMessage, getStudioForUser } from "@/app/lib/studios";
import { getSiteUrl } from "@/app/lib/siteUrl";

// POST /api/boosts { kind: "profile" | "chair_opening", targetId?, returnTo? }
// Starts a one-time Stripe Checkout for a week of paid placement. The boost
// itself is recorded by the webhook once payment succeeds (recordBoost).

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const kind: BoostKind | null = body?.kind === "profile" || body?.kind === "chair_opening" ? body.kind : null;
    if (!kind) return NextResponse.json({ error: "Unknown boost." }, { status: 400 });

    const supabase = getServiceSupabase();
    const { data: me } = await supabase
      .from("profiles")
      .select("id, role, email, stripe_customer_id, verification_status")
      .eq("id", user.id)
      .maybeSingle();
    if (me?.role !== "professional") return NextResponse.json({ error: "Boosts are for professionals." }, { status: 403 });

    let targetId = user.id;
    let name = "LineUp profile boost (7 days)";
    let returnPath = typeof body?.returnTo === "string" && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//") ? body.returnTo : "/subscription";

    if (kind === "profile") {
      if (me.verification_status !== "verified") {
        return NextResponse.json({ error: "Get verified first. Only verified pros show up in Browse." }, { status: 409 });
      }
    } else {
      const ctx = await getStudioForUser(supabase, user.id);
      const { data: opening } = await supabase
        .from("chair_openings")
        .select("id, studio_id, title, status")
        .eq("id", typeof body?.targetId === "string" ? body.targetId : "")
        .maybeSingle();
      if (!opening || !ctx?.canManage || opening.studio_id !== ctx.studio.id) {
        return NextResponse.json({ error: "Opening not found." }, { status: 404 });
      }
      if (opening.status !== "open") return NextResponse.json({ error: "Only open chairs can be featured." }, { status: 409 });
      targetId = opening.id;
      name = `Featured chair opening (7 days): ${opening.title}`;
      returnPath = "/studio?tab=chairs";
    }

    const siteUrl = getSiteUrl();
    const boost = BOOSTS[kind];
    const join = returnPath.includes("?") ? "&" : "?";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(me.stripe_customer_id ? { customer: me.stripe_customer_id } : { customer_email: me.email || user.email || undefined }),
      line_items: [
        { quantity: 1, price_data: { currency: "cad", unit_amount: boost.cents, product_data: { name } } },
      ],
      success_url: `${siteUrl}${returnPath}${join}boosted=1`,
      cancel_url: `${siteUrl}${returnPath}`,
      metadata: { boost_kind: kind, target_id: targetId, purchased_by: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("POST /api/boosts failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not start checkout.") }, { status: 500 });
  }
}
