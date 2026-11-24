# LineUp site audit: report

Branch `site-audit` (from main at 17a65a2). Started 23 Nov 2026. **Mapping and setup only. Nothing in the app has been fixed yet.**

## Resume here

> **Pro pass done** (24 Nov, branch `site-audit`). Preview checks (logged out): `pro.spec` + `customer.spec` 40/40; public smoke 40/48 (the other 8 need seeded ids). Logged in with TEST data (local): Pro smoke 76/77 at 1280 + 390 (`/profile` at 390 is slow, see Slow), `e2e/pro-flow.spec.ts` 6/6, then cleanup + check = 0 TEST rows. `npm test` tests/pro 21/21, tsc clean, lint 50 (baseline), build passes. Every Pro item is ticked or written up as a decision. Connect payout setup was not run (Stripe onboarding). **Next: Studio pass.**
>
> To test: `LINEUP_ALLOW_LIVE_TEST_DATA=yes-noah-approved node --env-file=.env.local --env-file=.env.test.local scripts/test-data.mts seed`, start `npm run dev`, then run `npx playwright test e2e/customer.spec.ts`, `e2e/customer-flow.spec.ts --project desktop` and `e2e/smoke.spec.ts` (all with the same two `--env-file` flags in front of `node node_modules/.bin/playwright`). Then run `cleanup` and `check`. For paying, forward webhooks first: run `stripe listen --print-secret`, put that value in `.env.development.local` as `STRIPE_WEBHOOK_SECRET`, run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and delete the file afterwards.
> **Disk:** this Mac has only ~2 GB free; the dev server plus test browsers can fill it within the hour. Stop the dev server between runs and `rm -rf .next/dev test-results`.

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
- Code: `/studio/calendar` has no manager-only guard even though its tab is hidden from members (maybe intended).
- Everything else: to check once seeded.

### Admin
- Confusing: `/admin` is a blank page for anyone who isn't an admin (no message).
- Code (risk): the admin Newsletter POST and the legacy `/api/send-newsletter` email the **whole real list**. Three admin newsletter routes have no UI caller (`send-newsletter`, `send-newsletter-test`, `newsletter-audience`), and `newsletter-audience` returns every subscriber's email.

### Money, notifications and crons
- Code (risk, not a bug): there's **no email kill-switch**. Any flow that emails will really send via Resend. SMS is off because the Twilio vars are unset. Push is on wherever VAPID is set.
- Code: the auto-complete cron makes real Connect transfers in whatever mode the keys are in. Locally the keys are `sk_test_`. Check production with `GET /api/health/payments`.
- Code: the `completion-nudges` cron also runs every ~15 min from GitHub Actions, as well as daily on Vercel.

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
4. **Connect payout setup untested**: fill in the Stripe Connect platform profile (dashboard.stripe.com/settings/connect/platform-profile) so a TEST pro can create a test-mode payout account. Then onboarding, the account-status badge and the customer's confirm step that releases a payout can be tested.

## Slow (for Step 6)
- `/profile/[id]` loads Stripe.js on every visit, which keeps sending telemetry for ~8 s; with a cold dev compile the page isn't quiet after 15 s at 390. Load Stripe only when the booking sheet opens.
- `/shop/[slug]` and `/profile/[id]` still loading after 15 s on a cold dev compile; re-measure on a production build.
- Supabase auth lock warnings ("Lock … was not released within 5000ms"): several components call `getSession`/`getUser` at mount (AppNavbar, useBidCounts, useVerificationState → `getUser()`, useWebPush, RequestDetailPageClient). One shared auth promise would fix it.
- RequestDetailPageClient calls `getSession()` in every action handler.

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
- [ ] Edit / cancel a request, cancel a booking, pay-at-shop and memberships: not run this pass.

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

### Studio
- [ ] Setup (no studio yet), plan banner ⚠
- [ ] Today / front desk, walk-in
- [ ] Calendar (owner, manager, member)
- [ ] Requests (manager passes; member sees own)
- [ ] Team: invite ⚠, roles, commission and rent (Plus)
- [ ] Clients: import, invite ⚠, unsubscribe link
- [ ] Import
- [ ] Memberships: plans, check-in
- [ ] Chairs: post, applicants, boost ⚠
- [ ] Analytics: alerts, weekly push toggle
- [ ] Earnings (shop)
- [ ] Settings: profile, billing ⚠, payouts, commission
- [ ] Join from invite

### Admin
- [ ] Dashboard access (admin vs not)
- [ ] Users: search, featured, founding
- [ ] Content moderation
- [ ] Verifications approve and reject ⚠
- [ ] Newsletter counts (**never press send while testing**)

### Money, notifications and crons
- [ ] Webhook events (Stripe CLI `stripe trigger` in test mode only)
- [ ] Payment intent and booking cap, commission per plan (read-only check, rules unchanged)
- [ ] Pay at shop and no-show fee
- [ ] Gift card activation and redemption
- [ ] Memberships and booth rent subscriptions
- [ ] Pro plan and studio plan checkout and portal
- [ ] Connect onboarding for pro and shop
- [ ] Referral credit
- [ ] `/api/health/payments` on local, preview and production
- [ ] Each cron, run locally with `CRON_SECRET` against TEST data only: reminders, auto-complete, expire-verifications, completion-nudges, standing, rebook, weekly-summary, weekly-push
