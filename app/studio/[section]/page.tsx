"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useStudio } from "../StudioContext";
import ScheduleView from "../Schedule";
import RequestsView from "../Requests";
import TeamView from "../Team";
import MembershipsView from "../Memberships";
import ChairsView from "../Chairs";
import SettingsView from "../Settings";

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
    case "memberships":
      return <MembershipsView {...props} />;
    case "chairs":
      return me.canManage ? <ChairsView {...props} /> : <OnlyManagers />;
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
