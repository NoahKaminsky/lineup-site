"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useStudio } from "../StudioContext";
import ScheduleView from "../Schedule";
import RequestsView from "../Requests";
import TeamView from "../Team";
import MembershipsView from "../Memberships";
import ChairsView from "../Chairs";
import ClientsView from "../Clients";
import SettingsView from "../Settings";
import AnalyticsView from "@/app/components/analytics/AnalyticsView";
import EarningsReport from "@/app/components/earnings/EarningsReport";

export default function StudioSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const { data, busy, run, setNotice, reload, redirectTo } = useStudio();
  const props = { data, busy, run, setNotice, reload };
  const me = data.me!;

  switch (section) {
    case "calendar":
      return <ScheduleView {...props} />;
    case "requests":
      return <RequestsView />;
    case "team":
      return <TeamView {...props} />;
    case "clients":
      return me.canManage ? <ClientsView {...props} /> : <OnlyManagers />;
    case "memberships":
      return <MembershipsView {...props} />;
    case "chairs":
      return me.canManage ? <ChairsView {...props} /> : <OnlyManagers />;
    case "analytics":
      return me.canManage ? <ShopAnalytics /> : <OnlyManagers />;
    case "earnings":
      return me.canManage ? <ShopEarnings /> : <OnlyManagers />;
    case "settings":
      return me.isOwner ? <SettingsView {...props} redirectTo={redirectTo} /> : <OnlyManagers owner />;
    default:
      notFound();
  }
}

function OnlyManagers({ owner = false }: { owner?: boolean }) {
  return (
    <p className="py-10 text-center text-sm text-neutral-500">
      Only the shop&apos;s {owner ? "owner" : "owner and managers"} can open this.
    </p>
  );
}

function ShopEarnings() {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Earnings</h2>
      <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">
        Everything that came through the shop: each pro&apos;s sales, the shop&apos;s cut, booth rent, memberships and gift cards.
        Walk-ins and phone bookings count once they&apos;re marked done.
      </p>
      <div className="mt-6">
        <EarningsReport scope="shop" />
      </div>
    </div>
  );
}

function ShopAnalytics() {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Analytics</h2>
      <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">
        How the shop is doing and what to do about it: every pro side by side, clients due back, and the hours that sit empty.
      </p>
      <div className="mt-6">
        <AnalyticsView scope="shop" />
      </div>
    </div>
  );
}
