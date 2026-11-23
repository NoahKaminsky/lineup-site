// One plain, rule-based suggestion per Analytics section, with an action
// where there is one. Every rule lives here (and in tests/analytics), so the
// wording and thresholds can be changed in one place.

export type Action =
  | { kind: "nudge_all" }
  | { kind: "link"; href: string }
  | { kind: "set_goal" };

export type Suggestion = { section: Section; text: string; action?: { label: string; do: Action } };
export type Section = "overview" | "forecast" | "clients" | "calendar" | "sources" | "requests" | "profile" | "boosts" | "prices" | "goals";

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const cad = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;
const hourName = (h: number) => (h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h}am` : `${h - 12}pm`);

export type InsightInput = {
  overview?: { revenueChange: number | null; bookingsChange: number | null; avgTicketChange: number | null; rebook: number | null };
  forecast?: { confirmed: number; expected: number; emptyDays: number };
  clients?: { atRiskNudgeable: number; atRiskValue: number; atRisk: number; alreadyNudged?: number };
  calendar?: { emptiest: { dow: number; hour: number; open: number; booked: number } | null; freeHours: number; openValue: number; noShows: number; lateCancels: number };
  sources?: { top: { key: string; label: string; share: number } | null; linkShare: number | null; tracked: boolean };
  requests?: { offers: number; winRate: number | null; medianMinutes: number | null; fastWinRate: number | null; slowWinRate: number | null; missed: number };
  profile?: { views: number; visits: number; saves: number; bookings: number };
  boosts?: { spent: number; revenue: number; count: number };
  prices?: { below: string | null; above: string | null; enough: boolean };
  goals?: { set: boolean; onTrack: boolean; neededPerDay: number; kind: "revenue" | "bookings"; daysLeft: number };
};

export function suggestions(i: InsightInput): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (s: Suggestion | null) => s && out.push(s);
  add(overviewRule(i.overview));
  add(forecastRule(i.forecast));
  add(clientsRule(i.clients));
  add(calendarRule(i.calendar));
  add(sourcesRule(i.sources));
  add(requestsRule(i.requests));
  add(profileRule(i.profile));
  add(boostsRule(i.boosts));
  add(pricesRule(i.prices));
  add(goalsRule(i.goals));
  return out;
}

export function overviewRule(o: InsightInput["overview"]): Suggestion | null {
  if (!o) return null;
  if (o.revenueChange !== null && o.revenueChange <= -10) {
    const why = o.bookingsChange !== null && o.bookingsChange <= -10 ? "fewer bookings" : o.avgTicketChange !== null && o.avgTicketChange <= -10 ? "a lower average ticket" : "a mix of both";
    return { section: "overview", text: `Revenue is down ${Math.abs(o.revenueChange)}%, mostly from ${why}. Your overdue clients are the quickest way back.`, action: { label: "See who's overdue", do: { kind: "link", href: "#clients" } } };
  }
  if (o.revenueChange !== null && o.revenueChange >= 10) {
    return { section: "overview", text: `Revenue is up ${o.revenueChange}% on the comparison period. Keep your calendar open ahead so the growth has room.` , action: { label: "Open your hours", do: { kind: "link", href: "/calendar" } } };
  }
  if (o.rebook !== null && o.rebook < 40) {
    return { section: "overview", text: `${o.rebook}% of clients have rebooked. Offering a regular appointment at checkout books the next visit for them.`, action: { label: "Set up regulars", do: { kind: "link", href: "/calendar" } } };
  }
  return null;
}

export function forecastRule(f: InsightInput["forecast"]): Suggestion | null {
  if (!f) return null;
  if (f.emptyDays >= 3) {
    return { section: "forecast", text: `${f.emptyDays} of your working days in the next two weeks have nothing booked yet. A nudge to overdue regulars fills those first.`, action: { label: "See who's overdue", do: { kind: "link", href: "#clients" } } };
  }
  if (f.expected > f.confirmed && f.expected > 0) {
    return { section: "forecast", text: `${cad(f.expected)} more is likely from regulars who haven't booked yet. Reminding them turns expected into confirmed.` };
  }
  return null;
}

