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
      .select("id, email, role, stripe_account_id")
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

    if (profile.stripe_account_id) {
      return NextResponse.json({
        stripeAccountId: profile.stripe_account_id,
        reused: true,
      });
    }

    const account = await stripe.accounts.create({
      type: "express",
      country: "CA",
      email: profile.email || user.email || undefined,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        profile_id: profile.id,
        platform: "lineup",
      },
    });

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        stripe_account_id: account.id,
        stripe_onboarding_complete: false,
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
      })
      .eq("id", profile.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      stripeAccountId: account.id,
      reused: false,
    });
  } catch (error: any) {
    const errorMessage =
      error?.raw?.message ||
      error?.message ||
      "Could not create Stripe account.";

    console.error("Stripe Connect create-account failed:", errorMessage);

    return NextResponse.json(
      {
        error: errorMessage,
        stripeType: error?.type || null,
        stripeCode: error?.code || null,
        stripeRequestId: error?.requestId || null,
      },
      { status: error?.statusCode || 500 }
    );
  }
}
