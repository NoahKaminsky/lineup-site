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
      .select("id, role, stripe_account_id, stripe_payouts_enabled")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.role !== "professional") {
      return NextResponse.json(
        { error: "Only professionals can manage Stripe payouts." },
        { status: 403 }
      );
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json(
        { error: "Stripe account has not been created yet." },
        { status: 400 }
      );
    }

    if (!profile.stripe_payouts_enabled) {
      return NextResponse.json(
        { error: "Finish onboarding before managing your Stripe account." },
        { status: 400 }
      );
    }

    // Express Dashboard login link — lets an already-onboarded professional
    // actually edit bank details, view payout history, etc. Unlike an
    // account_onboarding link (which is only for collecting missing info the
    // first time), this opens Stripe's real account management surface.
    const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id);

    return NextResponse.json({ url: loginLink.url });
  } catch (error: any) {
    const message =
      error?.raw?.message ||
      error?.message ||
      "Could not open Stripe dashboard.";

    console.error("create Stripe dashboard link failed:", message);

    return NextResponse.json(
      { error: message },
      { status: error?.statusCode || 500 }
    );
  }
}
