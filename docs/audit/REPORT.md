# LineUp site audit: report

Branch `site-audit` (from main at 17a65a2). Started 23 Nov 2026. **Mapping and setup only. Nothing in the app has been fixed yet.**

## Resume here

> **Audit setup is finished** (Playwright added, TEST seed → smoke → cleanup done on 23 Nov; 0 TEST rows left). **Next: the Customer & Public pass** (separate task). Start from the "Logged-in smoke results" and the Customer/Public problems below.
>
> To test again: `LINEUP_ALLOW_LIVE_TEST_DATA=yes-noah-approved node --env-file=.env.local --env-file=.env.test.local scripts/test-data.mts seed`, run `npm run test:smoke` (or `-g "customer "` for one viewer), then the same command with `cleanup`, then `check`. Run seed, tests and cleanup in one sitting. The password is in `.env.test.local` (git-ignored).
> The full smoke run takes 30+ minutes and needs a machine with free memory. On 23 Nov the Mac was under heavy memory pressure and disk was nearly full; Turbopack crashed once (a dev-only `PoisonError` panic) and gave false 500s. If you see that, stop the dev server, `rm -rf .next/dev`, and restart it.

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
- Looks unpolished: landing next/image `sizes`/LCP warnings.
- Confusing wording: none seen yet.

### Customer
- Broken: `/requests/new` and `/onboarding` were blank when logged out on a cold load (recheck). Code: `/refer` is linked for everyone, but its API returns 403 for anyone who isn't a pro.
- Slow: auth-lock stalls on `/requests`.
- Looks unpolished: to check once seeded.
- Confusing wording: to check once seeded.

### Pro
- Broken: `/services` blank and `/chairs` stuck on "Loading …" when logged out (no redirect). `/earnings` shows an empty shell when logged out.
- Code: role checks differ page to page (`includes("customer")` vs exactly `professional`), so a `shop` role passes the earnings and analytics checks. The paid-plan check is copied in 3 places.
- Slow: to check once seeded.
- Looks unpolished / Confusing: to check once seeded.

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

## Checklist (from FEATURES.md)

Tick an item when it has been clicked through on desktop and at 390px as the right user, with no errors. ⚠ = sends or moves money, so test only with TEST accounts and Stripe test mode.

### Public
- [ ] Landing `/` (and signed-in redirect to `/requests`)
- [ ] About, Contact form ⚠, FAQ, Privacy, Terms
- [ ] News list, signup ⚠, news issue
- [ ] Beauty hub, city, city+trade
- [ ] Discover (Spotlight, picks, save heart)
- [ ] Shops directory, Shop page (book, membership ⚠)
- [ ] Pro profile (services, reviews, availability, book ⚠), `/book/[slug]` redirect
- [ ] Gift card buy ⚠, balance, thanks
- [ ] Login, signup, auth callback, reset password
- [ ] Unsubscribe, sitemap, robots, OG images

### Customer
- [ ] Onboarding
- [ ] Requests home
- [ ] New request ⚠ (notifies pros)
- [ ] Request detail: offers, accept and pay ⚠, tip, gift card, chat, edit, cancel
- [ ] Booking detail: chat, cancel, complete, review
- [ ] Regular `/regular/[id]`: pay next ⚠, end
- [ ] Account: profile, saved pros, push toggle, delete account
- [ ] Archive

### Pro
- [ ] Work dashboard, withdraw offer
- [ ] Respond to request ⚠ (verified only)
- [ ] Calendar, ICS feed, regulars
- [ ] Services and hours (Apprentice+ schedule)
- [ ] Earnings: report, statement PDF, entries, tax year, receipts
- [ ] Analytics: Basic vs full, goal, alerts, win-back ⚠, PDF
- [ ] Import (Apprentice+)
- [ ] Chairs: browse, apply ⚠
- [ ] Subscription ⚠, boosts ⚠
- [ ] Verification upload ⚠
- [ ] Refer
- [ ] Gift cards (seller)
- [ ] Review reply
- [ ] Complete, no-show ⚠
- [ ] Connect payout account

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