export function clientsRule(c: InsightInput["clients"]): Suggestion | null {
  if (!c || c.atRisk === 0) return null;
  const n = c.atRiskNudgeable;
  if (n > 0) {
    return {
      section: "clients",
      text: `${c.atRisk} regular${c.atRisk === 1 ? " is" : "s are"} overdue, worth about ${cad(c.atRiskValue)} in visits. ${n === c.atRisk ? "Send them a nudge." : `${n} of them booked on LineUp and can get a nudge; call or text the others.`}`,
      action: { label: n === 1 ? "Send a nudge" : `Nudge all ${n}`, do: { kind: "nudge_all" } },
    };
  }
  if (c.alreadyNudged) {
    const rest = c.atRisk - c.alreadyNudged;
    return { section: "clients", text: `${c.alreadyNudged} overdue regular${c.alreadyNudged === 1 ? " has" : "s have"} had a nudge in the last 30 days.${rest > 0 ? ` The other ${rest} booked outside LineUp, so give them a call or a text.` : ""}` };
  }
  return { section: "clients", text: `${c.atRisk} regular${c.atRisk === 1 ? " is" : "s are"} overdue. They booked outside LineUp, so give them a call or a text.` };
}

export function calendarRule(c: InsightInput["calendar"]): Suggestion | null {
  if (!c) return null;
  if (c.noShows + c.lateCancels >= 3) {
    return { section: "calendar", text: `${c.noShows} no-show${c.noShows === 1 ? "" : "s"} and ${c.lateCancels} late cancellation${c.lateCancels === 1 ? "" : "s"} this period. A no-show fee makes people show up or cancel early.`, action: { label: "Set a no-show fee", do: { kind: "link", href: "/services" } } };
  }
  if (c.emptiest && c.emptiest.open >= 120 && c.emptiest.booked / c.emptiest.open < 0.25) {
    const e = c.emptiest;
    return { section: "calendar", text: `${DAYS[e.dow]} around ${hourName(e.hour)} are usually empty. Boost those hours to fill them.`, action: { label: "Boost those hours", do: { kind: "link", href: "/boosts" } } };
  }
  if (c.freeHours >= 5 && c.openValue > 0) {
    return { section: "calendar", text: `${c.freeHours} open hours this month are worth about ${cad(c.openValue)} at your hourly rate.`, action: { label: "Boost your profile", do: { kind: "link", href: "/boosts" } } };
  }
  return null;
}

export function sourcesRule(s: InsightInput["sources"]): Suggestion | null {
  if (!s || !s.tracked) return null;
  if (s.linkShare !== null && s.linkShare < 20) {
    return { section: "sources", text: `Only ${s.linkShare}% of bookings come through your own link. Put it in your Instagram bio so clients book you directly.`, action: { label: "Copy your link", do: { kind: "link", href: "/account#booking-link" } } };
  }
  if (s.top && s.top.share >= 50) {
    return { section: "sources", text: `${s.top.share}% of your revenue comes from ${s.top.label.toLowerCase()}. It's working, so keep it up, but a second source protects you if it slows.` };
  }
  return null;
}

export function requestsRule(r: InsightInput["requests"]): Suggestion | null {
  if (!r) return null;
  if (r.fastWinRate !== null && r.slowWinRate !== null && r.fastWinRate - r.slowWinRate >= 15) {
    return { section: "requests", text: `You win ${r.fastWinRate}% of requests you answer within an hour, against ${r.slowWinRate}% when you're slower. Turn on request notifications.`, action: { label: "See open requests", do: { kind: "link", href: "/work" } } };
  }
  if (r.missed >= 3) {
    return { section: "requests", text: `${r.missed} requests near you in your trade went unanswered. Each one is a client looking right now.`, action: { label: "See open requests", do: { kind: "link", href: "/work" } } };
  }
  return null;
}

