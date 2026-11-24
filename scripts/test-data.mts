/**
 * LineUp TEST data: seed, clean up, or list.
 *
 *   node --env-file=.env.local scripts/test-data.mts check     # what TEST data exists (read only)
 *   node --env-file=.env.local scripts/test-data.mts seed      # create TEST accounts + data
 *   node --env-file=.env.local scripts/test-data.mts cleanup   # delete ONLY TEST data
 *
 * Every account it makes has an email `lineup.test+<who>@example.com` and a
 * name starting "TEST ". Cleanup only deletes accounts matching BOTH, plus the
 * rows hanging off them, and refuses if a TEST row is linked to a real account.
 *
 * Safety:
 * - Never calls Stripe, never writes push subscriptions or phone numbers, and
 *   turns email/SMS/weekly-summary settings off, so nothing is sent to anyone.
 * - Refuses to run if STRIPE_SECRET_KEY is set and is not a test key.
 * - LineUp's only Supabase project is LIVE. Writing to it needs Noah's OK, so
 *   the script refuses unless LINEUP_ALLOW_LIVE_TEST_DATA=yes-noah-approved.
 * - Passwords come from TEST_SEED_PASSWORD (keep it in .env.test.local, which
 *   git ignores). Nothing secret is printed.
 *
 * Plain TypeScript run by Node 24's built-in type stripping (no build step).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LIVE_PROJECT_REF = "rbsgsymjmptwczecgohb";
const LIVE_OK_VALUE = "yes-noah-approved";
const EMAIL_PREFIX = "lineup.test+";
const EMAIL_DOMAIN = "@example.com"; // reserved domain: mail to it is never delivered
const NAME_PREFIX = "TEST ";

type Who = "customer" | "admin" | "basic" | "master" | "owner" | "manager" | "member1" | "member2";

export const TEST_ACCOUNTS: Record<Who, { name: string; role: "customer" | "professional" }> = {
  customer: { name: "TEST Customer", role: "customer" },
  admin: { name: "TEST Admin", role: "customer" },
  basic: { name: "TEST Basic Pro", role: "professional" },
  master: { name: "TEST Master Pro", role: "professional" },
  owner: { name: "TEST Shop Owner", role: "professional" },
  manager: { name: "TEST Shop Manager", role: "professional" },
  member1: { name: "TEST Shop Member One", role: "professional" },
  member2: { name: "TEST Shop Member Two", role: "professional" },
};
export const testEmail = (who: string) => `${EMAIL_PREFIX}${who}${EMAIL_DOMAIN}`;
export const isTestEmail = (e?: string | null) => !!e && e.startsWith(EMAIL_PREFIX) && e.endsWith(EMAIL_DOMAIN);

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Why this environment must not be used, or null if it's fine. Pure, so it's unit-tested. */
export function unsafeTargetReason(env: Record<string, string | undefined>, writes: boolean): string | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) return "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (run with --env-file=.env.local).";
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return "Refusing to run in a production environment.";
  const stripe = env.STRIPE_SECRET_KEY;
  if (stripe && !stripe.startsWith("sk_test_")) return "STRIPE_SECRET_KEY is not a test key (sk_test_…). Refusing.";
  if (writes && url.includes(LIVE_PROJECT_REF) && env.LINEUP_ALLOW_LIVE_TEST_DATA !== LIVE_OK_VALUE) {
    return (
      `This is LineUp's LIVE Supabase project (${LIVE_PROJECT_REF}).\n` +
      `  Writing TEST data to it needs Noah's explicit OK first (CLAUDE.md).\n` +
      `  With that OK, re-run with LINEUP_ALLOW_LIVE_TEST_DATA=${LIVE_OK_VALUE}.`
    );
  }
  return null;
}

function guard(writes: boolean) {
  const reason = unsafeTargetReason(process.env, writes);
  if (reason) fail(reason);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const live = url.includes(LIVE_PROJECT_REF);
  console.log(`Database: ${live ? `LIVE project ${LIVE_PROJECT_REF}` : url}${writes ? " (writing)" : " (read only)"}`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) fail(`${label}: ${error.message}`);
  return data as NonNullable<T>;
}

