# LineUp site audit: report

Branch `site-audit` (from main at 17a65a2). Started 23 Nov 2026. Audit and fixes, Steps 1–6.

## Resume here

> **Step 9 done** (26 Nov, branch `site-audit`): a site-wide polish and wording pass. Every page was screenshotted as every role at 390 and 1280 (`SMOKE_SHOTS=dir npm run test:smoke -- e2e/smoke.spec.ts`) and gone through by eye. See "Step 9" at the end.
>
> **Step 8 done** (26 Nov, merged as PR #14): shop profiles like a business listing (cover, logo, photos, about, hours, contact, amenities) with **shop reviews**, a rebuilt public shop page, earnings over time against the period before (by service, weekday, tips, how clients paid, CSV), and a Services card in pro and shop Analytics. See "Step 8" at the end. Migration `20261127_shop_profile_reviews.sql`: applied to LineUp Test, then live (26 Nov, Noah OK'd).
>
> **Step 7 done** (26 Nov, merged as PR #13): first-run guidance for clients, pros and shops (tours, getting-started checklists, a tip on every main page, a Help page), Geist restored site-wide, the profile page's start-up cut from ~625 ms to ~110 ms, no title jump on the landing page. See "Step 7" at the end. Migration `20261126_guides_seen.sql` is applied to LineUp Test and live.
>
> **Step 6 and the decisions after it done** (25 Nov; merged to main as PR #12). Every page measured is faster or the same in real load time; Discover on live data 37 s → 4 s, landing 13.6 s → 4.5 s. Offer price check and the RLS speed-up are live. No charge without a booking; Studio hydration error fixed. **Next (Noah):** three settings at the end (Preview keys, BLIK, test key) and the customer-email call.
>
> To test (on the TEST database): `npm run testdb:seed`, then either `npm run dev:testdb` or a production build (`npm run build:testdb && npm run start:testdb`, port 3200), run `npm run test:smoke` (with `SMOKE_BASE_URL=http://localhost:3200` for the production build; add `STRIPE_FORWARDING=1` with `stripe listen` for payment flows), then `npm run testdb:cleanup`. Speed: `e2e/tools/lighthouse.mjs`, `e2e/tools/cls.mjs`, `e2e/tools/shots.mjs`. Nothing touches the live database.

## What was set up and tested this session

| Item | Result |
|---|---|
| `site-audit` branch from origin/main; unmerged branches listed (`admin-comp`, `polish-and-speed-pass`, `promo-code-reels`) | ✅ pass |
| `docs/audit/FEATURES.md`: every page, API, cron and component group, with flags | ✅ written (from the code; 3 parallel readers plus a schema check) |
| Test tools: Vitest 3.2.4; Playwright 1.56.1 added (Noah OK'd) | ✅ `npm run test:smoke` |
| `scripts/test-data.mts` seed / cleanup / check (TEST prefix, example.com emails, no Stripe calls, notifications off, refuses live DB without the OK value, refuses live Stripe keys) | ✅ written. tsc and lint clean |
| `tests/audit/testData.test.ts`: guard and TEST-email unit tests | ✅ 6/6 pass |
| Seed → check → cleanup on the live database (Noah OK'd 23 Nov) | ✅ pass after one fix: bulk inserts now use column defaults. Cleanup left 0 TEST rows |
| `e2e/routes.ts`: 70 page visits across public, customer, Basic pro, Master pro, owner (every Studio section), manager, member, admin | ✅ written |
| Playwright smoke spec (desktop 1280 + phone 390) | ✅ ran: 122/150 passed; results below |
| Logged-out smoke pass, 40 routes × desktop + 390px, with a throwaway headless Chrome (`e2e/smoke-public.sh`) | ✅ ran; results below. Raw output in `docs/audit/smoke/` |
| `npm test` | ✅ 109/109 pass (8 files) |
| `npm run lint` | 51 errors, the same as the old baseline (excluding untracked `.claude/skills`); none added |
| `npx tsc --noEmit` | ✅ clean |
| `npm run build` | ✅ pass |

## Smoke results so far (logged out, local dev, 23 Nov)

Every public page loaded at 1280 and 390, with real content and no Next.js error overlay. The 404 page works. Most private pages correctly show the login screen ("Welcome back."). The exceptions are below. Logged-in pages are **not tested yet** (they need the seed).

| Route | What happened (both widths unless noted) |
|---|---|
| `/services` | Blank: navbar only, no redirect to login |
| `/chairs` | Stuck on "Loading …", no redirect to login |
| `/earnings` | Page heading and intro text, but no data and no login prompt or redirect |
| `/admin` | Blank (25 chars) for a logged-out visitor. Expected that non-admins see nothing, but there's no message or redirect |
| `/requests/new`, `/onboarding`, `/subscription`, `/analytics`, `/archive` | Blank or shell on the first (cold-compile) desktop run, then redirected to login at 390. Probably slowness rather than a missing guard. Recheck in Playwright |
| `/studio/join` (no token) | "This invite link is incomplete." Fine |
| Many pages (`/faq`, `/contact`, `/shop/*`, `/reset-password`, `/analytics`, `/archive`, `/subscription`, `/requests`) | Console warning: `@supabase/gotrue-js: Lock "lock:sb-…-auth-token" was not released within 5000ms` (intermittent). Several Supabase clients or getSession calls are competing for the auth lock, which can add 5 s to a page |
| `/` | Console: next/image warnings. A `fill` image has `sizes="100vw"` but isn't full width (2 images), and an LCP image (`04-offers-compare.png`) should be `loading="eager"` |
| `/discover` | Console: "Geolocation failed: PERMISSION_DENIED", logged with console.error. Expected when location is refused, but it shouldn't log as an error |
| `/shop/*`, `/profile/*` | Stripe.js "HTTP" warning. Local dev only, ignore |

## Logged-in smoke results (Playwright, 23 Nov, TEST data on live DB, local dev)

First full run: **122 of 150 passed**. Failures were re-run on a fresh dev server. "Env" means caused by the overloaded machine (sign-in or browser timeouts), not by the page.

| Viewer and page | Result | Bucket |
|---|---|---|
| public and customer `/discover` | **Fails.** Refused location is logged with `console.error("Geolocation failed…")`, which Next dev counts as an error (red badge) | Broken (minor) |
| customer `/work` | **Fails.** A customer stays on `/work` instead of being sent to `/requests` | Broken |
| public and customer `/shop/[slug]`, public and master `/profile/[id]` | **Slow.** Still loading after 15 s (desktop, dev) | Slow |
| basic `/analytics` | Console 402 from an analytics API for a Basic pro; the page itself renders | Unpolished (expected 402, shouldn't log) |
| owner `/studio/settings` | Blank (15 chars) and slow in the re-run | Broken? (re-check in the Studio pass) |
| customer and master `/regular/[id]` | 500 in run 1, **passes** on a fresh server (Turbopack crash) | OK |
| Owner, manager and member Studio pages, phone-390 | Many timed out or were skipped (env) | Re-check in the Studio pass |
| Every other customer, Basic, Master, owner and admin page | Pass on desktop and 390px (no HTTP error, not blank, no console error) | OK |

Raw results: `test-results/smoke.json` (git-ignored; regenerated each run).

## Problems found so far, by area

Sorted as **Broken / Slow / Looks unpolished / Confusing wording**. "Code:" means it was spotted while reading the code, not yet seen in a browser.

### Public
- Broken: none seen.
- Slow: supabase auth-lock 5 s stalls (see above). `/beauty/winnipeg` took 4.9 s on a cold compile (dev only; recheck on a production build).
- Fixed 24 Nov: landing hero downloads one crop; screenshot `sizes` corrected.
- Confusing wording: none seen yet.

### Customer
- Fixed 24 Nov: logged-out customer pages now go to login with `?next=`; `/refer` sends customers to their requests.
- Slow: auth-lock stalls on `/requests`.
- Looks unpolished: to check once seeded.
- Confusing wording: to check once seeded.

### Pro
- Fixed 24 Nov: every Pro page sends logged-out visitors to login with `?next=` (`/services`, `/chairs` and `/earnings` included). One role check for every Pro page (`app/lib/proAccess.ts`): `shop` accounts go to their studio page instead of passing the earnings, analytics and calendar checks. The schedule-plan check is shared (the payment-intent copy is left alone; it's payment code).
- Fixed 24 Nov: a Basic pro's `/analytics` no longer logs a 402 (no plan is now a normal 200 with `needsPlan`).
- Fixed 24 Nov: 44px tap targets on phones on every Pro page; desktop sizes unchanged. Plain-English error messages. Offer prices checkout can't read ("55-60") are refused before they're sent.
- Looks unpolished (left): the Analytics "busy hours" heatmap cells are 24px. It's a dense chart, so they stay; tapping one only shows a label.
- Slow: auth-lock warnings show on `/analytics` too ("Lock … was released because another request stole it", from `useVerificationState` → `getUser()`). Same cause as the Slow list below.

### Studio
- Checked 24 Nov: `/studio/calendar` has no page guard for members, but it's intended. The schedule API gives members only their own column, so they see just their own bookings. Left as is.
- Checked 24 Nov: owner `/studio/settings` (blank in the first smoke) loads at 1280 and 390.
- Fixed 24 Nov: logged-out visitors return to the Studio section they opened. 44px tap targets on phones (tabs, icon buttons, menus, chips, team picker, links; switches get a 44px invisible hit area); desktop unchanged. "Something went wrong" replaced with what happened.

### Admin
- Fixed 24 Nov: logged-out visitors go to login and back to `/admin`; non-admins are sent to their account (no blank page, no back-button loop). 44px controls on phones; "..." toggles read "Saving…"; no star glyph.
- Checked 24 Nov: all three unused newsletter routes require admin (session or `x-admin-key`), so nothing is exposed. They're still extra ways to email the real list (decision below).
- Code (risk): the admin Newsletter POST and the legacy `/api/send-newsletter` email the **whole real list**. Three admin newsletter routes have no UI caller (`send-newsletter`, `send-newsletter-test`, `newsletter-audience`), and `newsletter-audience` returns every subscriber's email.

### Money, notifications and crons
- Fixed 24 Nov: email off-switch (`EMAIL_DISABLED=1`) and TEST addresses are never sent (see Decisions, money pass #2). Before this, any flow that emailed really sent via Resend. SMS is off because the Twilio vars are unset. Push is on wherever VAPID is set.
- Code: the auto-complete cron makes real Connect transfers in whatever mode the keys are in. Locally the keys are `sk_test_`. Check production with `GET /api/health/payments`.
- Code: the `completion-nudges` cron also runs every ~15 min from GitHub Actions, as well as daily on Vercel.
- Checked 24 Nov: every cron, the internal booking-confirmed route and the Stripe webhook refuse callers without the secret or signature (locally and on the preview). `isCronAuthorized` fails closed when `CRON_SECRET` is missing.
- Checked 24 Nov: payments health. Production uses **live** keys that match, webhook secret set, all 5 plan prices set. Previews use **test** keys that match, but the Apprentice, Pro and Master price ids are **missing on previews** (plan checkout can't be tried there). Locally the Studio and Studio Plus price ids are missing.
- Code: 6 routes call Resend directly instead of `sendEmail` (studio clients, contact, pro import, admin newsletter, both legacy newsletter routes), so a kill-switch in `sendEmail` alone wouldn't stop them. `sendEmail` also ignores Resend's `{ error }` result, so a failed email is silent.
- Code: the Studio plan says "0% LineUp commission on your own clients", and the code passes the card fee through at cost (2.9% + 30¢) on those bookings. True, but a pro could read 0% as "nothing taken". Pricing text, so not changed.

## Decisions needed from Noah (customer & public pass)

1. **Charge without a booking** (Broken, payments): if a pro has no location saved, the customer's card is charged and the webhook then fails with "Professional location is missing", so no booking is made. `create-payment-intent` should refuse before charging. Payment code, so not changed.
2. **Apple Pay is off**: Stripe says the domain isn't registered for Apple Pay (Stripe dashboard → Payment method domains). Google Pay needs HTTPS too; check on the live site.
3. **Gift card purchase can't be tested**: the TEST shop needs a Stripe test-mode payout account, and creating one needs the Connect platform profile filled in (dashboard.stripe.com/settings/connect/platform-profile).
4. **After a 3D Secure / redirect payment, customers return to `/work`** (their Bookings tab) instead of their request (`RequestDetailPageClient.tsx` `return_url`). Payment code, so not changed.
5. ✅ *Done in Step 6 (25 Nov): /news and LineUp Picks now use Geist.* ~~**/news uses a serif display face** (Instrument Serif, a deliberate "newspaper" look); the brand rules say no serif display. Swapping it changes that page's design, so it's your call.
6. **Customer emails**: the rule is "customers get push, not email", but customers are emailed for booking confirmed, new offer, reminders, review requests, regular-appointment confirmations and rebook nudges (list in FEATURES.md › Notifications). Removing them is a product change.
7. **Logged-out heart**: Discover/profile hide the heart when logged out (no "log in to save" prompt). Showing it would be a small new behaviour.

## Decisions needed from Noah (pro pass)

1. ~~TEST seed~~: Noah OK'd it on 24 Nov; logged-in checks done. A separate test Supabase project would still make this safer.
2. **Offer price is free text** in the database (`request_offers.proposed_price`). The form now refuses what checkout can't charge, but the DB and API still accept it (e.g. an offer edited elsewhere). A numeric `proposed_price_cents` column would close it for good. Needs a migration, so not done.
3. **Heatmap cells on Analytics are 24px** on phones. Bigger cells would change the chart's design. Left as is.
4. ✅ **Connect payout setup tested (24 Nov)**: the sandbox's Connect setup is complete; pro onboarding, the status badge, a pro gift card and plan checkout all run in test mode. Stripe's onboarding form has an hCaptcha, so that step needs a person each time.

## Decisions needed from Noah (studio pass)

1. ✅ **Invites tested (24 Nov)**: TEST invitees use example.com, which the mailer never sends to; invite → join, client invite and verification are covered by `e2e/invites-flow.spec.ts`. Fixed on the way: a failed invite email used to say "Invite sent" with no link (Resend returns errors instead of throwing); now the owner always gets the share link when the email didn't go.
2. **Setup and Studio billing** need Stripe Checkout in test mode for a shop with no plan. Needs the same Connect platform-profile step as pro payouts (pro pass #4).

## Decisions needed from Noah (admin pass)

1. **Remove the three unused newsletter routes** (`/api/send-newsletter`, `/api/send-newsletter-test`, `/api/newsletter-audience`). They're admin-only, but each is another way to email or list the real subscribers, and nothing in the app calls them.
2. ✅ **Verification approve/reject tested (24 Nov)** with a TEST submission inserted by the test; emails skipped.
3. **Admin moderation lists show real people's content** (requests, reviews, messages). Fine for an admin, but it means automated tests can only look, not delete. A TEST-only filter would let delete be tested.

## Decisions needed from Noah (money, notifications, crons)

1. ✅ **Test Supabase project created (24 Nov, Noah's OK, free plan $0/month):** "LineUp Test" (`zfxeymtuwrjtccxqymrj`, ca-central-1), an exact copy of the live schema (47 tables, 286 constraints, 138 indexes, 7 triggers, 15 functions, 84 + 23 policies, 7 buckets), no real data. Settings in git-ignored `.env.testdb.local`; add `--env-file=.env.testdb.local` after `.env.local` to point a script at it, or copy it to `.env.development.local` for the dev server. **Your steps:** point Vercel Preview at it (its URL, anon key and service role key) so previews stop using live data; and remember new migrations must be applied to both projects. The live project is on Supabase's free plan, which fits today's stall.
2. ✅ **Done 24 Nov (Noah chose it): email off-switch.** `app/lib/mailer.ts` is now the only Resend client; `sendEmail` and the 6 routes that called Resend directly go through it. `EMAIL_DISABLED=1` sends nothing; reserved test domains (`example.com`, `*.test`, …) are always dropped, so TEST accounts never reach Resend; Resend's `{ error }` is logged. *tests/money/mailer.test.ts 6/6; checked in the running app: with `EMAIL_DISABLED=1` the contact form answered OK and logged `[email] skipped`, nothing sent.* **Your call:** set `EMAIL_DISABLED=1` for **Preview** in Vercel (and in `.env.local` if you like), never for Production. Note: with the switch on, studio client invites are still marked "invited" even though nothing went out.
3. **Preview env vars** (your step): add the 3 test price ids now in `.env.local` (`NEXT_PUBLIC_STRIPE_{APPRENTICE,PRO,MASTER}_PRICE_ID`) to Vercel **Preview**, so plan checkout works there too. Studio price ids are still missing locally.
4. **Studio plan wording**: "0% LineUp commission on your own clients". Consider adding "(card fee at cost)" so it matches what the code takes. Pricing text, your call.
5. **The booking cap is written out three times** (two in payment code). A test now catches drift; moving it into one shared function is a small payment-code change for you to OK.

## Decisions needed from Noah (24 Nov, Stripe test runs)

1. **Seen once, not reproduced: a paid plan came back with an empty plan.** In one run, after a TEST pro paid for Apprentice, the profile had `subscription_status = active` but `subscription_plan = null`, so the app treated them as Basic and hid "Manage billing". The subscription in Stripe had the right Apprentice price and user, the dev server had the right price ids, and every webhook returned 200. Two retries set the plan correctly. If a real pro ever reports "I paid but I'm still on Basic", this is the likely cause; worth a log line in the webhook's checkout handler recording the price id and the plan it mapped to (payment code, so not changed).
2. **BLIK shows up in the card-hold form** (a Polish payment method, offered to Canadian clients). It comes from the payment methods turned on in Stripe; turn BLIK off under Settings → Payment methods unless it's wanted.
3. **Reusable TEST shop payout account**: `TEST_SHOP_STRIPE_ACCOUNT` in `.env.test.local` (a Stripe test-mode account, onboarded 24 Nov) lets the seed sell memberships and gift cards without redoing Stripe's form. Keep it; delete it in Stripe only if you stop testing.

## Incident: live database stalled (24 Nov)

From about 18:42 UTC the live Supabase database stopped answering: API requests got 522/504, Postgres logged no checkpoints and no errors, and the project still showed "healthy". Noah restarted it around 20:10 UTC and it came back (reads under 1 s). The stall began right after a TEST cleanup, while the test runs had been sending roughly 300–500 requests per 5 minutes on top of real traffic; a silent stall like this usually means the instance ran out of memory or disk I/O. After the restart, Supabase's own stats queries still took 10–15 s. **Decisions:** check Reports → Database (memory, disk I/O, disk size) around 18:40 UTC and consider one compute size up; and move logged-in testing to a separate Supabase project (money pass decision #1) so tests never load the live database.

## Decisions (scheduled jobs, 24 Nov)

1. **Weekly summary subject** for a pro with nothing last week but bookings ahead reads "Your week: $0 from 0 appointments". Leading with what's booked would read better. Email wording, your call.
2. **Rotate the test project's secret key** at some point (it was pasted in chat); it only reaches the test database.

## Done: RLS speed-up migration applied to live (25 Nov)

**Applied to live on 25 Nov with Noah's OK.** Live now has 79 policies (was 84), the per-row `auth.uid()` warnings went from 71 to 0, and 30 overlapping-rule warnings are left, the same as LineUp Test. Afterwards the preview's read-only checks passed against the live database (76 passed, 12 skipped).

### Background

Supabase's advisors on the live project: **71 policies re-check `auth.uid()` on every row** and 35 tables have overlapping policies (several exact duplicates), which makes ordinary reads much heavier on the free-plan database that stalled on 24 Nov. `supabase/migrations/20261125_rls_policy_performance.sql` keeps every rule the same but: drops 5 exact-duplicate policies, rewrites 66 to `(select auth.uid())` (evaluated once per query), and pins `search_path` on 6 trigger functions. **Tested on LineUp Test only**: per-row warnings 71 → 0, duplicate warnings 35 → 30 (the rest are genuinely different rules), and the whole suite still passes there (smoke 150/150 at 1280 + 390, all flow specs, logged-out + guards + checkout 77/77). **To apply:** paste the file into the live project's SQL editor (it runs in one transaction) or run it with the Supabase CLI. Not done by me: it's a live database change.

Other advisor findings, not changed: 53 foreign keys without an index (slower deletes and joins), 14 unused indexes, leaked-password protection off (Auth → Settings), the studio helper functions are callable by anyone (they only answer "is this user on that studio"), and 3 extensions sit in the `public` schema.

## Step 6: speed, consistency and wording (25 Nov)

### How it was measured
Lighthouse 12 (mobile: slow 4G, 4× slower CPU), performance only, median of 3, on production builds (`npm run build:testdb && npm run start:testdb`) against **LineUp Test**. "Before" is the build of c9a94fe (the start of this step), "after" is this branch. Logged-out pages: cold cache, like a first visit. Signed-in pages: signed in as the TEST user through the real login form, warm cache, like a returning user. Tools: `e2e/tools/lighthouse.mjs` (scores), `e2e/tools/cls.mjs` (what moves, and the real LCP under the same slow 4G + CPU), `e2e/tools/shots.mjs` (screenshots at 390 and 1280). LineUp Test has almost no photos, so the photo savings show most on the Vercel preview, which has live data (table further down).

### Logged out, first visit (phone)
| Page | Score | LCP (main content) | Layout shift (CLS) | Main thread blocked | Downloaded |
|---|---|---|---|---|---|
| Landing `/` | 59 → **74** | 14.5 s → **7.7 s** | 0 → 0 | 531 → **46 ms** | 6.8 MB → **1.1 MB** |
| Discover | 69 → **89** | 3.8 s → 3.8 s | 0.308 → **0.001** | 205 → **40 ms** | 2.1 MB → **0.4 MB** |
| Pro profile | 53–55 → **71** | 12.3 s → **4.1 s** | 0 → 0.001 | 839–969 → **620 ms** | 2.1 MB → **0.4 MB** |
| Shop page | 71 → **91** | 12.2 s → **3.5 s** | 0.004 → 0.001 | 228 → **44 ms** | 2.1 MB → **0.4 MB** |

### Signed in, returning visit (phone)
Both builds measured back to back (25 Nov). Two numbers for the main content: Lighthouse's simulated LCP, and the real LCP measured in Chrome at the same phone speed (slow 4G, 4× slower CPU) with `e2e/tools/cls.mjs`.

| Page | Score | LCP, Lighthouse simulated | LCP, measured | Layout shift (CLS) |
|---|---|---|---|---|
| Customer Home `/requests` | 84 → 82 | 4.1 → 4.8 s | 0.75–0.80 s (then a late panel at 2.4 s) → **0.56–0.70 s** | 0.085 → **0.001** |
| Customer Bookings `/work` | 80–100* → 80 | 1.9–4.9* → 5.4 s | 0.66–0.71 → 0.59–0.75 s (same) | 0.001 → 0.001 |
| Pro Home `/requests` | 67 → **78** | 4.5 → 5.0 s | 0.5–1.2 s | 0.337 → **0.112** (0.002 measured at 390) |
| Pro calendar | 84–86 → 83 | 4.3 → 4.7 s | 0.5 s | 0.001 → 0.001 |
| Studio Today | 91–92 → 91 | 3.3 → 3.5 s | — | 0.001 → 0.001 |

\* The old build's `/work` scored 100 in one run (59 KB: it was served from cache) and 82 in another.

**Honest read:** the visible jumps are gone and real load times are the same or faster, but Lighthouse's *simulated* LCP on signed-in pages is 0.2–0.7 s higher than before. Their scripts are ~10 KB bigger now that they share the UI kit, and Lighthouse's model counts every Supabase round trip the browser makes after the page arrives. See the decision below about loading their data on the server.

### On the Vercel preview, live data (phone, first visit)
Old preview (c9a94fe's code) vs this branch's preview (43246bb), both on the live database, logged out, read only.

| Page | Score | LCP | Downloaded |
|---|---|---|---|
| Landing `/` | 61 → **68** | 13.6 s → **6.7 s** | 3.8 MB → **1.1 MB** |
| Discover | 52 → **80** | 37.1 s → **4.1 s** | 11.0 MB → **0.54 MB** |

Discover's photos now arrive as AVIF at 4–30 KB each (they were 0.4–3.7 MB originals); none broken. Preview read-only checks (guards, admin, studio, pro, customer at 1280 + 390): **76 passed, 12 skipped**.

### What was fixed (each its own commit, with a test)
- ✅ **Favicon**: a 3628px, 1.6 MB PNG loaded on every page; now 96px, 5 KB. *tests/speed/assets.test.ts.*
- ✅ **Uploaded photos** (Discover, profiles, shops, requests, local pages, Studio avatars) go through a shared `Photo` component: the same `<img>` and classes, but served resized as AVIF/WebP by `next/image` instead of the 2–4 MB originals. Only LineUp's own Storage URLs (live and TEST) are resized; anything else shows as before. *tests/speed/photo.test.ts.*
- ✅ **Landing**: GSAP (~110 KB) loads after the first paint; the tour and closing videos (3 MB + 1 MB) load when you get near them instead of on page load; the hero photos are fetched first.
- ✅ **No jumps**: Discover's Spotlight holds its space before its random draw (0.308 → 0.001); the shop page's "Soonest openings" keeps its place while times load (0.109 → 0.001); the pro Home "this is you in Explore" card now arrives with the page from the server (0.336 → 0.002 measured at 390). *tests/speed/browsePreview.test.ts.*
- ✅ **Fewer round trips**: the pro Home's browser refresh runs its six queries together instead of one after another (same queries, same rules).
- ✅ **Shared kit** `app/components/ui.tsx` (Studio's controls, now app-wide; `studio/ui.tsx` re-exports it): `Button`/`buttonClass`, `fieldClass`/`textareaClass`/`Field`, `panelClass`, `EmptyState`, `Tag`, `Avatar`, `SkeletonRows`, `TONE` (attention/info/success) and `TITLE` (customer/pro/detail page titles). 82 hand-rolled buttons and 47 fields moved onto it; one-off 22/24/28px corners are now `rounded-3xl`; Customer page titles share one size, Pro/Studio/Admin another. *tests/pro/consistency.test.ts.*
- ✅ **Loading**: skeletons on the 8 routes that had none (booking, shop, earnings, analytics, services, subscription, admin, studio); placeholder rows instead of bare "Loading…" text.
- ✅ **Motion**: `ease-arrive` was never a Tailwind token, so its 61 uses did nothing; fixed. Feedback and page entrances are now role-aware: Pro 120/180 ms, Customer 180/280 ms. *tests/pro/motion.test.ts.*
- ✅ **Monochrome**: no orange, amber, yellow or green left (about 50 uses); warnings use signal red, success is ink. LineUp Picks and News use Geist instead of a serif display face. *tests/pro/palette.test.ts.*
- ✅ **Wording**: "pro" instead of "professional" on screen (about 40 places; the Terms, the CRA form name and the "licensed / certified professional" credential keep the word), "booking" instead of "job", "shop" instead of "studio" for the business (the product name Studio stays), sentence case, and plain errors ("We couldn't load this booking. Try again.") instead of 28 "Something went wrong". No prices, numbers, plan names or rules changed.

### Step 6 tests (25 Nov, production build on LineUp Test, fresh seed per group)
- Smoke, every page as each TEST user at 1280 and 390: **150/150**.
- Whole suite in one run: 250 passed, 75 skipped (Stripe forwarding / phone-only), 9 failed. Six were the smoke pages that need the seeded open request and booking, and two flows that need the same request: one spec earlier in the run (`more-flows`) uses them up. Each on fresh seed data: smoke 150/150, `pro-flow` 6/6, `shop-desk-flow` 4/4.
- Found by the suite and fixed: buttons that were 44px tall at every width (e.g. "Edit request") had become 32px on desktop after moving to the shared kit; they keep `min-h-11` now.
- **Flaky, not from Step 6:** `shop-booking-flow` "member books with their membership" passed 2 of 4 runs. When it fails, Stripe's card form has opened its optional "Save my information for faster checkout" (Link) panel and wants an email and phone. Step 6 didn't touch the card form. The two gift card tests now skip without `stripe listen` (their thanks page waits for the webhook).
- `npm test` **192/192** (new: speed, photo, browse preview, motion, palette, consistency). `npx tsc --noEmit` clean. Lint: 50 errors in the app, the same as before (`npm run lint` also counts 15 in the untracked `.claude/skills/`). `npm run build` passes.
- Looked at by eye at 390 and 1280 (screenshots as customer, Basic pro, shop owner and logged out): no sideways scrolling on any page; same buttons, fields, cards and titles across Customer, Pro and Studio.

### Decisions for Noah (Step 6)
- **Image resizing runs on Vercel's image optimizer.** On the Hobby plan that has a monthly limit on source images. Uploaded photos (avatars, banners, portfolios) now count towards it. The alternative is Supabase's own resizing, which needs Supabase Pro.
- **Landing hero cutouts as AVIF** would save about 440 KB more on a first visit. Once, locally, the AVIF encode of those transparent images hung for over 60 s; it didn't happen again, so they stay as the original WebP for now. Worth trying on a preview.
- **Signed-in pages and Lighthouse's 2.5 s target.** Measured directly at the same phone speed, the main content shows in 0.5–1.2 s (pro calendar 0.5 s, pro Home 0.5–1.2 s). Lighthouse's simulation puts them at 4–5 s because each page loads its data from the browser after the page arrives (one Supabase round trip after another). Getting the simulated number under 2.5 s means loading each page's data on the server like `/requests` already does: a bigger change per page.
- **Profile page** still blocks the main thread for ~600 ms while React sets up its 3,400-line component. Splitting it (booking, gallery and reviews loaded when needed) is its own piece of work.
- **Studio pages log a React hydration error (#418)** on every load, on the old build too (not new). The page works; worth tracking down.
- **Video files**: `post-a-request.mp4` is 3 MB and isn't encoded for streaming, so a phone that does reach the tour downloads all of it. Re-encoding it smaller (and with "faststart") would help.

## Slow (found in Steps 2–4; all handled in Step 6 above)
- ✅ Fixed 24 Nov: Stripe.js loaded on every `/profile` and `/shop` visit. It now loads the first time a payment or card form opens (`app/lib/stripeClient.ts`, `@stripe/stripe-js/pure`). Measured on Vercel preview builds at 390px, logged out, median of 3 (`e2e/tools/speed.mjs`): `/profile` 15 → **0** Stripe requests, quiet 3.1 s → **2.8 s**; `/shop` 8 → **0**, quiet 1.9 s → **1.6 s**. *tests/speed/stripeClient.test.ts.* Paying still works (24 Nov, with the seed): request → accept → pay with a test card succeeded in Stripe test mode, and the regular's payment sheet loads Stripe's card form when opened. *e2e/customer-flow (3 steps).* Webhook → booking re-run the same day after Noah's `stripe login`: with `stripe listen` forwarding, `payment_intent.succeeded` returned 200 and the booking was created (`STRIPE_FORWARDING=1`, 2/2). `.env.development.local` deleted afterwards.
- ✅ Re-measured 24 Nov on a production build (Vercel preview, 390px): `/profile` shows its heading in ~0.8 s and `/shop` in ~0.7 s. The 15 s was a cold dev compile plus Stripe telemetry (fixed above).
- Partly fixed 24 Nov: auth lock warnings ("Lock … was not released / stole it"). The worst one, `useVerificationState` calling `getUser()` on every Pro page (it holds the lock for a network round trip), now reads the stored session and can't throw an uncaught lock error. `getUser()` is left in two button handlers (shop booking lookup, leaving a review), where it isn't on page load. Re-checked with the seed: Basic and Master Pro smoke 42/42 at 1280 + 390 with no console errors (lock errors included), and `/profile` at 390, which used to time out, now passes.
- ✅ Checked 24 Nov, no change: RequestDetailPageClient calls `getSession()` in 6 button handlers (cancel, accept, pay, review…), once per click. It reads the stored session and only goes to the network when the token has expired, which it has to do then anyway. Not a speed problem, and it's payment-page code, so left alone.

## Checklist (from FEATURES.md)

Tick an item when it has been clicked through on desktop and at 390px as the right user, with no errors. ⚠ = sends or moves money, so test only with TEST accounts and Stripe test mode.

### Public  (customer & public pass, 23–24 Nov)
- [x] Landing `/`: only the hero crop that fits the screen downloads; phone screenshot sizes fixed. *e2e/customer.spec.ts (1280 + 390) + smoke*
- [x] About, FAQ, Privacy, Terms, Contact page: load clean at 1280 and 390. *smoke* (Contact **send** not tested: it emails the team)
- [x] News list and issue: load clean. *smoke* (decision: serif display font, see below)
- [x] Beauty hub, city, city+trade. *smoke*
- [x] Discover: refused location isn't a console error; 44px clear-search; lazy avatars. *customer.spec + smoke*
- [x] Shops directory: load error now says so. Shop page loads. *customer.spec + smoke* (booking at a shop not tested end to end)
- [x] Pro profile: loads; heart saves. *customer-flow + smoke*
- [~] Gift cards: balance and thanks pages tested (thanks no longer claims a payment without one); offline checkout button fixed. **Purchase not tested**: TEST shop needs a Stripe test payout account (decision 3).
- [x] Login redirects: logged-out customer pages return to the same page after login. *customer.spec*
- [ ] Sign-up of a brand-new account through the UI: not run (would create a real auth account and send a confirmation email). Location requirement confirmed in code (onboarding/page.tsx:158).
- [x] Unsubscribe page loads. *smoke* (not submitted)

### Customer
- [x] Requests home and Bookings (`/work`, the customer's Bookings tab). *smoke 1280 + 390*
- [x] New request with photos: HEIC without a type accepted, converted before preview, a bad photo reported without dropping good ones, 44px Remove. *customer-flow (direct request so no real pro is notified) + unit tests*
- [x] Request detail: compare offers, accept, tip step, pay with Stripe test card → booking created via webhook. Payment sheet no longer slides under the navbar. *customer-flow, with `stripe listen` forwarding*
- [x] Booking chat: own message shows straight away, no send mid-IME, 1000-char cap, friendly errors. *customer-flow*
- [x] Review: errors stay in the modal, duplicate handled, clear thanks. *customer-flow*
- [x] Saved pros heart; Saved pros card tap targets. *customer-flow + smoke*
- [x] Regular `/regular/[id]`, Account, Archive: load clean. *smoke* (paying the next visit / deleting the account not run)
- [x] Refer: customers are sent to their requests (it's a pro feature). *customer-flow*
- [x] Push nudge: 44px dismiss, lucide icon; push toggle error readable. *smoke* (no push sent)
- [x] Edit and cancel a request, cancel a booking (24 Nov): title edit saved; request cancelled; booking more than a day out cancelled by the customer, nothing to refund. Buttons now 44px ("Edit request" / "Cancel request" were ~28px). *e2e/more-flows.* Shop booking (24 Nov): a member books with their membership and a pay-at-shop client books with "Pay at the shop"; both hold a Stripe test card (SetupIntent, nothing charged) and the booking is made. *e2e/shop-booking-flow 3/3.* Buying a membership: customer joins with a test card on Stripe Checkout, the membership turns on via the webhook, and "Manage card or cancel" opens Stripe's billing portal. *e2e/memberships-flow.*

### Pro  (pro pass, 24 Nov)
Logged-out: `e2e/pro.spec.ts` (12 pages, 1280 + 390). Phone layout: every page below was measured at 390px read-only in a real signed-in Studio pro account (no saves): no control under 44px, no sideways scroll. Logged in (Noah OK'd the seed, 24 Nov): Basic, Master, owner and member Pro smoke routes 76/77 at 1280 + 390 (the one left is `/profile` at 390, slow, see Slow), and `e2e/pro-flow.spec.ts` 6/6. Seed → cleanup → check left 0 TEST rows.
- [x] Work dashboard, withdraw offer (two taps), 44px buttons, clearer errors. *pro.spec + pro-flow + smoke 1280/390.*
- [x] Respond to request ⚠: login redirect; shop accounts go to studio requests; "55-60" refused with no offer saved. *pro.spec + offerPrice test + pro-flow + smoke.* Actually sending an offer not run: it emails the customer.
- [x] Calendar: login redirect with `?next=`, shop → `/studio/calendar`, 44px month buttons. *pro.spec + 390 measure + desktop look.* ICS feed and regulars not clicked.
- [x] Services and hours: login redirect (was blank), 44px pills, jump links, day rows and switches. *pro.spec + tapTargets test + 390 measure.* No saves made.
- [x] Earnings: login redirect, shop → `/studio/earnings`, 44px tabs and links. *pro.spec + 390 measure.* Statement PDF and entries not created.
- [x] Analytics: no console 402 for Basic; shop → `/studio/analytics`; 44px period and CSV buttons. *pro.spec + 390 + desktop.* Win-back ⚠ not sent.
- [x] Import: login redirect, 44px file buttons. *pro.spec + 390 measure.* No import run.
- [x] Chairs: login redirect (was stuck on Loading). *pro.spec + 390 measure.* Apply ⚠ not run (emails a shop).
- [x] Subscription: login redirect with `?next=`, shop → `/studio/settings`, 44px buttons. *pro.spec + 390.* Checkout and boosts ⚠ not run.
- [x] Verification: login redirect with `?next=`, clearer upload error. *pro.spec + 390.* Upload ⚠ not run (emails admins).
- [x] Refer, Gift cards (seller): login redirect, 390 clean. *pro.spec + 390 measure.*
- [x] Review reply: edit and save, 44px buttons. *pro-flow (checked in the database) + tapTargets test.*
- [x] Complete, no-show ⚠: pro marks a finished booking complete; pay-at-shop no-show closes it. Both buttons 44px; the no-show text no longer promises a charge when there's no fee or card. *pro-flow (bookings with no Stripe ids, so nothing charged).* The customer's confirm step (releases the payout) and a real fee charge were not run.
- [ ] Connect payout account: not run. It's Stripe Connect onboarding (payment code), and test mode needs the platform profile filled in first (see Decisions, pro pass #4).

### Studio  (studio pass, 24 Nov)
Logged out: `e2e/studio.spec.ts` 22/22 (11 sections × 1280 + 390). Logged in with TEST data (Noah OK'd the seed): Studio smoke (owner every section, manager, member) **30/30** at 1280 + 390, and `e2e/studio-flow.spec.ts` **5/5**: every section at 390 with no control under 44px and no sideways scroll; walk-in; membership check-in; settings save; no console errors. Seed → cleanup → check left 0 TEST rows.
- [~] Setup (no studio yet), plan banner ⚠: 44px back and skip buttons (tap-target test). Not clicked through: the TEST owner already has a shop, and the plan step opens Stripe Checkout.
- [x] Today / front desk, walk-in: a negative price is held back by the field; a $40 walk-in is booked. *studio-flow + smoke.*
- [x] Calendar (owner, manager, member): loads for each; 44px day buttons and team picker. *smoke 1280/390 + studio-flow 390.* Fixed: the no-show button and confirm no longer say the card is always charged. **Fixed 24 Nov (Broken): tapping "Mark done" saved the appointment straight away as paid by cash at the default price**, skipping the checkout step (React reused one button for "Mark done" and "Save, mark done", so the tap became a submit). Now Mark done opens the step and saves as chosen; no-show works. *e2e/shop-desk-flow (adds its own past TEST phone bookings).*
- [x] Requests (manager, member): load clean; a manager passes the TEST request to a TEST member (row found by its exact TEST title; real requests also list here). *smoke + e2e/shop-desk-flow.*
- [x] Team: owner changes a member's cut (45%) and role (manager) and restores them (*e2e/more-flows*). Loads, 44px; owner invites a TEST pro, the email is skipped so the share link is shown, and the pro joins from it. *smoke + 390 + e2e/invites-flow.* Role and commission changes not clicked.
- [x] Clients: loads, 44px; owner adds a TEST client and invites them (email skipped, invite recorded). *smoke + 390 + e2e/invites-flow.* CSV file import not run.
- [x] Import: loads; clearer "stopped partway" message. *smoke + 390.* No file imported.
- [x] Memberships: check-in recorded. *studio-flow.* Creating a plan not run (Stripe price).
- [~] Chairs: loads, 44px filter chips. *smoke + 390.* Posting, applicants and boost ⚠ not run.
- [x] Analytics (shop): loads for owner and manager at 1280 and 390. *smoke + studio-flow 390.* Weekly push toggle not clicked.
- [x] Earnings (shop): loads; 44px "Open shop settings". *smoke + studio-flow 390.*
- [x] Settings: owner saves the tagline. *studio-flow.* Billing and payouts ⚠ not run.
- [x] Join from invite: the TEST Basic pro opens the link and joins; membership active. *e2e/invites-flow.*

### Admin  (admin pass, 24 Nov)
Logged out: `e2e/admin.spec.ts` 2/2 (1280 + 390). With TEST data (Noah OK'd): admin smoke 2/2 at 1280 + 390, `e2e/admin-flow.spec.ts` **6/6**. Seed → cleanup → check left 0 TEST rows.
- [x] Dashboard access: logged out → login and back; customer → `/account`; a real non-admin account → `/account`. *admin.spec + admin-flow + in-app check.*
- [x] Users: search finds the TEST pro; Featured and Founding turned on and back off (checked in the database). *admin-flow.*
- [~] Content moderation: the TEST review shows under Reviews. *admin-flow.* Delete not pressed (it's permanent; the list also shows real users' content).
- [x] Verifications reject and approve: admin rejects a TEST submission with a reason, then approves the pro from "Look up a pro"; both emails skipped (test address). Only the TEST pro was reviewed (checked in the database). *e2e/invites-flow.*
- [x] Newsletter counts load. *admin-flow.* Send never pressed.
- [x] Phone layout: 44px controls, no sideways scroll at 390. *admin-flow.*

### Money, notifications and crons
(money pass, 24 Nov: read-only. Payments, payouts, the webhook, crons and email code were not changed.)
- [~] Webhook: unsigned and badly signed events are refused. *e2e/guards (local + preview).* A real `payment_intent.succeeded` → booking ran in the customer pass (with `stripe listen`). Other event types not triggered.
- [x] Payment intent rules, booking cap and commission per plan: pinned by unit tests, rules unchanged; the three copies of the cap are identical and match the plans page. *tests/money/rules.test.ts 8/8.*
- [~] Pay at shop and no-show: a no-show with no fee or card closes the booking and charges nothing. *e2e/pro-flow.* Charging a real test-mode fee not run.
- [x] Gift card redemption (24 Nov): owner takes \$20 off the TEST shop gift card, \$30 left (checked in the database). *e2e/more-flows.*
- [x] Gift card purchase and activation (pro gift card, 24 Nov): \$50 with a test card, back to localhost, card active via the webhook, both emails skipped (test addresses). *e2e/customer-flow.* Fixed: the thanks page now re-checks while the card is switching on (that re-check hasn't fired in a run yet: the card was active on first load). Shop gift card (24 Nov): \$50 with a test card once the TEST shop had a test payout account; card active, money transferred to the shop's account. *e2e/customer-flow.*
- [x] Memberships (24 Nov): join with a test card, active via the webhook, billing portal opens. *e2e/memberships-flow.* Booth rent (24 Nov): the TEST booth renter sets up weekly rent with a test card; the webhook records the rent subscription. *e2e/studio-billing-flow.*
- [x] Pro plan checkout (24 Nov): Basic pro subscribes to Apprentice with a test card; the webhook turns the plan on. *e2e/billing-flow (needs `STRIPE_FORWARDING=1`).* Local `.env.local` had **product** ids (`prod_…`) for the 3 solo plans, so checkout failed with "No such price"; with Noah's OK, 3 test-mode prices were created in the sandbox and `.env.local` now points at them (old ids kept as comments). The pro's "Manage billing" opens Stripe's billing portal (*e2e/memberships-flow*). Studio plan checkout (24 Nov): the TEST owner picks Studio Plus with a test card; the shop's plan turns on via the webhook. *e2e/studio-billing-flow.* Local Studio price ids were missing; with the same OK as the solo plans, two test-mode prices (\$79, \$149 CAD a month) were created in the sandbox and added to `.env.local`.
- [x] Connect onboarding for a pro (24 Nov): "Connect" on `/account` creates a test Express account and opens Stripe's form. Stripe shows an hCaptcha, so Noah finished the form himself; the account came back with charges on and "proof of liveness" still due, and `/account` shows "Setup incomplete" with Finish. Fixed: the note now says "Stripe still needs a quick selfie to confirm it's you" instead of "Individual Verification Proof Of Liveness". Fixed: under `npm run dev`, Stripe returns went to the live site (`getSiteUrl`); they now come back to localhost.
- [x] Connect onboarding for a shop (24 Nov): owner taps "Set up payouts" in Studio Settings; Noah finished Stripe's form; transfers active, and a shop gift card then sold and transferred. Settings shows "Details needed" / "Finish setup" while Stripe waits on the selfie check; unlike the pro's page it doesn't say what's needed (the shop data API would need to return Stripe's list; small follow-up).
- [x] Referral credit (24 Nov): Master starts a test trial, Basic (referred by Master) buys Apprentice; Master's reward is applied as a Stripe customer-balance credit. *e2e/boosts-referral-flow.* Profile and chair boosts also pass there.
- [x] `/api/health/payments` on local (test), preview (test) and production (live): keys match everywhere and no key value is returned. *e2e/guards + curl.*
- [x] Crons (24 Nov, on the TEST database): each refuses a caller without `CRON_SECRET` (local + preview), and all 9 ran against "LineUp Test" with `e2e/tools/cron-check.mjs`: reminders (2 sent, stamped), auto-complete (completed a booking marked done 3 days ago; no Stripe ids, so no payout), expire-verifications (unverified the expired TEST pro; it says "unverified" not "expired" because TEST pros have no verification submissions), completion nudge (stamped), regulars (reminder 5 days out, stamped), rebook nudge (claimed, skipped: a later booking exists), weekly summary (5 built), weekly push (Monday-only, skipped), enable-direct-booking (1 turned on). Every email skipped (`EMAIL_DISABLED`). Not covered: auto-complete's real Connect payout transfer (needs a paid booking with test Stripe ids).

## Decisions done (25 Nov, after Step 6, Noah: "do it all")

- ✅ **No charge without a booking.** Paying an offer at the pro's place (shop or home studio) is refused *before* the card is charged when the pro has no saved address; before, the card was charged and the webhook then refused to make the booking. Same rule as the webhook, in `app/lib/proLocation.ts`; checked before the time-clash check. *tests/money/proLocation.test.ts; e2e/payment-guards.spec.ts (on LineUp Test: 409, no payment created).*
- ✅ **After 3D Secure, back to the request** the customer paid from (was the Bookings tab).
- ✅ **Booking cap in one place**: `app/lib/bookingCap.ts` (cap, month window, count), used by checkout, the webhook's "nearing your limit" notice and the usage meter. Same numbers. *tests/money/rules.test.ts.*
- ✅ **Empty plan, traceable**: the webhook logs a paying subscription whose price isn't recognised (stored as no plan), with ids only.
- ✅ **Studio hydration error #418 fixed.** Cause: the page loader read Reduce Motion while rendering, so for anyone with Reduce Motion on its first render differed from the server's HTML. Now read through `useMediaQuery` (`useSyncExternalStore`). Checked on a production build: no errors on Studio pages with Reduce Motion on. *tests/pro/hydration.test.ts.*
- ✅ **Offer price in the database**: `supabase/migrations/20261125_offer_price_check.sql` adds a check that `request_offers.proposed_price` is one chargeable amount (same rule as the form and checkout). Applied to LineUp Test (tested: "55-60", "about 50", "0", "-5", "$", "1e3" refused; "$55", "55.50", "1,200 CAD" accepted) and then live (all 3 live offers passed; constraint validated). Row-level security unchanged.
- ✅ **Wording**: Studio plan reads "0% LineUp commission on your own clients (card fee at cost)"; the weekly summary leads with what's booked after a quiet week instead of "$0 from 0 appointments". *tests/analytics/weeklySubject.test.ts.*
- ✅ **Removed** the three unused newsletter routes (`/api/send-newsletter`, `/api/send-newsletter-test`, `/api/newsletter-audience`); the signup route stays.
- ✅ **Landing**: tour video re-encoded (3.0 MB → 1.3 MB, same look); hero cutouts through the image optimizer as AVIF (12–23 KB each on Vercel, 0.7 s cold). Preview, live data, phone, first visit: landing score 68 → **76**, LCP 6.7 s → **4.5 s**, 1.1 MB → **0.64 MB**.
- ✅ **Apple Pay**: already active in live mode for `lineup-aesthetics.ca` and `www.lineup-aesthetics.ca` (the earlier warning came from localhost). Nothing to do.
- ⏸ **BLIK** is still on in the live Stripe account (Bancontact and EPS are on too). Changing a live Stripe setting from here was blocked; see below.
- ⏸ **Signed-in pages and Lighthouse's 2.5 s**: they already load their data on the server (`/requests`, `/work`, `/calendar`). The simulated number comes from the ~330 KB of scripts every signed-in page needs (React/Next ~69 KB, the Supabase client ~62 KB, which can't be split). Real load: 0.5–1.2 s.
- ✅ **Logged-out save heart**: Discover and profiles show the heart when you're logged out; a tap goes to log in and back (`next=` the page you were on). *e2e/customer.spec.ts, 1280 + 390.*
- ✅ **Admin "TEST accounts only"**: the content lists can be limited to items from the seeded TEST accounts, so a test can delete its own (the TEST review is deleted and put back in *e2e/admin-flow.spec.ts*) without touching anyone real.
- ⏸ **Profile page main-thread time (~700 ms)**: two tries, both measured and undone: loading the payment and "booked" sheets on demand (437 vs 445 KB, same blocking time), and giving each section its own Suspense boundary (still ~700 ms, plus a small layout shift). The cost isn't those parts; it's likely the work the profile does as it starts (e.g. building the booking calendar's open slots). Next step is a performance trace of that start-up.

### Tests after the decisions (25 Nov, final production build on LineUp Test, fresh seed before each spec)
| Spec | Result |
|---|---|
| smoke (every page as each TEST user, 1280 + 390) | ✅ 150/150 |
| pro, customer, studio, admin, guards | ✅ 24, 16, 22, 2, 12 passed |
| pro-flow, studio-flow, admin-flow, more-flows, invites-flow | ✅ 6, 5, 6, 6, 4 passed |
| customer-flow, shop-booking-flow, shop-desk-flow, payment-guards | ✅ 7, 3, 4, 2 passed |
| **Paid flows with `stripe listen` forwarding** (Stripe test mode, same build, fresh seed each): customer flow incl. shop gift card, plan checkout, boosts + referral credit, memberships, Studio billing, shop booking, payment guard | ✅ 8, 1, 3, 3, 2, 2+, 2 passed; every webhook event answered 200; no "unrecognised price" warnings. One run of shop booking logged a single 409 (a taken slot) in the console; two reruns were clean (3/3 each). The pro gift card still skips: the TEST Basic pro has no test payout account. The 7 test subscriptions made were cancelled. |
| `npm test` | ✅ 201/201 |
| `npx tsc --noEmit`, `npm run build` | ✅ |
| lint (app) | ✅ 50 errors, same as the baseline |

## Summary and decisions waiting on Noah (25 Nov)

**Fixed across Steps 1–6 and the decisions above:** guarded routes, 44px tap targets, plain-English Stripe requirements, invite share links, the shop calendar "Mark done" bug, the email off-switch, a separate LineUp Test database (seed, cleanup, crons), the RLS speed-up and offer price check (both live), no charge without a booking, one booking cap, the Studio hydration error, and Step 6: pages that load a fraction of the bytes (Discover on live data 11 MB → 0.5 MB, 37 s → 4 s; landing 3.8 MB → 0.64 MB), no layout jumps, one shared UI kit, role-aware motion, monochrome everywhere, one plain voice (pro, request, offer, booking, shop).

**Settings (25 Nov):**
1. ✅ *Done (Noah, 25 Nov):* Vercel Preview uses LineUp Test (the three Supabase variables are Preview-only); checked on a redeployed preview: its code points at the test project, and the test database logged the preview's page loads. Earlier: Preview has the test plan prices and `EMAIL_DISABLED=1`. *Was:* pointing Preview at LineUp Test needs the test project's keys pasted into Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `.env.testdb.local`, Preview only). Until then, previews read and write the live database.
2. ✅ *Done (Noah, 25 Nov):* live checkout offers cards, Apple Pay, Google Pay and Link only (Klarna, BLIK, Bancontact, EPS off; checked with the Stripe CLI, read-only). *Was:* **Stripe → Settings → Payment methods → BLIK → Off** (also Bancontact and EPS, unless you want European methods). The Stripe CLI's live key isn't allowed to change payment-method settings.
3. **Still yours: Supabase → LineUp Test → Project Settings → API keys**: rotate the secret key, then update `.env.testdb.local`.
4. ✅ *Scheduled:* a one-time check of Vercel image usage runs on 2 Dec (Claude app → Scheduled → "LineUp: check Vercel image usage"); it only reads and reports.
5. **Your call: customer emails vs push.** Customers are emailed for confirmations, offers and reminders; turning those off would leave customers without push with no confirmations at all.
6. ✅ *Checked 25 Nov:* live database 19 MB of the free plan's 500 MB, 14 of 60 connections, 100% cache hits, no stuck queries, no Postgres errors in the last 24 hours, no health warnings.

**Worth doing next (code):** ~~trace the profile page's start-up~~ done in Step 7.

## Step 7: first-run guidance and the last clean-ups (26 Nov)

Asked: clean up what was left, make every feature easy to find, and guide first-time users well, with a detailed onboarding for clients, pros and shops.

### Onboarding
- ✅ **Welcome tours**, shown once on first visit and replayable from Help: clients (5 steps: Explore, two ways to book, paying, Bookings; ends on Explore), pros (7 steps, plain voice), **shop owners** (6 steps on Studio Today: front desk, calendar and requests, team, growing, money) and **pros who join a shop** (3 steps). *e2e/guides.spec.ts.*
- ✅ **Getting started checklists.** Clients: find a pro, first booking, notifications (turn on in place; iPhone gets "How"), profile photo. Shops: the old 4-step card is now 7 steps, each with a reason, a progress bar, the next step spelled out, the names of pros who still have no services, a "Share your shop's booking page" step (native share or copy), and Hide. Pros keep their existing checklist. Both decide on the first paint, so nothing below them jumps.
- ✅ **A short tip the first time someone opens a page** (21 pages: Explore, Bookings, New request; Requests, Services, Calendar, Earnings, Analytics, Gift cards, Chairs, Import, Plans, Account for pros; every Studio section). It sits above the page (over the phone tab bar's edge, bottom-right on desktop), so it never shifts anything; "Got it" closes it for good on every device. One at a time; never over a tour.
- ✅ **Help and guides** (`/help`): 25 step-by-step guides for clients, pros and shops, each with a button to the right page; "Replay the tour" brings back the tour and tips. In every account menu, the public menu and the sitemap.
- ✅ **Easier to find:** the pro account menu (13 links) is grouped under Your business, Grow and More; Help in every menu.
- ✅ **Remembered across devices:** `profiles.guides_seen` (migration `20261126_guides_seen.sql`, additive, RLS unchanged: people already update their own profile row and no protect_* trigger touches it). Tours seen before (the old columns) count as seen. TEST users start with everything seen so other specs aren't covered by tips.
- Wording checked by test: every tip and guide link opens a real page, no "job/bid/professional", tips under 160 characters. *tests/guides (46 tests).*

### Clean-ups
- ✅ **Profile page start-up**: traced (`e2e/tools/trace.mjs`): ~0.5 s went to the open-times loop, which re-formatted the date, re-read the clock and re-filtered every booking for each 15-minute slot over 8 weeks. Now once per day; identical slots (checked against the old code on 200 random weeks). Script time 625 → 110 ms at 4× CPU; Lighthouse **71 → 86**, TBT 52 ms. *tests/speed/openSlots.test.ts.*
- ✅ **Shop payouts** say exactly what Stripe still needs ("Stripe still needs a quick selfie to confirm it's you, your bank account"), the same plain list pros see. *tests/guides/shopPayouts.test.ts.*
- ✅ **Analytics busy-hours chart**: 28×32 px squares on phones (were 18×24), day names pinned while it scrolls, the tapped square outlined and read out. Same chart from 640 px up.
- ✅ **Geist restored site-wide.** `--font-sans` had been missing from the theme since March (commit 074f883), so every page used the device's system font while Geist was downloaded and never used. Now Geist everywhere with next/font's size-matched fallback (CLS still 0.000). *tests/pro/font.test.ts.*
- ✅ **Landing: no title jump.** Before GSAP loaded (~3.5 s on a slow phone) the title sat at the top, then jumped to the centre and replayed its intro. The opening is now drawn in CSS from the first paint and GSAP takes over from exactly that state; the scene behind the closed shutters stays transparent until they open; the hero has its own pin wrapper so pinning doesn't move it. Checked at 390 (slow 4G, 4× CPU), 1280 and reduced motion: the title never moves while loading, the reveal plays fully on scroll. *e2e/tools/hero.mjs.* Desktop LCP 0.14 s. The tagline now shows with the page instead of fading in half a second later.
- ⏸ **Landing on Lighthouse's simulated phone stays ~79 / LCP 5.5 s.** Real slow-phone LCP is ~3.6–3.8 s and isn't tied to anything moving (checked: no re-insert, no splash effect, fonts in by 1 s); Lighthouse attributes the whole start-up script to the first paint. Next lever would be less script on the landing page (GSAP + React), which is a bigger change.
- Pricing text "0% LineUp commission on your own clients (card fee at cost)" already says the card fee applies; left as is.

### Lighthouse, Step 7 (mobile, logged out, local production build on LineUp Test, median of 3)
| Page | Before | After |
|---|---|---|
| Profile | 71, LCP 4.1 s | **86**, LCP 4.1 s, TBT 52 ms |
| Landing | 79, LCP 5.6 s | 78–79, LCP 5.5 s (no jump now; desktop LCP 0.14 s) |
| Discover | 89, LCP 3.8 s | 88, LCP 3.8 s (real LCP ~1.2 s) |

### Tests, Step 7
Production build on LineUp Test, fresh seed before each spec.

| Check | Result |
|---|---|
| `e2e/guides.spec.ts` (new): client tour, checklist, a tip that stays closed after reload, Help and Replay; pro tip and grouped menu; shop tour, setup card, section tip, Hide; 1280 + 390 | ✅ 6/6 |
| smoke (every page as each TEST user, 1280 + 390), after the last change | ✅ 150/150 |
| customer, studio (re-run after the last change), pro, admin, guards | ✅ 18, 22, 24, 2, 12 |
| customer-flow, pro-flow, studio-flow, admin-flow, more-flows, invites-flow, shop-booking-flow, shop-desk-flow, payment-guards | ✅ 7, 6, 5, 7, 6, 4, 3, 4, 2 (paid parts skip without `stripe listen`; no payment code changed this step) |
| Landing hero (`e2e/tools/hero.mjs`): title never moves while loading, reveal plays on scroll; 390 slow 4G, 1280, reduced motion | ✅ |
| CLS (`e2e/tools/cls.mjs`): landing 0.000, Discover 0.001 | ✅ |
| `npm test` | ✅ 252/252 |
| `npx tsc --noEmit`, `npm run build` | ✅ |
| lint (app) | ✅ 50 errors, the baseline |
| Migration `20261126_guides_seen.sql` | ✅ LineUp Test, then live (26 Nov, Noah OK'd) |

Not tested: real push notifications from the checklist's "Turn on" (needs a real phone; the button calls the same code as Account's toggle), and Apple's "Add to Home Screen" path.


## Step 8: earnings and analytics gaps, shop profiles and reviews (26 Nov)

Asked: really good earnings reports and analytics (fill the gaps), and a shop page that's ultra easy to use and beautiful, customizable like a Google Business Profile on LineUp, with shop reviews.

### Gaps found
- Earnings had the totals, the statement, payouts, the shop split and every line, but nothing over time, no comparison with the period before, nothing by service, weekday, tips or payment method, and no spreadsheet export.
- Analytics had revenue, forecast, clients, open time, sources, requests, profile, boosts, prices and goals, but nothing per service.
- The shop page was a name, a list of pros and memberships: no photos, hours, contact, rating, reviews or service menu.

### Built
- ✅ **Earnings, read more ways** (pro and shop): take-home over time (by day, week or month to suit the range) with Take-home, Visits, Per visit and Tips (shop: Client payments) against the same length of time before; by service (most earned, count × average price); by day of the week with the best day named; tips (total, % on top of sales, % of visits tipped); how clients paid; **Spreadsheet (CSV)** of every line. Same rows as the statement, so totals always agree. *tests/money/earningsInsights.test.ts (9), e2e/reports.spec.ts.*
- ✅ **Analytics: Services** (pro and shop): per service the revenue and its change, bookings, average price, revenue per hour of chair time and how many of those clients came back; the top service and the best earner per hour named. In the CSV and the example data. *tests/analytics/services.test.ts.*
- ✅ **Shop profile** (Studio > Profile, owner and managers): cover and logo, a gallery of up to 30 photos (uploaded straight to storage with a signed link, forced under the shop's own folder), about, opening hours (or the team's combined), phone, Instagram, website and 12 amenities. Validated on the server (hours merge and order, https websites, Instagram handles, fixed amenity list). *tests/shop (20).*
- ✅ **Shop reviews**: a client with a completed booking at the shop rates it (1–5 stars, optional comment) from the booking page, once per visit (unique per booking; a second try gets 409); public names are first name + last initial; the owner and managers reply from Profile. New tables are readable by anyone, written only by the server.
- ✅ **Public shop page rebuilt**: cover and overlapping logo, rating, trades and area, Open now / closes at, one-tap Book now, Directions, Call, Instagram, Gift card and Share; pinned section links; **"What would you like?"** service menu that filters the team and pre-selects the service; pros' own ratings on their cards; photo gallery (swipe row on phones, grid on laptops, full-screen viewer with arrows, swipe and Esc); reviews with the spread of stars and replies; About, Hours (today in bold), Find us, Good to know; schema.org business data for search. Monochrome, Geist, lucide only.
- ✅ The shop setup card adds "Fill in your shop's page"; the Studio tour, Help and a Profile tip cover it.

### Tests, Step 8
Production build on LineUp Test, fresh seed before each spec.

| Check | Result |
|---|---|
| `e2e/shop-profile.spec.ts` (new): owner edits the profile and adds/removes a photo, public page shows it (1280 + 390); client reviews from a completed visit, a second review is refused, owner replies, public page shows review, name as "TEST C." and the reply | ✅ 3/3 (the review runs once, on desktop) |
| `e2e/reports.spec.ts` (new): shop earnings over time and by service, CSV download with the right columns; Services card for a pro and the shop (1280 + 390) | ✅ 4/4 |
| smoke (every page as each TEST user, 1280 + 390) | ✅ 150/150 |
| guides, customer, pro, studio, admin, guards | ✅ 6, 18, 24, 22, 2, 12 |
| customer-flow, pro-flow, studio-flow, admin-flow, more-flows, invites-flow, shop-booking-flow, shop-desk-flow, payment-guards | ✅ 7, 6, 5, 7, 6, 4, 3, 4, 2 (paid parts skip without `stripe listen`; no payment code changed) |
| New shop page, Lighthouse mobile, logged out | ✅ score 90, LCP 3.6 s, CLS 0.001, TBT 46 ms, 394 KB (old page: 91) |
| `npm test` | ✅ 285/285 |
| `npx tsc --noEmit`, `npm run build` | ✅ |
| lint (app) | ✅ 50 errors, the baseline |
| Migration `20261127_shop_profile_reviews.sql` | ✅ test, then live; RLS on both new tables, read-only policies; no new security advisor findings |

Not tested: photo upload from a real phone camera (tested with a PNG from the repo; the same signed-upload path), and the Instagram/Call/Directions links opening the apps.


## Step 9: polish and plain wording (26 Nov)

Asked: more UI polish everywhere so it feels premium and better than Squire, and simpler wording throughout.

How: the smoke test now saves a full-page screenshot of every page it opens (`SMOKE_SHOTS=dir`), so all 75 pages × 2 sizes were reviewed by eye as each TEST user, plus a scan of every on-screen sentence for stiff words and length.

- ✅ **Plain voice everywhere**: "Please try again" → "Try again" (73 places, server messages too); "You must be signed in to…" → "Sign in to…"; no "e.g.", "successfully" or exclamation marks; "professional" → "pro" wherever it still showed on screen (≈20 places: request pages, profile, account, onboarding, respond, chairs). The credential "Licensed / certified professional" and the CRA form names keep the word on purpose.
- ✅ **Shorter sentences** where people read while setting up or stuck: verification (3), password reset, push notifications (2), Plans, the monthly request limit, the Services calendar note, the Analytics, Earnings and shop intros, the import intro, the empty Analytics pages.
- ✅ **Sentence case**: all-caps labels and badges removed (offer cards, request editing, plan badges, verification and status chips). Calendar weekday letters and the printed gift card keep theirs.
- ✅ **Kinder statuses**: offer "pending" → "Waiting for you", "Outbid" → "Not chosen" (client and pro side), verification "approved/rejected" → "Approved/Not approved", raw lowercase statuses capitalised.
- ✅ **Find a shop**: each card now shows the shop's cover (or first photo), logo and rating.
- ✅ **Earnings**: Statement (PDF) and Spreadsheet (CSV) under one Download menu, so the actions sit on one tidy row.
- ✅ **Unsubscribe**: was a full black page (the brief rules out dark full sections); now light like the rest of the site, in plain words, and it says booking emails keep coming (it only turns off marketing, checked in the API).
- ✅ **Fixed**: the empty shop Analytics page linked to `/studio/schedule` (a 404); now `/studio/calendar`.
- ✅ **Email confirmation always ends somewhere clear** (Noah: "it doesn't take you back to sign in"). The "Email confirmed" screen existed but only showed when the link came back through `/auth/callback`. When the address a link was made for isn't on Supabase's allowed redirect list (www vs bare domain, a preview), Supabase sends people to the Site URL (the home page) with the code, so they landed on the home page with no sign of whether it worked. Now a code on the home or login page finishes confirming and shows "Email confirmed. Sign in to keep going." (or goes on to onboarding when signed in); an expired or used link, in the query or after the #, goes to the login page with a plain message and **Send a new link**; signing in before confirming says so with the same button, and a wrong password gets a plain message. *e2e/email-confirm.spec.ts (8, 1280 + 390), tests/money/authLinks.test.ts (5).* Worth checking too (Noah, Supabase → Authentication → URL Configuration): Site URL `https://lineup-aesthetics.ca`, and Redirect URLs include `https://lineup-aesthetics.ca/**` and `https://www.lineup-aesthetics.ca/**`, so links come straight back without the fallback.

- ✅ **Passing a request to a pro** (Studio > Requests > Pass to…) checked end to end and made hard to miss on the pro's side: the pro gets the in-app notification plus a **push**; on their Home the request goes to the top marked **"Passed by Sam"**, and still shows even if it's outside their usual area or they'd dismissed it; the request page says **"Sam at <shop> passed this to you"**. New `GET /api/studio/requests/passed` returns only the caller's own passes (the passes table stays server-only). *e2e/shop-desk-flow.spec.ts now follows it to the pro: notification, "Passed by", the note.*

### Tests, Step 9
STEP9_TESTS
