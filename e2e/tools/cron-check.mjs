// Runs every scheduled job once against the TEST database and reports what each
// one changed. Needs seeded TEST data and a dev server pointed at the test
// database (.env.development.local from .env.testdb.local).
//
//   node --env-file=.env.local --env-file=.env.testdb.local --env-file=.env.test.local e2e/tools/cron-check.mjs
//
// Refuses to run against the live project: the jobs act on every row, so on the
// live database they would email, push and pay real people.
import { createClient } from "@supabase/supabase-js";

const LIVE_REF = "rbsgsymjmptwczecgohb";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url || url.includes(LIVE_REF)) throw new Error("Refusing: this is not the test database.");
const BASE = process.env.CRON_BASE_URL || "http://localhost:3000";
const auth = { authorization: `Bearer ${process.env.CRON_SECRET}` };
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The dev server must be on the same (test) database: the seeded TEST shop only exists there.
const { data: shop } = await db.from("studios").select("id, slug").like("slug", "test-studio-plus-%").single();
const probe = await fetch(`${BASE}/shop/${shop.slug}`);
if (probe.status !== 200) throw new Error("Dev server isn't on the test database (TEST shop page not found). Stopping.");

const who = async (w) => (await db.from("profiles").select("id").eq("email", `lineup.test+${w}@example.com`).single()).data.id;
const ids = { customer: await who("customer"), basic: await who("basic"), master: await who("master"), member2: await who("member2") };
const svc = async (pro) => (await db.from("professional_services").select("id").eq("professional_id", pro).limit(1).single()).data.id;
const day = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" });
const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const base = async (pro, extra) => ({
  professional_id: pro, customer_id: ids.customer, service_id: await svc(pro), service_name: "TEST Haircut", duration_minutes: 45,
  service_price: 40, service_mode: "in_shop", notes: "TEST cron check", source: "direct_booking", came_from: "discover", ...extra,
});

// ── Set up one qualifying row per job ─────────────────────────────────────
await db.from("bookings").delete().eq("notes", "TEST cron check"); // earlier runs
const { data: made, error } = await db.from("bookings").insert([
  await base(ids.basic, { booking_date: day(1), start_time: "16:00", end_time: "16:45", status: "confirmed" }), // reminders (24h)
  await base(ids.master, { booking_date: day(-3), start_time: "16:00", end_time: "16:45", status: "completion_requested", completion_requested_at: ago(60) }), // auto-complete
  await base(ids.basic, { booking_date: day(-1), start_time: "08:00", end_time: "08:45", status: "confirmed" }), // completion nudge
  await base(ids.master, { booking_date: day(-24), start_time: "16:00", end_time: "16:45", status: "completed", completed_at: ago(24 * 23), completion_nudge_sent_at: ago(24 * 23) }), // rebook nudge
]).select("id, booking_date, status");
if (error) throw new Error(error.message);
const [reminderB, autoB, nudgeB, rebookB] = made.map((b) => b.id);
await db.from("profiles").update({ verified_until: day(-1) }).eq("id", ids.member2); // expire-verifications
const { data: reg } = await db.from("standing_appointments").select("id").eq("customer_id", ids.customer).limit(1).single();
await db.from("standing_appointments").update({ next_date: day(5), reminded_for: null }).eq("id", reg.id); // standing
await db.from("profiles").update({ weekly_push_opt_in: true }).eq("id", ids.basic); // weekly-push
await db.from("profiles").update({ direct_booking_enabled: false }).eq("id", ids.master); // enable-direct-booking
await db.from("weekly_push_log").delete().eq("profile_id", ids.basic);

const snapshot = async () => ({
  reminder: (await db.from("bookings").select("reminder_24h_sent_at").eq("id", reminderB).single()).data,
  auto: (await db.from("bookings").select("status, completed_at").eq("id", autoB).single()).data,
  nudge: (await db.from("bookings").select("completion_nudge_sent_at").eq("id", nudgeB).single()).data,
  rebook: (await db.from("bookings").select("rebook_nudge_sent_at").eq("id", rebookB).single()).data,
  verification: (await db.from("profiles").select("verification_status").eq("id", ids.member2).single()).data,
  regular: (await db.from("standing_appointments").select("next_date, reminded_for").eq("id", reg.id).single()).data,
  weeklyPush: (await db.from("weekly_push_log").select("week").eq("profile_id", ids.basic)).data?.length ?? 0,
  directBooking: (await db.from("profiles").select("direct_booking_enabled").eq("id", ids.master).single()).data,
  notifications: (await db.from("notifications").select("id", { count: "exact", head: true }).in("user_id", Object.values(ids))).count,
});

const before = await snapshot();
const JOBS = ["/api/reminders", "/api/cron/auto-complete-bookings", "/api/cron/expire-verifications", "/api/cron/completion-nudges",
  "/api/cron/standing-appointments", "/api/cron/rebook-nudges", "/api/cron/weekly-summary", "/api/cron/weekly-push", "/api/cron/enable-direct-booking"];
for (const path of JOBS) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { headers: auth });
  const body = (await res.text()).replace(/\s+/g, " ").slice(0, 220);
  console.log(`${res.status} ${path} (${Date.now() - t0} ms) ${body}`);
}
const after = await snapshot();
console.log("\nBEFORE", JSON.stringify(before));
console.log("AFTER ", JSON.stringify(after));