/** All auth users that are TEST accounts (email AND profile name both match). */
async function findTestUsers(db: SupabaseClient) {
  const found: { id: string; email: string }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`listUsers: ${error.message}`);
    for (const u of data.users) if (isTestEmail(u.email)) found.push({ id: u.id, email: u.email! });
    if (data.users.length < 1000) break;
  }
  if (!found.length) return [];
  const profiles = await must(
    "profiles",
    db.from("profiles").select("id, full_name").in("id", found.map((u) => u.id)),
  );
  const named = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]));
  // An auth user with a TEST email but no profile yet (half-finished seed) still counts.
  return found.filter((u) => !named.has(u.id) || (named.get(u.id) ?? "").startsWith(NAME_PREFIX));
}

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

async function seed() {
  const db = guard(true);
  const password = process.env.TEST_SEED_PASSWORD;
  if (!password || password.length < 12) fail("Set TEST_SEED_PASSWORD (12+ chars) in .env.test.local and pass --env-file=.env.test.local too.");
  if ((await findTestUsers(db)).length) fail("TEST accounts already exist. Run `cleanup` first.");

  // 1. Accounts + profiles
  const id = {} as Record<Who, string>;
  for (const who of Object.keys(TEST_ACCOUNTS) as Who[]) {
    const { data, error } = await db.auth.admin.createUser({
      email: testEmail(who),
      password,
      email_confirm: true,
      user_metadata: { full_name: TEST_ACCOUNTS[who].name, test_data: true },
    });
    if (error || !data.user) fail(`createUser ${who}: ${error?.message}`);
    id[who] = data.user.id;
  }
  const now = new Date().toISOString();
  const base = (who: Who) => ({
    id: id[who],
    email: testEmail(who),
    full_name: TEST_ACCOUNTS[who].name,
    role: TEST_ACCOUNTS[who].role,
    terms_accepted: true,
    terms_accepted_at: now,
    privacy_accepted: true,
    privacy_accepted_at: now,
    marketing_consent: false,
    welcome_tour_seen_customer: true,
    welcome_tour_seen_professional: true,
    onboarding_checklist_dismissed: true,
    email_request_notifications: false,
    email_offer_notifications: false,
    sms_notifications_enabled: false,
    weekly_summary_opt_out: true,
    weekly_push_opt_in: false,
    phone_number: null,
    time_zone: "America/Toronto",
  });
  const pro = (who: Who, extra: Record<string, unknown>) => ({
    ...base(who),
    professional_type: "Barber",
    professional_types: ["Barber"],
    bio: "TEST account for automated checks. Not a real pro.",
    username: `test-${who}-${id[who].slice(0, 6)}`,
    direct_booking_enabled: true,
    public_availability_enabled: true,
    service_modes: ["in_shop"],
    verification_status: "verified",
    verification_track: "licensed",
    verified_at: now,
    verified_until: day(365),
    ...extra,
  });
  await must(
    "insert profiles",
    db.from("profiles").upsert([
      base("customer"),
      { ...base("admin"), is_admin: true },
      pro("basic", {}),
      pro("master", { subscription_plan: "master", subscription_status: "active", subscription_current_period_end: day(30) }),
      pro("owner", {}),
      pro("manager", {}),
      pro("member1", {}),
      pro("member2", {}),
    ], { defaultToNull: false }),
  );

  // 2. Studio Plus shop with owner + 3 members
  const studio = await must(
    "insert studio",
    db
      .from("studios")
      .insert({
        name: "TEST Studio Plus Shop",
        owner_id: id.owner,
        plan: "studio_plus",
        subscription_status: "active",
        subscription_current_period_end: day(30),
        slug: `test-studio-plus-${id.owner.slice(0, 6)}`,
        tagline: "TEST shop for automated checks",
        pay_at_shop_enabled: true,
        commission_percent: 40,
      })
      .select("id, slug")
      .single(),
  );
  const shopPros: Who[] = ["owner", "manager", "member1", "member2"];
  await must(
    "insert studio_members",
    db.from("studio_members").insert([
      { studio_id: studio.id, profile_id: id.owner, role: "owner", status: "active", arrangement: "commission", takes_clients: true, joined_at: now },
      { studio_id: studio.id, profile_id: id.manager, role: "manager", status: "active", arrangement: "commission", commission_percent: 40, takes_clients: true, joined_at: now, invited_by: id.owner },
      { studio_id: studio.id, profile_id: id.member1, role: "member", status: "active", arrangement: "commission", commission_percent: 40, takes_clients: true, joined_at: now, invited_by: id.owner },
      { studio_id: studio.id, profile_id: id.member2, role: "member", status: "active", arrangement: "booth_rent", rent_cents: 25000, rent_interval: "week", takes_clients: true, joined_at: now, invited_by: id.owner },
    ], { defaultToNull: false }),
  );
  for (const who of shopPros) {
    await must(
      `link ${who} to studio`,
      db.from("profiles").update({ studio_id: studio.id, subscription_plan: "pro", subscription_status: "active", plan_source: "studio" }).eq("id", id[who]),
    );
  }

  // 3. Services + weekly hours for every pro
  const pros: Who[] = ["basic", "master", ...shopPros];
  const services = await must(
    "insert services",
    db
      .from("professional_services")
      .insert(pros.map((p) => ({ professional_id: id[p], service_name: "TEST Haircut", duration_minutes: 45, price: 40, is_active: true, is_bookable: true })), { defaultToNull: false })
      .select("id, professional_id"),
  );
  const svc = (who: Who) => services.find((s: { professional_id: string }) => s.professional_id === id[who])!.id as string;
  await must(
    "insert availability",
    db.from("professional_availability").insert(
      pros.flatMap((p) => [1, 2, 3, 4, 5].map((d) => ({ professional_id: id[p], day_of_week: d, start_time: "09:00", end_time: "17:00", is_active: true }))), { defaultToNull: false }),
  );

  // 4. Requests in every status, with offers in every status
  const request = (title: string, status: string, extra: Record<string, unknown> = {}) => ({
    client_id: id.customer,
    category: "Hair",
    categories: ["Hair"],
    title: `TEST ${title}`,
    description: "TEST request for automated checks.",
    service_mode: "in_shop",
    service_modes: ["in_shop"],
    target_professions: ["Barber"],
    budget: "$40",
    status,
    preferred_date: day(14),
    preferred_start_time: "10:00",
    preferred_end_time: "11:00",
    ...extra,
  });
  const reqs = await must(
    "insert requests",
    db
      .from("service_requests")
      .insert([
        request("Open request", "open"),
        request("Accepted request", "accepted", { accepted_professional_id: id.basic }),
        request("Completed request", "completed", { accepted_professional_id: id.master, preferred_date: day(-10) }),
        request("Cancelled request", "cancelled", { cancelled_at: now }),
      ], { defaultToNull: false })
      .select("id, title"),
  );
  const req = (t: string) => reqs.find((r: { title: string }) => r.title === `TEST ${t}`)!.id as string;
  const offer = (r: string, who: Who, status: string) => ({
    request_id: req(r),
    professional_id: id[who],
    message: "TEST offer",
    proposed_price: "$40",
    status,
    proposed_date: day(14),
    proposed_start_time: "10:00",
    proposed_end_time: "10:45",
    proposed_service_mode: "in_shop",
  });
  await must(
    "insert offers",
    db.from("request_offers").insert([
      offer("Open request", "basic", "pending"),
      offer("Open request", "master", "pending"),
      offer("Open request", "member1", "withdrawn"),
      offer("Accepted request", "basic", "accepted"),
      offer("Accepted request", "master", "not_selected"),
      offer("Completed request", "master", "accepted"),
      offer("Cancelled request", "basic", "declined"),
    ], { defaultToNull: false }),
  );

  // 5. Bookings in every status. Dates and *_sent_at stamps keep the daily crons
  //    (reminders, nudges, auto-complete) away from them for the test window.
  //    No Stripe ids anywhere, so no cron or webhook can move money for them.
  const booking = (who: Who, extra: Record<string, unknown>) => ({
    professional_id: id[who],
    customer_id: id.customer,
    service_id: svc(who),
    service_name: "TEST Haircut",
    duration_minutes: 45,
    service_price: 40,
    start_time: "10:00",
    end_time: "10:45",
    service_mode: "in_shop",
    notes: "TEST booking",
    reminder_24h_sent_at: now,
    reminder_2h_sent_at: now,
    reminder_dayof_sent_at: now,
    completion_nudge_sent_at: now,
    rebook_nudge_sent_at: now,
    ...extra,
  });
  const bookings = await must(
    "insert bookings",
    db
      .from("bookings")
      .insert([
        booking("basic", { booking_date: day(14), status: "confirmed", source: "request", request_id: req("Accepted request"), came_from: "request" }),
        booking("master", { booking_date: day(0), start_time: "07:00", end_time: "07:45", status: "completion_requested", completion_requested_at: ago(1), source: "direct_booking", came_from: "booking_link" }),
        booking("master", { booking_date: day(-10), status: "completed", completed_at: ago(240), source: "request", request_id: req("Completed request"), came_from: "request" }),
        booking("basic", { booking_date: day(20), status: "cancelled", cancelled_at: now, cancelled_by: id.customer, source: "direct_booking", came_from: "discover" }),
        booking("member1", { booking_date: day(15), status: "confirmed", studio_id: studio.id, payment_status: "pay_at_shop", payout_status: "not_ready", source: "direct_booking", came_from: "discover" }),
        booking("member1", { booking_date: day(-7), status: "completed", completed_at: ago(160), studio_id: studio.id, payment_status: "pay_at_shop", source: "direct_booking", came_from: "regular" }),
      ], { defaultToNull: false })
      .select("id, professional_id, status, booking_date"),
  );
  const completedMaster = bookings.find((b: { professional_id: string; status: string }) => b.professional_id === id.master && b.status === "completed")!.id;
  const completedShop = bookings.find((b: { professional_id: string; status: string }) => b.professional_id === id.member1 && b.status === "completed")!.id;

  // 6. Reviews both ways
  await must(
    "insert professional_reviews",
    db.from("professional_reviews").insert([
      { professional_id: id.master, reviewer_id: id.customer, rating: 5, comment: "TEST review: great cut.", booking_id: completedMaster, request_id: req("Completed request"), pro_reply: "TEST reply: thanks!", pro_replied_at: now },
      { professional_id: id.member1, reviewer_id: id.customer, rating: 4, comment: "TEST review: solid.", booking_id: completedShop },
    ], { defaultToNull: false }),
  );
  await must(
    "insert customer_reviews",
    db.from("customer_reviews").insert({ customer_id: id.customer, reviewer_id: id.master, booking_id: completedMaster, rating: 5 }),
  );

  // 7. Gift card (shop) + membership (shop). Stripe ids left empty on purpose.
  await must(
    "insert gift card",
    db.from("gift_cards").insert({
      code: `LU-TEST-${id.owner.replace(/-/g, "").slice(0, 4).toUpperCase()}-${id.owner.replace(/-/g, "").slice(4, 8).toUpperCase()}`,
      studio_id: studio.id,
      amount_cents: 5000,
      balance_cents: 5000,
      currency: "cad",
      status: "active",
      buyer_id: id.customer,
      buyer_name: "TEST Customer",
      buyer_email: testEmail("customer"),
      recipient_name: "TEST Recipient",
      recipient_email: testEmail("recipient"),
      message: "TEST gift card",
      send_to_recipient: false,
      activated_at: now,
    }),
  );
  const plan = await must(
    "insert membership plan",
    db.from("membership_plans").insert({ studio_id: studio.id, name: "TEST Monthly Trim", description: "TEST plan", price_cents: 4000, visits_per_period: 2, active: true }).select("id").single(),
  );
  await must(
    "insert membership",
    db.from("client_memberships").insert({ plan_id: plan.id, studio_id: studio.id, customer_id: id.customer, status: "active", current_period_start: now, current_period_end: day(30) }),
  );

  // A regular (standing appointment). next_date is 4 weeks out so the daily
  // standing-appointments cron leaves it alone during the test window.
  const standing = await must(
    "insert standing appointment",
    db.from("standing_appointments").insert({ professional_id: id.master, customer_id: id.customer, service_id: svc("master"), service_name: "TEST Haircut", service_mode: "in_shop", start_time: "10:00", end_time: "10:45", interval_weeks: 4, next_date: day(28), reminded_for: day(28), status: "active", source_booking_id: completedMaster }).select("id").single(),
  );

  // 8. A few Studio extras so Studio screens aren't empty
  await must(
    "insert shop appointments",
    db.from("shop_appointments").insert([
      { studio_id: studio.id, professional_id: id.member2, created_by: id.owner, kind: "walk_in", client_name: "TEST Walk-in", service_name: "TEST Haircut", appointment_date: day(-3), start_time: "12:00", end_time: "12:45", price_cents: 4000, status: "completed", paid_with: "cash" },
      { studio_id: studio.id, professional_id: id.manager, created_by: id.owner, kind: "phone", client_name: "TEST Phone Booking", service_name: "TEST Haircut", appointment_date: day(16), start_time: "14:00", end_time: "14:45", price_cents: 4000, status: "booked" },
    ], { defaultToNull: false }),
  );
  await must(
    "insert chair opening",
    db.from("chair_openings").insert({ studio_id: studio.id, posted_by: id.owner, title: "TEST Chair opening", professions: ["Barber"], arrangement: "booth_rent", rent_cents: 25000, rent_interval: "week", description: "TEST opening", status: "open", expires_at: day(30) }),
  );

  console.log("\n✔ Seeded TEST data. Accounts (password = TEST_SEED_PASSWORD):");
  for (const who of Object.keys(TEST_ACCOUNTS) as Who[]) console.log(`  ${who.padEnd(9)} ${testEmail(who).padEnd(42)} ${TEST_ACCOUNTS[who].name}`);
  console.log(`  shop: /shop/${studio.slug}   regular: /regular/${standing.id}`);
}

