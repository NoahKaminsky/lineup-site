import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicLayout from "@/app/components/site/PublicLayout";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { loadGiftSeller } from "@/app/lib/giftCardsServer";
import { GIFT_CARD_AMOUNTS_CENTS, GIFT_CARD_MAX_CENTS, GIFT_CARD_MIN_CENTS } from "@/app/lib/giftCards";
import GiftForm from "./GiftForm";

// Buy a gift card for one pro (/gift/pro/<username>) or one shop
// (/gift/shop/<slug>).

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ kind: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { kind, slug } = await params;
  const seller = await loadGiftSeller(getServiceSupabase(), kind, slug);
  if (!seller) return {};
  return {
    title: `Gift card for ${seller.name}`,
    description: `Send a LineUp gift card for ${seller.name}. Delivered by email, never expires.`,
    robots: { index: false, follow: true },
  };
}

export default async function GiftPage({ params }: Params) {
  const { kind, slug } = await params;
  const seller = await loadGiftSeller(getServiceSupabase(), kind, slug);
  if (!seller) notFound();

  return (
    <PublicLayout>
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="lu-rise-in text-xs font-medium text-neutral-500">Gift card</p>
          <h1 className="lu-rise-in mt-3 text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.045em]" style={{ animationDelay: "80ms" }}>
            Give a visit to {seller.name}.
          </h1>
          <p className="lu-rise-in mt-5 max-w-md text-base leading-7 text-neutral-600" style={{ animationDelay: "160ms" }}>
            We email the gift card with your note. They mention it when they book and show the code at their appointment, and it comes off what they owe.
          </p>

          {/* The card itself, as it will look. */}
          <div className="lu-rise-in mt-10 aspect-[1.6/1] max-w-sm rounded-[28px] bg-ink p-7 text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]" style={{ animationDelay: "240ms" }}>
            <div className="flex h-full flex-col justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">LineUp gift card</p>
              <div>
                <p className="text-2xl font-semibold tracking-[-0.03em]">{seller.name}</p>
                <p className="mt-1 text-sm text-white/60">Never expires. No fees.</p>
              </div>
            </div>
          </div>

          <ul className="mt-10 max-w-md space-y-2 text-sm leading-6 text-neutral-600">
            <li>Can only be used with {seller.name}{seller.kind === "shop" ? ", with any pro on their team" : ""}.</li>
            <li>Never expires, and there are no fees. Use it over more than one visit.</li>
            <li>
              They can{" "}
              <Link href="/gift/balance" className="underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
                check the balance
              </Link>{" "}
              any time.
            </li>
          </ul>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          {seller.ready ? (
            <GiftForm
              kind={seller.kind}
              slug={seller.slug}
              sellerName={seller.name}
              amounts={GIFT_CARD_AMOUNTS_CENTS}
              minCents={GIFT_CARD_MIN_CENTS}
              maxCents={GIFT_CARD_MAX_CENTS}
            />
          ) : (
            <div className="rounded-3xl bg-white p-8 ring-1 ring-ink/[0.07]">
              <p className="text-lg font-semibold">{seller.name} isn&apos;t selling gift cards yet.</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">They need to finish setting up payouts on LineUp first.</p>
              <Link href={seller.href} className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800">
                See {seller.kind === "shop" ? "the shop" : "their profile"}
              </Link>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
