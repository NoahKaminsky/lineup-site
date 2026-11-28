// The sample shop for pitching LineUp to shop owners: "Northline Barber Co.",
// a fictional barbershop in Winnipeg's Exchange District with four barbers,
// a real-looking menu, hours, stock photos and a membership plan.
//
// It's a demo shop (studios.is_demo): reachable only by its link, labelled
// "Sample shop", never bookable, and its barbers are left unverified so they
// never show in Explore or get clients' requests. No reviews or bookings are
// made up. Barbers have initials, not faces.
//
//   create: node --env-file=.env.local [--env-file=.env.testdb.local] scripts/demo-shop.mts create [--live] <photo-dir>
//   remove: node --env-file=.env.local [--env-file=.env.testdb.local] scripts/demo-shop.mts remove [--live]
//
// The live database is touched only with --live. The owner's sign-in (to show
// Studio in a pitch) is written to .env.demo.local, which git ignores; it is
// never printed.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_GUIDE_KEYS } from "../app/lib/guideContent.ts";

const LIVE_REF = "rbsgsymjmptwczecgohb";
const SLUG = "northline-barber-co";
const EMAIL = (who: string) => `demo.northline.${who}@example.com`;
const BUCKET = "portfolio-images";

const BARBERS = [
  { who: "owner", name: "Malik Grant", bio: "Owner. Twelve years behind the chair; skin fades and sharp line-ups." },
  { who: "theo", name: "Theo Laurent", bio: "Scissor cuts, textured crops and longer styles." },
  { who: "dani", name: "Dani Okafor", bio: "Fades, designs and beard sculpting." },
  { who: "sam", name: "Sam Kowalski", bio: "Classic cuts and hot towel shaves." },
] as const;

const MENU = [
  { name: "Skin fade", price: 40, minutes: 45 },
  { name: "Classic cut", price: 35, minutes: 30 },
  { name: "Cut and beard", price: 55, minutes: 60 },
  { name: "Beard trim", price: 20, minutes: 20 },
  { name: "Kids cut (12 and under)", price: 28, minutes: 30 },
];

// Exchange District, Winnipeg: the area only, no street address.
const PLACE = { lat: 49.8994, lng: -97.1383, area: "Exchange District, Winnipeg", address: "Exchange District, Winnipeg, MB, Canada" };

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];
const live = args.includes("--live");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) fail("Supabase URL and service key are missing from the env files.");
const isLive = url.includes(LIVE_REF);
if (isLive && !live) fail("This is the live database. Add --live to confirm.");
if (!isLive && live) fail("--live was given, but this isn't the live database.");
const db = createClient(url, key, { auth: { persistSession: false } });
console.log(`Target: ${isLive ? "LIVE" : "test"} database`);

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) fail(`${label}: ${error.message}`);
  return data;
}

async function demoUsers() {
  const out: { id: string; email: string }[] = [];
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`listUsers: ${error.message}`);
    out.push(...data.users.filter((u) => u.email?.startsWith("demo.northline.") && u.email.endsWith("@example.com")).map((u) => ({ id: u.id, email: u.email! })));
    if (data.users.length < 1000) break;
  }
  return out;
}

async function remove() {
  const { data: studio } = await db.from("studios").select("id, is_demo").eq("slug", SLUG).maybeSingle();
  if (studio && !studio.is_demo) fail(`A real shop uses the link ${SLUG}; not touching it.`);
  if (studio) {
    const { data: files } = await db.storage.from(BUCKET).list(`studios/${studio.id}`);
    if (files?.length) await db.storage.from(BUCKET).remove(files.map((f) => `studios/${studio.id}/${f.name}`));
    for (const table of ["studio_photos", "membership_plans", "studio_members"]) await db.from(table).delete().eq("studio_id", studio.id);
  }
  const users = await demoUsers();
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await db.from("professional_services").delete().in("professional_id", ids);
    await db.from("professional_availability").delete().in("professional_id", ids);
    await db.from("profiles").update({ studio_id: null }).in("id", ids);
  }
  if (studio) await must("delete studio", db.from("studios").delete().eq("id", studio.id));
  for (const id of ids) {
    await db.from("profiles").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  console.log(`✔ Removed the sample shop${studio ? "" : " (none found)"} and ${ids.length} demo accounts.`);
}