/** Every row tied to TEST accounts, by table, for check + cleanup. */
async function collect(db: SupabaseClient) {
  const users = await findTestUsers(db);
  const ids = users.map((u) => u.id);
  if (!ids.length) return { users, ids, studios: [] as string[], bookings: [] as { id: string; professional_id: string; customer_id: string }[], foreign: [] as string[] };
  const studios = (await must("studios", db.from("studios").select("id, name, owner_id").in("owner_id", ids))) as { id: string; name: string }[];
  const notTestStudio = studios.filter((s) => !s.name.startsWith(NAME_PREFIX));
  const studioIds = studios.map((s) => s.id);
  const list = `(${ids.join(",")})`;
  const bookings = (await must(
    "bookings",
    db.from("bookings").select("id, professional_id, customer_id").or(`professional_id.in.${list},customer_id.in.${list}`),
  )) as { id: string; professional_id: string; customer_id: string }[];
  // Safety: anything linking a TEST account to a real account.
  const foreign: string[] = [];
  const idSet = new Set(ids);
  for (const b of bookings) if (!idSet.has(b.professional_id) || !idSet.has(b.customer_id)) foreign.push(`booking ${b.id}`);
  for (const s of notTestStudio) foreign.push(`studio "${s.name}" (owned by a TEST account but not named TEST)`);
  if (studioIds.length) {
    const members = (await must("studio_members", db.from("studio_members").select("id, profile_id").in("studio_id", studioIds))) as { id: string; profile_id: string | null }[];
    for (const m of members) if (m.profile_id && !idSet.has(m.profile_id)) foreign.push(`studio member ${m.profile_id}`);
    const mems = (await must("client_memberships", db.from("client_memberships").select("id, customer_id").in("studio_id", studioIds))) as { id: string; customer_id: string }[];
    for (const m of mems) if (!idSet.has(m.customer_id)) foreign.push(`membership ${m.id}`);
  }
  const memberships = (await must("member rows", db.from("studio_members").select("studio_id").in("profile_id", ids))) as { studio_id: string }[];
  for (const m of memberships) if (!studioIds.includes(m.studio_id)) foreign.push(`TEST account is a member of real studio ${m.studio_id}`);
  const offers = (await must(
    "offers on TEST requests",
    db.from("request_offers").select("id, professional_id, service_requests!inner(client_id)").in("service_requests.client_id", ids),
  )) as unknown as { id: string; professional_id: string }[];
  for (const o of offers) if (!idSet.has(o.professional_id)) foreign.push(`offer ${o.id} from a real pro on a TEST request`);
  return { users, ids, studios: studioIds, bookings, foreign };
}

