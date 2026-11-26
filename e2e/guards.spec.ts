import { test, expect } from "@playwright/test";

/**
 * Scheduled jobs, internal routes and the Stripe webhook must refuse callers
 * without the secret or signature. Every request here is turned away before
 * the route does any work (isCronAuthorized fails closed; the webhook checks
 * the signature first), so nothing runs, sends or charges. Safe on preview too.
 */
const CRONS = [
  "/api/reminders",
  "/api/cron/auto-complete-bookings",
  "/api/cron/expire-verifications",
  "/api/cron/completion-nudges",
  "/api/cron/standing-appointments",
  "/api/cron/rebook-nudges",
  "/api/cron/weekly-summary",
  "/api/cron/weekly-push",
  "/api/cron/enable-direct-booking",
];

test.describe("guards", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "API checks run once"));

  for (const path of CRONS) {
    test(`${path} refuses without the cron secret`, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(401);
      expect((await request.get(path, { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
    });
  }

  test("booking-confirmed (internal) refuses without the cron secret", async ({ request }) => {
    expect((await request.post("/api/notifications/booking-confirmed", { data: {} })).status()).toBe(401);
  });

  test("Stripe webhook refuses an unsigned or badly signed event", async ({ request }) => {
    const body = JSON.stringify({ type: "payment_intent.succeeded", data: { object: {} } });
    const unsigned = await request.post("/api/stripe/webhook", { data: body, headers: { "content-type": "application/json" } });
    const bad = await request.post("/api/stripe/webhook", { data: body, headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" } });
    // 400 when the webhook secret is set; 500 if a deployment is missing it. Never accepted.
    expect([400, 500]).toContain(unsigned.status());
    expect(bad.status()).toBe(unsigned.status());
  });

  test("payments health reports modes and never a key", async ({ request }) => {
    const res = await request.get("/api/health/payments");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/(sk|rk|pk)_(live|test)_[A-Za-z0-9]{6,}|whsec_/);
    const json = JSON.parse(text);
    expect(["live", "test"]).toContain(json.secretKey);
    expect(json.keysMatch).toBe(true);
  });
});
