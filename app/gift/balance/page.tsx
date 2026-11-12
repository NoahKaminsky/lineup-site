import type { Metadata } from "next";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import BalanceCheck from "./BalanceCheck";

export const metadata: Metadata = {
  title: "Check a gift card balance",
  description: "See what's left on a LineUp gift card.",
};

export default async function GiftBalancePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = (await searchParams).code || "";
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Gift card"
        title="Check your balance."
        subtitle="Enter the code from your gift card email. LineUp gift cards never expire and have no fees."
      />
      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <BalanceCheck initialCode={code} />
      </div>
    </PublicLayout>
  );
}