async function check() {
  const db = guard(false);
  const { users, studios, bookings, foreign } = await collect(db);
  console.log(`TEST accounts: ${users.length}`);
  for (const u of users) console.log(`  ${u.email}`);
  console.log(`TEST studios: ${studios.length}, bookings touching TEST accounts: ${bookings.length}`);
  if (foreign.length) console.log(`⚠ Linked to real accounts (cleanup will refuse):\n  ${foreign.join("\n  ")}`);
}

async function cleanup() {
  const db = guard(true);
  const { users, ids, studios, bookings, foreign } = await collect(db);
  if (!users.length) return console.log("No TEST data found. Nothing to do.");
  if (foreign.length) fail(`TEST data is linked to real accounts; delete by hand after checking:\n  ${foreign.join("\n  ")}`);
  const bookingIds = bookings.map((b) => b.id);
  const del = (label: string, q: PromiseLike<{ error: { message: string } | null }>) => must(label, q.then((r) => ({ data: null, error: r.error })));
  // Rows whose foreign keys don't cascade (or only null out) go first.
  if (bookingIds.length) {
    await del("notifications(booking)", db.from("notifications").delete().in("booking_id", bookingIds));
    await del("reviews(booking)", db.from("professional_reviews").delete().in("booking_id", bookingIds));
    await del("payments(booking)", db.from("payments").delete().in("booking_id", bookingIds));
    await del("gift redemptions(booking)", db.from("gift_card_redemptions").delete().in("booking_id", bookingIds));
  }
  await del("booking_messages", db.from("booking_messages").delete().in("sender_id", ids));
  await del("gift_cards(pro)", db.from("gift_cards").delete().in("professional_id", ids));
  if (studios.length) {
    await del("gift_cards(studio)", db.from("gift_cards").delete().in("studio_id", studios));
    await del("bookings(studio)", db.from("bookings").delete().in("studio_id", studios));
    await del("profiles.studio_id", db.from("profiles").update({ studio_id: null }).in("id", ids));
    await del("studios", db.from("studios").delete().in("id", studios)); // cascades members, plans, memberships, shop rows
  }
  await del("bookings", db.from("bookings").delete().or(`professional_id.in.(${ids.join(",")}),customer_id.in.(${ids.join(",")})`));
  for (const u of users) {
    const { error } = await db.auth.admin.deleteUser(u.id); // cascades profiles + everything keyed on them
    if (error) fail(`deleteUser ${u.email}: ${error.message}`);
  }
  console.log(`✔ Removed ${users.length} TEST accounts, ${studios.length} TEST studio(s), ${bookingIds.length} TEST bookings and their rows.`);
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "seed") await seed();
  else if (cmd === "cleanup") await cleanup();
  else if (cmd === "check") await check();
  else fail("Usage: node --env-file=.env.local [--env-file=.env.test.local] scripts/test-data.mts seed|cleanup|check");
}