async function create(photoDir: string) {
  if (!photoDir) fail("Give the folder with the photos (cover first, by name order).");
  if ((await demoUsers()).length) fail("Demo accounts already exist. Run `remove` first.");
  const { data: taken } = await db.from("studios").select("id").eq("slug", SLUG).maybeSingle();
  if (taken) fail(`The link ${SLUG} is taken. Run \`remove\` first.`);

  // 1. Accounts. Random passwords; only the owner's is kept (for pitches).
  const ids: Record<string, string> = {};
  let ownerPassword = "";
  for (const b of BARBERS) {
    const password = randomBytes(18).toString("base64url");
    if (b.who === "owner") ownerPassword = password;
    const { data, error } = await db.auth.admin.createUser({ email: EMAIL(b.who), password, email_confirm: true, user_metadata: { full_name: b.name, demo: true } });
    if (error || !data.user) fail(`createUser ${b.who}: ${error?.message}`);
    ids[b.who] = data.user.id;
  }
  const now = new Date().toISOString();
  await must(
    "profiles",
    db.from("profiles").upsert(
      BARBERS.map((b) => ({
        id: ids[b.who],
        email: EMAIL(b.who),
        full_name: b.name,
        role: "professional",
        professional_type: "barber",
        professional_types: ["barber"],
        bio: b.bio,
        username: `northline-${b.who}`,
        terms_accepted: true,
        terms_accepted_at: now,
        privacy_accepted: true,
        privacy_accepted_at: now,
        marketing_consent: false,
        welcome_tour_seen_customer: true,
        welcome_tour_seen_professional: true,
        onboarding_checklist_dismissed: true,
        guides_seen: ALL_GUIDE_KEYS,
        email_request_notifications: false,
        email_offer_notifications: false,
        sms_notifications_enabled: false,
        weekly_summary_opt_out: true,
        weekly_push_opt_in: false,
        time_zone: "America/Winnipeg",
        direct_booking_enabled: true,
        public_availability_enabled: true,
        service_modes: ["in_shop"],
        location: PLACE.area,
        city: "Winnipeg",
        formatted_address: PLACE.address,
        location_lat: PLACE.lat,
        location_lng: PLACE.lng,
        // Never verified: keeps them out of Explore, search and requests.
        verification_status: "unverified",
      })),
      { defaultToNull: false },
    ),
  );

  // 2. The shop.
  const hours: Record<number, [string, string][]> = { 2: [["10:00", "19:00"]], 3: [["10:00", "19:00"]], 4: [["10:00", "20:00"]], 5: [["10:00", "20:00"]], 6: [["09:00", "17:00"]] };
  const studio = await must(
    "studio",
    db
      .from("studios")
      .insert({
        name: "Northline Barber Co.",
        owner_id: ids.owner,
        slug: SLUG,
        is_demo: true,
        plan: "studio_plus",
        subscription_status: "active",
        subscription_current_period_end: new Date(Date.now() + 3650 * 86_400_000).toISOString(),
        tagline: "Sharp fades and classic cuts in the Exchange.",
        about:
          "A four-chair barbershop in the Exchange District. Skin fades, scissor work, beard trims and hot towel shaves, with a coffee while you wait. Book your barber, or pick Anyone for the soonest chair.",
        address: PLACE.address,
        area_label: PLACE.area,
        lat: PLACE.lat,
        lng: PLACE.lng,
        trades: ["barber"],
        phone: "204-555-0142",
        hours,
        amenities: ["Walk-ins welcome", "Card accepted", "Near transit", "Free Wi-Fi", "Drinks offered", "Kids welcome"],
        commission_percent: 40,
        pay_at_shop_enabled: true,
      })
      .select("id")
      .single(),
  );
  if (!studio) fail("The shop wasn't created.");
  await must(
    "team",
    db.from("studio_members").insert(
      BARBERS.map((b) => ({
        studio_id: studio.id,
        profile_id: ids[b.who],
        role: b.who === "owner" ? "owner" : "member",
        status: "active",
        arrangement: "commission",
        takes_clients: true,
        joined_at: now,
        ...(b.who === "owner" ? {} : { invited_by: ids.owner, commission_percent: 40 }),
      })),
    ),
  );
  await must("link team", db.from("profiles").update({ studio_id: studio.id, subscription_plan: "pro", subscription_status: "active", plan_source: "studio" }).in("id", Object.values(ids)));

  // 3. Menu and hours. Everyone does the core menu; kids cuts are Malik and Sam.
  await must(
    "services",
    db.from("professional_services").insert(
      BARBERS.flatMap((b) =>
        MENU.filter((m) => !m.name.startsWith("Kids") || b.who === "owner" || b.who === "sam").map((m) => ({
          professional_id: ids[b.who],
          service_name: m.name,
          price: m.price,
          duration_minutes: m.minutes,
          is_active: true,
          is_bookable: true,
        })),
      ),
      { defaultToNull: false },
    ),
  );
  const off: Record<string, number[]> = { owner: [2], theo: [6], dani: [3], sam: [] };
  await must(
    "hours",
    db.from("professional_availability").insert(
      BARBERS.flatMap((b) =>
        Object.entries(hours)
          .filter(([d]) => !off[b.who].includes(Number(d)))
          .map(([d, w]) => ({ professional_id: ids[b.who], day_of_week: Number(d), start_time: w[0][0], end_time: w[0][1], is_active: true })),
      ),
      { defaultToNull: false },
    ),
  );

  // 4. A membership plan to show on the page (it can't be joined).
  await must("membership", db.from("membership_plans").insert({ studio_id: studio.id, name: "Fade Club", description: "Two cuts a month, booked any time. Skip the wait for a chair.", price_cents: 6500, visits_per_period: 2, active: true }));

  // 5. Photos: the first (by name) is the cover; the rest are the gallery.
  const files = readdirSync(photoDir).filter((f) => /\.jpe?g$/i.test(f)).sort();
  if (!files.length) fail("No .jpg photos in that folder.");
  const urls: string[] = [];
  for (const [i, f] of files.entries()) {
    const path = `studios/${studio.id}/northline-${i}.jpg`;
    const { error } = await db.storage.from(BUCKET).upload(path, readFileSync(join(photoDir, f)), { contentType: "image/jpeg", upsert: false });
    if (error) fail(`upload ${f}: ${error.message}`);
    urls.push(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  await must("cover", db.from("studios").update({ cover_url: urls[0] }).eq("id", studio.id));
  const captions = ["", "The floor", "Corner chairs", "Tools of the trade", "The waiting area", "By the window", "The clipper wall"];
  if (urls.length > 1) {
    await must("gallery", db.from("studio_photos").insert(urls.slice(1).map((u, i) => ({ studio_id: studio.id, url: u, caption: captions[i + 1] || null, sort: i }))));
  }

  writeFileSync(".env.demo.local", `# Sample shop owner sign-in (${isLive ? "live" : "test"} database). Git-ignored; keep it private.\nDEMO_SHOP_EMAIL=${EMAIL("owner")}\nDEMO_SHOP_PASSWORD=${ownerPassword}\n`, { mode: 0o600 });
  console.log(`✔ Sample shop ready: /shop/${SLUG} (${files.length} photos, ${BARBERS.length} barbers). Owner sign-in saved to .env.demo.local.`);
}

if (cmd === "create") await create(args.filter((a) => !a.startsWith("--"))[1]);
else if (cmd === "remove") await remove();
else fail("Use `create <photo-dir>` or `remove`.");