export function profileRule(p: InsightInput["profile"]): Suggestion | null {
  if (!p) return null;
  if (p.views >= 50 && p.visits / p.views < 0.05) {
    return { section: "profile", text: `People see you in Discover but few open your profile. A sharper first photo makes the difference.`, action: { label: "Update your photos", do: { kind: "link", href: "/account#portfolio" } } };
  }
  if (p.visits >= 20 && p.bookings / p.visits < 0.1) {
    return { section: "profile", text: `${p.visits} profile visits turned into ${p.bookings} booking${p.bookings === 1 ? "" : "s"}. Clear prices and open times this week help visitors book.`, action: { label: "Check your services", do: { kind: "link", href: "/services" } } };
  }
  return null;
}

export function boostsRule(b: InsightInput["boosts"]): Suggestion | null {
  if (!b || b.count === 0) return null;
  if (b.revenue >= b.spent * 3) {
    return { section: "boosts", text: `Your boosts brought in ${cad(b.revenue)} for ${cad(b.spent)}. They pay off for you, so boost your quiet days.`, action: { label: "Boost again", do: { kind: "link", href: "/boosts" } } };
  }
  if (b.revenue < b.spent) {
    return { section: "boosts", text: `Boosts cost ${cad(b.spent)} and led to ${cad(b.revenue)} so far. Try boosting the hours that are usually empty instead.` };
  }
  return null;
}

export function pricesRule(p: InsightInput["prices"]): Suggestion | null {
  if (!p || !p.enough) return null;
  if (p.below) return { section: "prices", text: `Your ${p.below} is priced well under the local median. There's room to raise it.`, action: { label: "Edit prices", do: { kind: "link", href: "/services" } } };
  if (p.above) return { section: "prices", text: `Your ${p.above} is above the local median. That's fine if your reviews back it up; mention what makes it worth it.` };
  return null;
}

export function goalsRule(g: InsightInput["goals"]): Suggestion | null {
  if (!g) return null;
  if (!g.set) return { section: "goals", text: "Set a monthly goal and see each day whether you're on track.", action: { label: "Set a goal", do: { kind: "set_goal" } } };
  if (!g.onTrack && g.daysLeft > 0) {
    const need = g.kind === "revenue" ? `${cad(g.neededPerDay)} a day` : `${g.neededPerDay} booking${g.neededPerDay === 1 ? "" : "s"} a day`;
    return { section: "goals", text: `You need about ${need} for the rest of the month to hit your goal. Your overdue regulars are the fastest way there.`, action: { label: "See who's overdue", do: { kind: "link", href: "#clients" } } };
  }
  return null;
}

// ── Shop Analytics: one suggestion per section ──────────────────────────

export type ShopSection = "shop_overview" | "team" | "chairs" | "channels" | "shop_clients" | "memberships" | "rent" | "shop_forecast" | "local";
export type ShopSuggestion = { section: ShopSection; text: string; action?: { label: string; do: Action } };

export type ShopInsightInput = {
  overview?: { revenueChange: number | null; ownIncome: number; ownIncomePrev: number };
  team?: { flags: string[]; pros: number };
  chairs?: { worst: { name: string; dow: number; emptyPercent: number } | null; emptyHours: number };
  channels?: { walkInShare: number | null; onlineShare: number | null };
  clients?: { leaving: number; leavingValue: number; sharedPercent: number | null };
  memberships?: { active: number; idle: number; cancelRate: number | null };
  rent?: { late: { name: string; cents: number }[] };
  forecast?: { confirmed: number; expected: number };
  local?: { enough: boolean; ticketVs: number | null; rebookVs: number | null };
};

