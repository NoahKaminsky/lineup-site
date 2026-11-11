import { NextResponse } from "next/server";

// A quick "is this deployment wired for live or test payments?" check.
// It only reports modes and whether each setting is present, never a value,
// so it's safe to leave open: the publishable key already tells any visitor
// which mode the site is in.

export const dynamic = "force-dynamic";

function keyMode(key: string | undefined, livePrefix: string, testPrefix: string) {
  if (!key) return "missing";
  if (key.startsWith(livePrefix)) return "live";
  if (key.startsWith(testPrefix)) return "test";
  return "unrecognised";
}

export async function GET() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const secretMode =
    keyMode(secret, "sk_live_", "sk_test_") === "unrecognised"
      ? keyMode(secret, "rk_live_", "rk_test_")
      : keyMode(secret, "sk_live_", "sk_test_");
  const publishableMode = keyMode(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "pk_live_", "pk_test_");

  const priceIds = {
    apprentice: !!process.env.NEXT_PUBLIC_STRIPE_APPRENTICE_PRICE_ID,
    pro: !!process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    master: !!process.env.NEXT_PUBLIC_STRIPE_MASTER_PRICE_ID,
    studio: !!process.env.NEXT_PUBLIC_STRIPE_STUDIO_PRICE_ID,
    studioPlus: !!process.env.NEXT_PUBLIC_STRIPE_STUDIO_PLUS_PRICE_ID,
  };

  return NextResponse.json(
    {
      environment: process.env.VERCEL_ENV || "unknown",
      secretKey: secretMode,
      publishableKey: publishableMode,
      keysMatch: secretMode === publishableMode && secretMode !== "missing",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ? "set" : "missing",
      priceIds,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
