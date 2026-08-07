import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

export async function GET(req: Request) {
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
        { error: "Only professionals can have Stripe payout status." },
        { status: 403 }
      );
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({
        stripeAccountId: null,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    const onboardingComplete =
      Boolean(account.details_submitted) &&
      Boolean(account.charges_enabled) &&
      Boolean(account.payouts_enabled);

    const requirementsDue = Array.from(
      new Set([
        ...(account.requirements?.currently_due || []),
        ...(account.requirements?.past_due || []),
      ])
    );

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        stripe_onboarding_complete: onboardingComplete,
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
      })
      .eq("id", profile.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      stripeAccountId: account.id,
      onboardingComplete,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      requirementsDue,
      disabledReason: account.requirements?.disabled_reason || null,
    });
  } catch (error: any) {
    console.error("Stripe account status check failed:", error);
    return NextResponse.json(
      { error: error?.message || "Could not check Stripe account status." },
      { status: 500 }
    );
  }
}
