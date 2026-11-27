import { NextResponse } from "next/server";
import { requireAdmin, getServiceSupabase } from "@/app/lib/serverSupabase";
import { syncStudioMemberPlans } from "@/app/lib/studios";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // Strip characters that mean something in a PostgREST filter (commas,
  // parentheses, quotes, wildcards) so a search can't rewrite the query.
  const q = (searchParams.get("q") || "").replace(/[,()*%\\"]/g, " ").trim().slice(0, 100);

  const service = getServiceSupabase();

  let query = service
    .from("profiles")
    .select("id, full_name, email, role, subscription_status, subscription_plan, is_admin, is_featured, is_founding_artist, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Shops these people own, so a shop's plan can be set from here too.
  const ids = (data || []).map((u) => u.id);
  const { data: shops } = ids.length
    ? await service.from("studios").select("id, owner_id, name, plan, subscription_status, stripe_subscription_id").in("owner_id", ids)
    : { data: [] };
  const shopByOwner = new Map((shops || []).map((s) => [s.owner_id, s]));

  return NextResponse.json({
    users: (data || []).map((u) => {
      const shop = shopByOwner.get(u.id);
      return {
        ...u,
        shop: shop
          ? {
              id: shop.id,
              name: shop.name,
              plan: shop.plan,
              status: shop.subscription_status,
              // Paying through Stripe: their billing decides the plan, not admin.
              paid: !!shop.stripe_subscription_id,
            }
          : null,
      };
    }),
  });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId, subscriptionPlan, subscriptionStatus, isFeatured, isFoundingArtist, shopPlan } = await req.json();

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const service = getServiceSupabase();

  // A shop's plan, given free by admin (no Stripe billing): "" takes it away,
  // "studio" / "studio_plus" turn it on. The whole team's plans follow.
  if (shopPlan !== undefined) {
    if (!["", "studio", "studio_plus"].includes(shopPlan)) {
      return NextResponse.json({ error: "Invalid shop plan" }, { status: 400 });
    }
    const { data: shop } = await service
      .from("studios")
      .select("id, stripe_subscription_id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (!shop) return NextResponse.json({ error: "This person doesn't own a shop." }, { status: 404 });
    if (shop.stripe_subscription_id) {
      return NextResponse.json(
        { error: "This shop pays through Stripe. Change or cancel its plan in Stripe instead." },
        { status: 409 }
      );
    }
    const { error } = await service
      .from("studios")
      .update({ plan: shopPlan || null, subscription_status: shopPlan ? "active" : null, subscription_current_period_end: null })
      .eq("id", shop.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await syncStudioMemberPlans(service, shop.id);
    console.log(`Admin ${admin.id} set shop ${shop.id} plan to ${shopPlan || "none"}`);
    return NextResponse.json({ ok: true });
  }

  // Featured toggle can be updated on its own, without touching plan/status.
  if (isFeatured !== undefined && subscriptionPlan === undefined && subscriptionStatus === undefined && isFoundingArtist === undefined) {
    const { error } = await service
      .from("profiles")
      .update({ is_featured: !!isFeatured })
      .eq("id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Founding Artist toggle can also be updated on its own.
  if (isFoundingArtist !== undefined && subscriptionPlan === undefined && subscriptionStatus === undefined && isFeatured === undefined) {
    const { error } = await service
      .from("profiles")
      .update({ is_founding_artist: !!isFoundingArtist })
      .eq("id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const validPlans = [null, "apprentice", "pro", "master"];
  const validStatuses = [null, "active", "trialing", "past_due", "canceled", "incomplete"];

  if (!validPlans.includes(subscriptionPlan ?? null)) {
    return NextResponse.json({ error: "Invalid subscription plan" }, { status: 400 });
  }

  if (!validStatuses.includes(subscriptionStatus ?? null)) {
    return NextResponse.json({ error: "Invalid subscription status" }, { status: 400 });
  }

  const isSubscribed =
    !!subscriptionPlan &&
    (subscriptionStatus === "active" || subscriptionStatus === "trialing");

  const { error } = await service
    .from("profiles")
    .update({
      subscription_plan: subscriptionPlan ?? null,
      subscription_status: subscriptionStatus ?? null,
      // Instant-booking calendar is meant to just work on any paid tier,
      // not require finding a settings toggle.
      ...(isSubscribed
        ? { direct_booking_enabled: true, public_availability_enabled: true }
        : { direct_booking_enabled: false, public_availability_enabled: false }),
    })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
