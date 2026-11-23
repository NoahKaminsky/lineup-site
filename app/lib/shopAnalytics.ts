// A shop's Analytics, one section at a time, for the owner and managers.
// Calculations live in ./shopAnalyticsMetrics and ./analyticsMetrics, the
// suggestions in ./analyticsInsights, alerts in ./analyticsAlerts. Revenue
// per visit comes from the same rows as Earnings; the shop's own income
// (its cut, booth rent, memberships) comes straight from shopEarnings.

import { createClient } from "@supabase/supabase-js";
import { shopEarnings as shopEarningsFresh } from "./earnings";
import { boothRentStatus, summarize } from "./earningsCore";
import { getServiceSupabase } from "./serverSupabase";
import type { StudioRow } from "./studios";
import { addDays, change, forecast, overview, rebookRate, retentionCohorts, revenueSeries, type Period } from "./analyticsMetrics";
import { chairFunnel, chairs, channels, leavingShop, localShopCompare, membershipStats, proStats, sharedClients, teamFlags, type ProInput, type ShopVisit } from "./shopAnalyticsMetrics";
import { shopSuggestions, type ShopSuggestion } from "./analyticsInsights";
import { loadVisitsBy, offDaysIn, openHours, sharedLoad, standingFor } from "./proAnalytics";
import { alertsFor, newAlerts, type Alert } from "./analyticsAlerts";

type DB = ReturnType<typeof getServiceSupabase>;
// Shared between the sections loading at the same time (it reads Stripe).
const shopEarnings = (db: DB, studio: StudioRow, from: string, to: string) => sharedLoad(`earnings:${studio.id}:${from}:${to}`, () => shopEarningsFresh(db, studio, from, to));

export const SHOP_SECTIONS = ["overview", "team", "chairs", "channels", "clients", "memberships", "rent", "forecast", "local"] as const;
export type ShopSectionName = (typeof SHOP_SECTIONS)[number];

export type ShopCtx = { db: DB; studio: StudioRow; userId: string; today: string; period: Period; compare: Period; service: string | null; accessToken: string | null };

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const pick = (list: ShopSuggestion[]) => list[0] || null;
const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" });
const filterService = <T extends { service: string }>(v: T[], s: string | null) => (s ? v.filter((x) => x.service.toLowerCase() === s.toLowerCase()) : v);

function team(db: DB, studio: StudioRow) {
  return sharedLoad(`team:${studio.id}`, () => teamFresh(db, studio));
}
async function teamFresh(db: DB, studio: StudioRow) {
  const { data: members } = await db.from("studio_members").select("*").eq("studio_id", studio.id).eq("status", "active");
  const ids = (members || []).map((m) => m.profile_id as string).filter(Boolean);
  const { data: people } = ids.length ? await db.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((people || []).map((p) => [p.id as string, (p.full_name as string) || "Team member"]));
  return { members: members || [], ids, name: (id: string) => name.get(id) || "Team member" };
}