export function shopSuggestions(i: ShopInsightInput): ShopSuggestion[] {
  const out: ShopSuggestion[] = [];
  const o = i.overview;
  if (o && o.revenueChange !== null && o.revenueChange <= -10) out.push({ section: "shop_overview", text: `The shop's revenue is down ${Math.abs(o.revenueChange)}% on the comparison period. The clients about to leave the shop are the quickest win.`, action: { label: "See who's leaving", do: { kind: "link", href: "#shop_clients" } } });
  else if (o && o.revenueChange !== null && o.revenueChange >= 10) out.push({ section: "shop_overview", text: `The shop's revenue is up ${o.revenueChange}%. Make sure every pro's hours are open far enough ahead to keep it going.` });

  if (i.team?.flags.length) out.push({ section: "team", text: `${i.team.flags[0]} Worth a chat this week.` });
  else if (i.team && i.team.pros === 1) out.push({ section: "team", text: "With one pro, the team view fills in once you add more. Post a chair opening when you're ready to grow.", action: { label: "Post a chair opening", do: { kind: "link", href: "/studio/chairs" } } });

  const c = i.chairs;
  if (c?.worst && c.worst.emptyPercent >= 50) out.push({ section: "chairs", text: `${c.worst.name}'s chair is empty ${c.worst.emptyPercent}% of ${DAYS[c.worst.dow]}. Post a chair opening or send walk-ins their way.`, action: { label: "Post a chair opening", do: { kind: "link", href: "/studio/chairs" } } });
  else if (c && c.emptyHours >= 40) out.push({ section: "chairs", text: `Chairs sat empty for ${c.emptyHours} open hours this period. A boost on your quiet days fills them.`, action: { label: "Boost the shop", do: { kind: "link", href: "/boosts" } } });

  const ch = i.channels;
  if (ch?.walkInShare !== null && ch?.walkInShare !== undefined && ch.walkInShare >= 40) out.push({ section: "channels", text: `${ch.walkInShare}% of visits are walk-ins. Take a phone number at checkout so they count as clients and can be brought back.` });
  else if (ch?.onlineShare !== null && ch?.onlineShare !== undefined && ch.onlineShare < 25) out.push({ section: "channels", text: `Only ${ch.onlineShare}% of visits are booked online. Share the shop's booking page so clients can book any time.`, action: { label: "Open the shop page", do: { kind: "link", href: "/studio/settings" } } });

  const cl = i.clients;
  if (cl && cl.leaving > 0) out.push({ section: "shop_clients", text: `${cl.leaving} regular${cl.leaving === 1 ? " is" : "s are"} overdue with every pro at the shop, worth about ${cad(cl.leavingValue)} a visit. Reach out before they settle somewhere else.` });

  const m = i.memberships;
  if (m && m.idle > 0) out.push({ section: "memberships", text: `${m.idle} member${m.idle === 1 ? " hasn't" : "s haven't"} visited in 30 days. Members who don't use it tend to cancel, so invite them in.` });
  else if (m && m.cancelRate !== null && m.cancelRate >= 15) out.push({ section: "memberships", text: `${m.cancelRate}% of memberships were cancelled this period. Check whether the plans match how often people really come in.`, action: { label: "Review plans", do: { kind: "link", href: "/studio/memberships" } } });

  if (i.rent?.late.length) {
    const l = i.rent.late;
    out.push({ section: "rent", text: `${l.length === 1 ? `${l[0].name}'s` : `${l.length} pros'`} booth rent is late, ${cad(l.reduce((s, x) => s + x.cents, 0))} in all.`, action: { label: "Open the team", do: { kind: "link", href: "/studio/team" } } });
  }

  const f = i.forecast;
  if (f && f.expected > f.confirmed && f.expected > 0) out.push({ section: "shop_forecast", text: `${cad(f.expected)} more is likely from regulars who haven't booked yet. A reminder turns that into confirmed bookings.` });

  const lo = i.local;
  if (lo?.enough && lo.ticketVs !== null && lo.ticketVs <= -15) out.push({ section: "local", text: `The shop's average ticket is ${Math.abs(lo.ticketVs)}% under the local median. There may be room on price.`, action: { label: "Review services", do: { kind: "link", href: "/services" } } });
  else if (lo?.enough && lo.rebookVs !== null && lo.rebookVs <= -10) out.push({ section: "local", text: `Clients rebook ${Math.abs(lo.rebookVs)} points less often than at other local shops. Offer a regular appointment at checkout.` });
  return out;
}
