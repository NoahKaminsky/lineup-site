# LineUp site audit: report

Branch `site-audit` (from main at 17a65a2). Started 23 Nov 2026. **Mapping and setup only. Nothing in the app has been fixed yet.**

## Resume here

> **Waiting on Noah for two OKs**, then pick up at step A:
> 1. **Add Playwright** (dev dependency plus a Chromium download, about 150 MB). The spec is drafted and ready: `e2e/routes.ts` is committed, and `e2e/smoke.spec.ts` + `playwright.config.ts` are drafted in `docs/audit/drafts/`.
> 2. **Write TEST data to the live Supabase project**: 8 TEST accounts (including one admin), 1 TEST shop and their rows. They're removed straight after with `cleanup`.
>
> - **A.** `npm i -D @playwright/test && npx playwright install chromium`, then add `playwright.config.ts` and `e2e/smoke.spec.ts` (copy them from `docs/audit/drafts/*.txt`, dropping the `.txt`). Add `"test:smoke": "playwright test"` to package.json. Exclude `e2e/**` from Vitest (it already only includes `tests/**`).
> - **B.** Put `TEST_SEED_PASSWORD=<12+ chars>` in `.env.test.local` (git-ignored). Then run:
>   `LINEUP_ALLOW_LIVE_TEST_DATA=yes-noah-approved node --env-file=.env.local --env-file=.env.test.local scripts/test-data.mts seed`
> - **C.** `node --env-file=.env.local --env-file=.env.test.local node_modules/.bin/playwright test`, then paste the failures into the Results table.
> - **D.** Run `cleanup` the same way as `seed`, then `check` to confirm 0 TEST accounts. **Do C and D in the same sitting.** TEST pros are visible on the live site while seeded, and the live Vercel crons run on the same database.
> - **E.** Start fixing in the order of the "Problems" list below. One area per session.

## What was set up and tested this session

| Item | Result |
|---|---|
| `site-audit` branch from origin/main; unmerged branches listed (`admin-comp`, `polish-and-speed-pass`, `promo-code-reels`) | ✅ pass |
| `docs/audit/FEATURES.md`: every page, API, cron and component group, with flags | ✅ written (from the code; 3 parallel readers plus a schema check) |
| Test tools check: Vitest 3.2.4 yes, Playwright no, Jest no | ✅ done. Playwright proposed, **waiting on OK** |
| `scripts/test-data.mts` seed / cleanup / check (TEST prefix, example.com emails, no Stripe calls, notifications off, refuses live DB without the OK value, refuses live Stripe keys) | ✅ written. tsc and lint clean |
| `tests/audit/testData.test.ts`: guard and TEST-email unit tests | ✅ 6/6 pass |
| Seed → check → cleanup on a real database | ⛔ **not run**. The only database is live and needs Noah's OK. The guard refusal was checked offline (exit 1, no network call) |
| `e2e/routes.ts`: 70 page visits across public, customer, Basic pro, Master pro, owner (every Studio section), manager, member, admin | ✅ written |
| Playwright smoke spec (desktop 1280 + phone 390; fails on HTTP ≥400, blank page, Next error overlay, console error or page error, wrong redirect) | ⏸ drafted, waiting on install OK |
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

## Smoke test drafts (to add at step A)

`playwright.config.ts`: Chromium projects `desktop` (1280×900) and `phone-390` (390×844, mobile and touch), `workers: 1`, `webServer: npm run dev` with reuseExistingServer, JSON report to `test-results/smoke.json`, base URL localhost:3000 only.

`e2e/smoke.spec.ts` works like this:
- `beforeAll` reads the TEST ids with the service role: the master pro's id, the shop slug, the open request, confirmed and completed bookings, and the standing appointment.
- It signs each TEST viewer in once per project through `/login` and saves the storage state.
- For every `SMOKE_ROUTES` entry it opens the page and fails on HTTP ≥400, under 40 chars of body text, a `nextjs-portal` overlay, "Application error" text, `console.error` or `pageerror`, or a wrong redirect.
- It soft-fails as "slow" if the page is still loading after 15 s.

Both full drafts are in `docs/audit/drafts/` as `.txt` files until Playwright is approved, because they import `@playwright/test` and would break `tsc`.