export async function shopSection(name: ShopSectionName, c: ShopCtx): Promise<Record<string, unknown> & { suggestion: ShopSuggestion | null }> {
  switch (name) {
    case "overview": {
      const [visits, now, prev] = await Promise.all([
        loadVisitsBy(c.db, "studio_id", c.studio.id, c.today),
        shopEarnings(c.db, c.studio, c.period.from, c.period.to),
        shopEarnings(c.db, c.studio, c.compare.from, c.compare.to),
      ]);
      const v = filterService(visits, c.service);
      const o = overview(v, c.period, c.compare, c.today);
      const own = (rows: typeof now.rows) => {
        const s = summarize(rows, "shop");
        return { commission: s.shopCommission, boothRent: s.boothRent, memberships: s.memberships, total: s.shopCommission + s.boothRent + s.memberships };
      };
      const ownNow = own(now.rows);
      const ownPrev = own(prev.rows);
      const t = await team(c.db, c.studio);
      return {
        ...o,
        own: ownNow,
        ownPrev,
        series: revenueSeries(v, c.period, c.compare),
        services: [...new Set(visits.filter((x) => !x.imported && x.state !== "cancelled").map((x) => x.service))].sort(),
        pros: t.ids.length,
        empty: !visits.some((x) => x.state === "done" || x.state === "upcoming"),
        suggestion: pick(shopSuggestions({ overview: { revenueChange: change(o.revenue), ownIncome: ownNow.total, ownIncomePrev: ownPrev.total } })),
      };
    }

    case "team":
    case "chairs": {
      const [visits, t] = await Promise.all([loadVisitsBy(c.db, "studio_id", c.studio.id, c.today), team(c.db, c.studio)]);
      const sinceIso = new Date(`${c.compare.from < c.period.from ? c.compare.from : c.period.from}T05:00:00Z`).toISOString();
      const [hours, reviews, offers] = await Promise.all([
        Promise.all(t.ids.map((id) => openHours(c.db, id))),
        t.ids.length ? c.db.from("professional_reviews").select("professional_id, rating").in("professional_id", t.ids) : Promise.resolve({ data: [] }),
        t.ids.length ? c.db.from("request_offers").select("professional_id, status, created_at").in("professional_id", t.ids).gte("created_at", sinceIso) : Promise.resolve({ data: [] }),
      ]);
      const prosFor = (p: Period): ProInput[] =>
        t.ids.map((id, i) => {
          const r = (reviews.data || []).filter((x) => x.professional_id === id);
          const o = (offers.data || []).filter((x) => x.professional_id === id && localDay(x.created_at as string) >= p.from && localDay(x.created_at as string) <= p.to);
          return {
            id,
            name: t.name(id),
            open: hours[i].open,
            offDays: offDaysIn(hours[i].off, p),
            rating: r.length ? Math.round((sum(r, (x) => Number(x.rating)) / r.length) * 10) / 10 : null,
            offers: { sent: o.length, won: o.filter((x) => x.status === "accepted").length },
          };
        });
      const v = filterService(visits as ShopVisit[], c.service);
      const now = prosFor(c.period).map((p) => proStats(v, p, c.period, c.today));
      if (name === "team") {
        const prev = prosFor(c.compare).map((p) => proStats(v, p, c.compare, c.today));
        const flags = teamFlags(now, prev, "against the comparison period");
        return { team: now, prev, flags, suggestion: pick(shopSuggestions({ team: { flags: flags.map((f) => f.text), pros: now.length } })) };
      }
      const list = chairs(now, v, prosFor(c.period), c.period);
      const { data: openings } = await c.db.from("chair_openings").select("id, created_at").eq("studio_id", c.studio.id);
      const openingIds = (openings || []).map((o) => o.id as string);
      const [{ count: views }, { data: apps }] = openingIds.length
        ? await Promise.all([
            c.db.from("chair_opening_views").select("opening_id", { count: "exact", head: true }).in("opening_id", openingIds),
            c.db.from("chair_applications").select("status").in("opening_id", openingIds),
          ])
        : [{ count: 0 }, { data: [] }];
      const worst = list.filter((x) => x.emptiestDay).sort((a, b) => (b.emptiestDay!.emptyPercent - a.emptiestDay!.emptyPercent))[0];
      return {
        chairs: list,
        funnel: chairFunnel((openings || []) as { id: string; created_at: string }[], views || 0, (apps || []) as { status: string }[]),
        suggestion: pick(shopSuggestions({ chairs: { worst: worst ? { name: worst.name.split(" ")[0], ...worst.emptiestDay! } : null, emptyHours: sum(list, (x) => x.emptyHours) } })),
      };
    }

    case "channels": {
      const v = filterService((await loadVisitsBy(c.db, "studio_id", c.studio.id, c.today)) as ShopVisit[], c.service);
      const list = channels(v, c.period);
      const total = sum(list, (x) => x.count);
      const share = (k: string) => (total ? Math.round(((list.find((x) => x.key === k)?.count || 0) / total) * 100) : null);
      return {
        channels: list,
        suggestion: pick(shopSuggestions({ channels: { walkInShare: total >= 10 ? share("walk_in") : null, onlineShare: total >= 10 ? (share("online") || 0) + (share("booking_link") || 0) : null } })),
      };
    }

    case "clients": {
      const v = (await loadVisitsBy(c.db, "studio_id", c.studio.id, c.today)) as ShopVisit[];
      const seen = new Set(v.filter((x) => x.state === "done" && !x.imported && x.clientKey && x.date >= c.period.from && x.date <= c.period.to).map((x) => x.clientKey as string));
      const first = new Map<string, string>();
      for (const x of v) if (x.clientKey && x.state === "done" && !x.imported && (!first.has(x.clientKey) || x.date < first.get(x.clientKey)!)) first.set(x.clientKey, x.date);
      const fresh = [...seen].filter((k) => (first.get(k) || "") >= c.period.from).length;
      const leaving = leavingShop(v, c.today);
      const shared = sharedClients(v);
      const leavingValue = sum(leaving, (x) => x.avgTicket);
      return {
        newClients: fresh,
        returning: seen.size - fresh,
        retention: retentionCohorts(v, c.today, 6),
        shared,
        leaving: leaving.slice(0, 20),
        leavingCount: leaving.length,
        leavingValue,
        suggestion: pick(shopSuggestions({ clients: { leaving: leaving.length, leavingValue, sharedPercent: shared.percent } })),
      };
    }

    case "memberships": {
      const [{ data: list }, earned, visits] = await Promise.all([
        c.db.from("client_memberships").select("id, customer_id, status, created_at, current_period_end, cancel_at_period_end").eq("studio_id", c.studio.id),
        shopEarnings(c.db, c.studio, c.period.from, c.period.to),
        loadVisitsBy(c.db, "studio_id", c.studio.id, c.today),
      ]);
      const last = new Map<string, string>();
      for (const x of visits) if (x.customerId && x.state === "done" && (last.get(x.customerId) || "") < x.date) last.set(x.customerId, x.date);
      const m = membershipStats((list || []) as never, last, c.period, c.today);
      const income = summarize(earned.rows, "shop").memberships;
      return { ...m, income, suggestion: pick(shopSuggestions({ memberships: { active: m.active, idle: m.idle, cancelRate: m.cancelRate } })) };
    }

    case "rent": {
      const [t, earned] = await Promise.all([team(c.db, c.studio), shopEarnings(c.db, c.studio, c.period.from, c.period.to)]);
      const renters = t.members.filter((m) => m.arrangement === "booth_rent" || m.rent_subscription_id);
      const rows = boothRentStatus(
        renters.map((m) => ({ proId: m.profile_id as string, name: t.name(m.profile_id as string), rentCents: m.rent_cents, rentInterval: m.rent_interval, rentStatus: m.rent_status, periodEnd: m.rent_current_period_end })),
        earned.rows
      );
      const late = rows.filter((r) => r.late).map((r) => ({ name: r.name.split(" ")[0], cents: r.dueCents }));
      return {
        rent: rows,
        collected: sum(rows, (r) => r.paidCents),
        due: sum(rows.filter((r) => !r.late), (r) => r.dueCents),
        lateCents: sum(rows.filter((r) => r.late), (r) => r.dueCents),
        suggestion: pick(shopSuggestions({ rent: { late } })),
      };
    }

    case "forecast": {
      const [v, t] = await Promise.all([loadVisitsBy(c.db, "studio_id", c.studio.id, c.today), team(c.db, c.studio)]);
      const standing = (await Promise.all(t.ids.map((id) => standingFor(c.db, id)))).flat();
      const f = forecast(v, standing, c.today);
      return { ...f, suggestion: pick(shopSuggestions({ forecast: { confirmed: f.confirmed, expected: f.expected } })) };
    }

    case "local": {
      if (!c.accessToken) return { enough: false, shops: 0, suggestion: null };
      const asOwner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${c.accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await asOwner.rpc("local_shop_stats", { target_studio: c.studio.id });
      const r = (Array.isArray(data) ? data[0] : data) as { shops: number; median_ticket_cents: number | null; median_rebook: number | null } | null;
      const last90 = { from: addDays(c.today, -89), to: c.today };
      const v = await loadVisitsBy(c.db, "studio_id", c.studio.id, c.today);
      const o = overview(v, last90, last90, c.today);
      const cmp = localShopCompare({ shops: r?.shops || 0, medianTicket: r?.median_ticket_cents ?? null, medianRebook: r?.median_rebook ?? null }, { avgTicket: o.avgTicket.now || 0, rebook: o.rebook.now });
      return { ...cmp, mine: { avgTicket: o.avgTicket.now, rebook: o.rebook.now }, suggestion: pick(shopSuggestions({ local: { enough: cmp.enough, ticketVs: cmp.enough ? cmp.ticketVs : null, rebookVs: cmp.enough ? cmp.rebookVs : null } })) };
    }
  }
}

// ── Alerts, for a pro or a shop ─────────────────────────────────────────
// Worked out when Analytics opens; new ones are saved so they never show
// twice inside their window. Returns the ones from the last 30 days.

export async function refreshAlerts(db: DB, who: { proId?: string; studio?: StudioRow }, today: string) {
  const visits = who.studio ? await loadVisitsBy(db, "studio_id", who.studio.id, today) : await loadVisitsBy(db, "professional_id", who.proId!, today);
  // This week (Monday to today) against the average of the four weeks before.
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  const days = dow + 1;
  const done = visits.filter((v) => v.state === "done" && !v.imported);
  const weekly = (from: string, to: string) => ({ rev: sum(done.filter((v) => v.date >= from && v.date <= to), (v) => v.sales), ns: visits.filter((v) => v.state === "no_show" && v.date >= from && v.date <= to).length });
  const week = weekly(monday, today);
  // Compare like with like: the same number of days in each earlier week.
  const before = [1, 2, 3, 4].map((w) => weekly(addDays(monday, -7 * w), addDays(monday, -7 * w + days - 1)));
  const usual = { rev: sum(before, (b) => b.rev) / 4, ns: sum(before, (b) => b.ns) / 4 };

  // Goal for this month (revenue goals).
  const goalCents = who.studio
    ? Number((await db.from("studios").select("sales_goal_cents").eq("id", who.studio.id).maybeSingle()).data?.sales_goal_cents) || 0
    : Number((await db.from("profiles").select("sales_goal_cents, goal_kind").eq("id", who.proId!).maybeSingle()).data?.sales_goal_cents) || 0;
  const month = `${today.slice(0, 7)}-01`;
  const soFar = sum(done.filter((v) => v.date >= month), (v) => v.sales);
  const monthName = new Date(`${month}T00:00:00Z`).toLocaleDateString("en-CA", { month: "long", timeZone: "UTC" });

  // Shops: pros whose rebook rate fell this month against last.
  let rebookDrops: { proId: string; name: string; from: number; to: number }[] = [];
  if (who.studio) {
    const t = await team(db, who.studio);
    const thisMonth = { from: month, to: today };
    const lastMonth = { from: `${addDays(month, -1).slice(0, 7)}-01`, to: addDays(month, -1) };
    rebookDrops = t.ids
      .map((id) => {
        const mine = visits.filter((v) => v.proId === id);
        return { proId: id, name: t.name(id), from: rebookRate(mine, lastMonth, today), to: rebookRate(mine, thisMonth, today) };
      })
      .filter((d): d is { proId: string; name: string; from: number; to: number } => d.from !== null && d.to !== null);
  }

  const candidates = alertsFor({
    weekRevenue: week.rev,
    usualWeekRevenue: usual.rev,
    weekNoShows: week.ns,
    usualWeekNoShows: usual.ns,
    goal: goalCents > 0 ? { reached: soFar >= goalCents, month: monthName } : null,
    rebookDrops,
    weekKey: monday,
  });
  const owner = who.studio ? { studio_id: who.studio.id } : { professional_id: who.proId! };
  const q = db.from("analytics_alerts").select("key, title, body, created_at").gte("created_at", new Date(Date.now() - 45 * 86_400_000).toISOString());
  const { data: history } = await (who.studio ? q.eq("studio_id", who.studio.id) : q.eq("professional_id", who.proId!));
  const fresh = newAlerts(candidates, history || [], Date.now());
  if (fresh.length) await db.from("analytics_alerts").insert(fresh.map((a: Alert) => ({ ...owner, key: a.key, title: a.title, body: a.body })));
  const all = [...fresh.map((a) => ({ key: a.key, title: a.title, body: a.body, created_at: new Date().toISOString() })), ...(history || [])];
  return all
    .filter((a) => Date.now() - Date.parse(a.created_at as string) < 30 * 86_400_000)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 6);
}
