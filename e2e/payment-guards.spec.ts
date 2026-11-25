import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Checkout refuses before charging when a booking would be at the pro's place
 * but the pro has no saved address (the webhook would refuse to make the
 * booking after the card was charged). Uses seeded TEST data on LineUp Test and
 * calls the API as the signed-in TEST customer. No payment is created.
 */
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test("paying an in-shop offer from a pro with no address is refused before any charge", async ({ request }) => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).not.toContain("rbsgsymjmptwczecgohb");
  const id = async (who: string) => (await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single()).data!.id;
  const [customer, basic] = [await id("customer"), await id("basic")];
  const { data: openRequest } = await db.from("service_requests").select("id").eq("client_id", customer).eq("status", "open").limit(1).single();
  const { data: offer } = await db.from("request_offers").select("id, proposed_service_mode, status").eq("request_id", openRequest!.id).eq("professional_id", basic).single();
  const { data: pro } = await db.from("profiles").select("formatted_address, location_lat, location_lng").eq("id", basic).single();
  const intentsBefore = (await db.from("payments").select("id", { count: "exact", head: true }).eq("offer_id", offer!.id)).count ?? 0;

  await db.from("request_offers").update({ proposed_service_mode: "in_shop", status: "pending" }).eq("id", offer!.id);
  await db.from("profiles").update({ formatted_address: null, location_lat: null, location_lng: null }).eq("id", basic);
  try {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: signIn } = await anon.auth.signInWithPassword({ email: "lineup.test+customer@example.com", password: process.env.TEST_SEED_PASSWORD! });
    const r = await request.post("/api/stripe/create-payment-intent", {
      headers: { Authorization: `Bearer ${signIn.session!.access_token}` },
      data: { flowType: "request_offer", offerId: offer!.id },
    });
    const res = { status: r.status(), body: await r.json() };
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/needs to add their shop or studio address/);
    const intentsAfter = (await db.from("payments").select("id", { count: "exact", head: true }).eq("offer_id", offer!.id)).count ?? 0;
    expect(intentsAfter).toBe(intentsBefore);
  } finally {
    await db.from("profiles").update(pro!).eq("id", basic);
    await db.from("request_offers").update({ proposed_service_mode: offer!.proposed_service_mode, status: offer!.status }).eq("id", offer!.id);
  }
});
