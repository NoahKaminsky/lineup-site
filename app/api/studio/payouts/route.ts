import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { getSiteUrl } from "@/app/lib/siteUrl";

// POST /api/studio/payouts — owner only. Sets up (or reopens) the shop's own
// Stripe payout account, where its cut of members' bookings is sent. It's
// separate from the owner's personal payout account on purpose: the shop's
// money and the owner's own bookings shouldn't land in the same place.
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.isOwner) return NextResponse.json({ error: "Only the studio owner manages payouts." }, { status: 403 });

    const { studio } = ctx;
    const siteUrl = getSiteUrl();
    let accountId = studio.stripe_account_id;

    if (!accountId) {
      const { data: owner } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
      const account = await stripe.accounts.create({
        type: "express",
        country: "CA",
        email: owner?.email || user.email || undefined,
        capabilities: { transfers: { requested: true } },
        business_profile: { name: studio.name },
        metadata: { studio_id: studio.id, owner_id: user.id, platform: "lineup" },
      });
      accountId = account.id;
      const { error } = await supabase.from("studios").update({ stripe_account_id: accountId }).eq("id", studio.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const account = await stripe.accounts.retrieve(accountId);
    if (account.details_submitted) {
      const login = await stripe.accounts.createLoginLink(accountId);
      return NextResponse.json({ url: login.url });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/studio?payouts=refresh`,
      return_url: `${siteUrl}/studio?payouts=done`,
      type: "account_onboarding",
    });
    return NextResponse.json({ url: link.url });
  } catch (error) {
    console.error("POST /api/studio/payouts failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not open payouts.") }, { status: 500 });
  }
}
