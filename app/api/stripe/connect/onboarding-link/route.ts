import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, stripe_account_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.role !== "professional") {
      return NextResponse.json(
        { error: "Only professionals can connect Stripe payouts." },
        { status: 403 }
      );
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json(
        { error: "Stripe account has not been created yet." },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
      refresh_url: `${siteUrl}/account?stripe_refresh=true`,
      return_url: `${siteUrl}/account?stripe_return=true`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error: any) {
    const message =
      error?.raw?.message ||
      error?.message ||
      "Could not create Stripe onboarding link.";

    console.error("create Stripe onboarding link failed:", message);

    return NextResponse.json(
      { error: message },
      { status: error?.statusCode || 500 }
    );
  }
}
