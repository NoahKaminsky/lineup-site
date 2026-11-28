import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { BOOKING_DEPOSIT_PERCENT, platformFeeCentsFor, splitBookingPayment } from "../app/lib/commission";

/**
 * Where a shop booking's money actually goes, in Stripe test mode:
 *  - a commission pro (TEST member one, 40%): the pro gets their deposit and
 *    the rest of their share; the shop gets its cut; LineUp keeps the card fee.
 *  - a booth renter (TEST member two): the pro gets everything after the fee;
 *    the shop gets no cut (it's paid rent instead).
 * The TEST client pays with Stripe's test card, the visit is completed, then
 * the real test-mode transfers are checked: amounts and destinations.
 * Needs `stripe listen` forwarding (STRIPE_FORWARDING=1) and the TEST shop's
 * test payout account (TEST_SHOP_STRIPE_ACCOUNT), which also stands in as
 * the two pros' payout account here. Test keys only; test database only.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_missing");
const ids: Record<string, string> = {};
let shopAccount = "";
let token = "";

test.beforeAll(async ({ browserName }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on desktop");
  test.skip(process.env.STRIPE_FORWARDING !== "1", "needs `stripe listen` forwarding (STRIPE_FORWARDING=1)");
  expect(String(process.env.STRIPE_SECRET_KEY).startsWith("sk_test_"), "test keys only").toBe(true);
  void browserName;
  for (const who of ["owner", "member1", "member2", "customer"]) {
    ids[who] = (await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single()).data!.id;
  }
  const shop = (await db.from("studios").select("id, stripe_account_id, plan, subscription_status").eq("owner_id", ids.owner).single()).data!;
  test.skip(!shop.stripe_account_id, "TEST shop has no test payout account (set TEST_SHOP_STRIPE_ACCOUNT and re-seed)");
  ids.studio = shop.id;
  shopAccount = shop.stripe_account_id!;
  expect(`${shop.plan}/${shop.subscription_status}`).toBe("studio_plus/active");
  // The pros need a payout account to be paid; the shop's test account stands in.
  await db.from("profiles").update({ stripe_account_id: shopAccount }).in("id", [ids.member1, ids.member2]);

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: "lineup.test+customer@example.com", password: process.env.TEST_SEED_PASSWORD! });
  expect(error).toBeNull();
  token = data.session!.access_token;
});

test.afterAll(async () => {
  if (ids.member1) await db.from("profiles").update({ stripe_account_id: null }).in("id", [ids.member1, ids.member2]);
});

// A free weekday slot, a few days out (the TEST pros work 9 to 5, Mon to Fri).
function slot(daysOut: number, start: string) {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return { date: d.toISOString().slice(0, 10), start };
}

async function payAndComplete(request: import("@playwright/test").APIRequestContext, pro: string, when: { date: string; start: string }) {
  const service = (await db.from("professional_services").select("id, price, duration_minutes").eq("professional_id", ids[pro]).limit(1).single()).data!;
  const [h, m] = when.start.split(":").map(Number);
  const endMin = h * 60 + m + Number(service.duration_minutes);
  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

  // 1. The client starts paying (the same call the shop page makes).
  const res = await request.post("/api/stripe/create-payment-intent", {
    headers: { Authorization: `Bearer ${token}`, Origin: new URL(test.info().project.use.baseURL!).origin },
    data: { flowType: "direct_booking", professionalId: ids[pro], serviceId: service.id, date: when.date, startTime: when.start, endTime: end, mode: "in_shop" },
  });
  const body = await res.json();
  expect(res.ok(), JSON.stringify(body)).toBe(true);
  const paymentIntentId = String(body.clientSecret).split("_secret")[0];

  // 2. Pays with Stripe's test card; the webhook turns it into a booking.
  await stripe.paymentIntents.confirm(paymentIntentId, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
  let booking: Record<string, unknown> | null = null;
  await expect
    .poll(async () => {
      booking = (await db.from("bookings").select("*").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle()).data;
      return booking ? "booked" : "waiting";
    }, { timeout: 60_000 })
    .toBe("booked");
  const b = booking as unknown as { id: string; service_price: number | null };

  // 3. The visit happens (moved into the past on the test database), and the client confirms it.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await db.from("bookings").update({ booking_date: yesterday }).eq("id", b.id);
  const done = await request.post("/api/bookings/complete", {
    headers: { Authorization: `Bearer ${token}` },
    data: { bookingId: b.id, action: "confirm" },
  });
  expect(done.ok(), await done.text()).toBe(true);

  // 4. The transfers it made.
  let row: Record<string, unknown> = {};
  await expect
    .poll(async () => {
      row = (await db.from("bookings").select("*").eq("id", b.id).single()).data!;
      return row.status === "completed" && row.stripe_final_transfer_id ? "paid out" : "waiting";
    }, { timeout: 60_000 })
    .toBe("paid out");
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return { row, amountCents: pi.amount };
}

async function transfer(id: unknown) {
  return id ? stripe.transfers.retrieve(String(id)) : null;
}

test("commission pro: deposit and the rest to the pro, the cut to the shop, the card fee to LineUp", async ({ request }) => {
  const { row, amountCents } = await payAndComplete(request, "member1", slot(4, "13:00"));
  const member = (await db.from("studio_members").select("commission_percent").eq("studio_id", ids.studio).eq("profile_id", ids.member1).single()).data!;
  const fee = platformFeeCentsFor({ amountCents, source: "direct_booking", inLiveStudio: true, profile: { subscription_plan: "pro", subscription_status: "active" } });
  const want = splitBookingPayment({ amountCents, platformFeeCents: fee, depositPercent: BOOKING_DEPOSIT_PERCENT, studioCutPercent: Number(member.commission_percent ?? 40) });
  expect(want.studioCutCents).toBeGreaterThan(0);

  const deposit = await transfer(row.stripe_deposit_transfer_id);
  const final = await transfer(row.stripe_final_transfer_id);
  const cut = await transfer(row.stripe_studio_transfer_id);
  expect(Number(row.studio_cut_cents)).toBe(want.studioCutCents);
  expect(deposit?.amount).toBe(want.depositAmountCents);
  expect(final?.amount).toBe(want.remainingPayoutCents);
  expect(cut?.amount).toBe(want.studioCutCents);
  for (const t of [deposit, final, cut]) expect(t?.destination).toBe(shopAccount);
  expect(cut?.metadata.flow_type).toBe("studio_cut");
  // Everything paid out plus LineUp's fee is exactly what the client paid.
  expect(deposit!.amount + final!.amount + cut!.amount + fee).toBe(amountCents);
});

test("booth renter: the pro gets everything after the fee; the shop takes no cut", async ({ request }) => {
  const { row, amountCents } = await payAndComplete(request, "member2", slot(5, "14:00"));
  const fee = platformFeeCentsFor({ amountCents, source: "direct_booking", inLiveStudio: true, profile: { subscription_plan: "pro", subscription_status: "active" } });
  expect(Number(row.studio_cut_cents || 0)).toBe(0);
  expect(row.stripe_studio_transfer_id ?? null).toBeNull();
  const deposit = await transfer(row.stripe_deposit_transfer_id);
  const final = await transfer(row.stripe_final_transfer_id);
  expect(deposit!.amount + final!.amount + fee).toBe(amountCents);
});
