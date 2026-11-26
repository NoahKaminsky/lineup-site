"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { Armchair, CalendarDays, Contact, Crown, FileUp, Inbox, Lightbulb, LineChart, Receipt, Settings2, Store, Users, type LucideIcon } from "lucide-react";
import { useStudio } from "../StudioContext";
import PageTip from "@/app/components/guides/PageTip";
import { STUDIO_SECTION_TIPS } from "@/app/lib/guideContent";
import ScheduleView from "../Schedule";
import ProfileView from "../Profile";
import RequestsView from "../Requests";
import TeamView from "../Team";
import MembershipsView from "../Memberships";
import ChairsView from "../Chairs";
import ClientsView from "../Clients";
import ImportView from "../Import";
import SettingsView from "../Settings";
import ShopAnalyticsView from "@/app/components/analytics/ShopAnalytics";
import EarningsReport from "@/app/components/earnings/EarningsReport";

export default function StudioSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const { data, busy, run, setNotice, reload, redirectTo } = useStudio();
  const props = { data, busy, run, setNotice, reload };
  const me = data.me!;
  const view = sectionView();
  // First visit to a section: a short tip on what it's for (not on the
  // "only managers" notice, which isn't a page they can use).
  const tip = STUDIO_SECTION_TIPS[section];
  const usable = view && !(view.type === OnlyManagers);
  return (
    <>
      {tip && usable ? <PageTip {...tip} Icon={STUDIO_TIP_ICONS[section] || Lightbulb} /> : null}
      {view}
    </>
  );

  function sectionView() {
  switch (section) {
    case "profile":
      return me.canManage ? <ProfileView {...props} /> : <OnlyManagers />;
    case "calendar":
      return <ScheduleView {...props} />;
    case "requests":
      return <RequestsView />;
    case "team":
      return <TeamView {...props} />;
    case "clients":
      return me.canManage ? <ClientsView {...props} /> : <OnlyManagers />;
    case "import":
      return me.canManage ? <ImportView {...props} /> : <OnlyManagers />;
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
}

const STUDIO_TIP_ICONS: Record<string, LucideIcon> = {
  profile: Store,
  calendar: CalendarDays,
  requests: Inbox,
  team: Users,
  clients: Contact,
  import: FileUp,
  memberships: Crown,
  chairs: Armchair,
  analytics: LineChart,
  earnings: Receipt,
  settings: Settings2,
};

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
        Each pro&apos;s sales, the shop&apos;s cut, booth rent, memberships and gift cards. Walk-ins count once they&apos;re marked done.
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
        Which pros, services, chairs and hours make the shop money, and one thing to do about each. Money in and out is on Earnings.
      </p>
      <div className="mt-6">
        <ShopAnalyticsView />
      </div>
    </div>
  );
}
