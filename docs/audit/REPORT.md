# LineUp site audit: report

Branch `site-audit` (from main at 17a65a2). Started 23 Nov 2026. **Mapping and setup only. Nothing in the app has been fixed yet.**

## Resume here

> **Pro, Studio, Admin and money passes done** (24 Nov, branch `site-audit`). Preview https://lineup-site-pnjc6sk64-noahkaminskys-projects.vercel.app: guards + admin + studio + pro + customer checks **76/76**. `npm test` 163/163. Money/notifications/crons was read-only: guards 12/12 locally and on the preview, payments health checked on local/preview/production, `tests/money` 8/8; nothing that charges, pays out or sends was run (see its decisions). Preview https://lineup-site-fw3y5ljow-noahkaminskys-projects.vercel.app: admin + studio + pro + customer logged-out checks **64/64**. Admin: logged-out 2/2, admin smoke 2/2, `e2e/admin-flow.spec.ts` 6/6, TEST data cleaned (0 left). Preview https://lineup-site-eep2fripi-noahkaminskys-projects.vercel.app: studio + pro + customer logged-out checks **62/62**. Studio: logged-out 22/22, Studio smoke 30/30 at 1280 + 390, `e2e/studio-flow.spec.ts` 5/5, TEST data cleaned (0 left). Pro: smoke 76/77 (`/profile` at 390 is slow), `e2e/pro-flow.spec.ts` 6/6. `tests/pro` 43/43, tsc clean, lint 50 (baseline), build passes. Items not run are listed with the reason (they email, charge, or need Stripe test setup). **Step 6 (speed) started**: Stripe.js now loads only when a payment form opens (`/profile` 15 → 0 Stripe requests) and the verification banner no longer holds the auth lock; payments re-tested with a test card. Payment → webhook → booking re-tested with forwarding after `stripe login` (the CLI key lasts 90 days). The Slow list is done (each item fixed or checked). Email off-switch added (Noah's pick): TEST addresses are never emailed and `EMAIL_DISABLED=1` stops all mail. Invites → join, client invites and verification reject/approve now tested (`e2e/invites-flow.spec.ts` 4/4, all emails skipped, TEST data cleaned). Stripe test mode now covered: pro payout onboarding (Noah did the hCaptcha form), a pro gift card and Apprentice plan checkout all pass (`e2e/customer-flow`, `e2e/billing-flow`, with `stripe listen`). Local dev now gets Stripe returns on localhost. Customer edit/cancel, booking cancel, team cut/role and gift card redeem tested (`e2e/more-flows` 6/6). Pay-at-shop and member bookings, buying a membership and both billing portals now tested (`e2e/shop-booking-flow`, `e2e/memberships-flow`, with `stripe listen`); a reusable TEST shop payout account is in `.env.test.local`. Booth rent and Studio plan checkout also pass (`e2e/studio-billing-flow` 2/2). Boosts and the referral credit also pass (`e2e/boosts-referral-flow` 3/3). Every Stripe flow in FEATURES.md has now run in test mode. **Live database stalled 24 Nov 18:42–~20:10 UTC** (no error logged; Noah restarted it); see Decisions. Test database "LineUp Test" created (copy of the live schema, no data; `.env.testdb.local`) and all 9 scheduled jobs ran there (`e2e/tools/cron-check.mjs`). **Tests now run on the test database by default** (24 Nov): the whole suite passed there: smoke 150/150 at 1280 + 390, every flow spec, logged-out checks, guards and plan checkout 77/77, all 9 jobs. Use `npm run dev:testdb`, `npm run testdb:seed`, `npm run test:smoke`, `npm run test:crons`, `npm run testdb:cleanup`; CLAUDE.md says so too. **Next (Noah):** apply `supabase/migrations/20261125_rls_policy_performance.sql` to live (tested on LineUp Test; see Decisions); point Vercel Preview at LineUp Test; check the live database's memory and disk I/O. shop calendar done/no-show and passing a request now tested (`e2e/shop-desk-flow` 4/4; fixed "Mark done" saving as cash). Most unticked items wait on a test database or Stripe test setup (Decisions).
>
> To test (on the TEST database): `npm run testdb:seed`, start `npm run dev:testdb` (or the `lineup-dev-testdb` preview), run `npm run test:smoke` (add `STRIPE_FORWARDING=1` with `stripe listen` running and its secret in `.env.development.local` for payment flows), then `npm run testdb:cleanup`. Nothing touches the live database.

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
5. **/news uses a serif display face** (Instrument Serif, a deliberate "newspaper" look); the brand rules say no serif display. Swapping it changes that page's design, so it's your call.
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

## Decision: apply the RLS speed-up migration to live (25 Nov)

Supabase's advisors on the live project: **71 policies re-check `auth.uid()` on every row** and 35 tables have overlapping policies (several exact duplicates), which makes ordinary reads much heavier on the free-plan database that stalled on 24 Nov. `supabase/migrations/20261125_rls_policy_performance.sql` keeps every rule the same but: drops 5 exact-duplicate policies, rewrites 66 to `(select auth.uid())` (evaluated once per query), and pins `search_path` on 6 trigger functions. **Tested on LineUp Test only**: per-row warnings 71 → 0, duplicate warnings 35 → 30 (the rest are genuinely different rules), and the whole suite still passes there (smoke 150/150 at 1280 + 390, all flow specs, logged-out + guards + checkout 77/77). **To apply:** paste the file into the live project's SQL editor (it runs in one transaction) or run it with the Supabase CLI. Not done by me: it's a live database change.

Other advisor findings, not changed: 53 foreign keys without an index (slower deletes and joins), 14 unused indexes, leaked-password protection off (Auth → Settings), the studio helper functions are callable by anyone (they only answer "is this user on that studio"), and 3 extensions sit in the `public` schema.

## Slow (for Step 6)
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
