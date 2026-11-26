# LineUp feature map

Built from the code on `site-audit` (from main at 17a65a2, 23 Nov 2026). Only what exists in the code is listed.
Flags: **[half-built]**, **[unused]** (no caller found), **[legacy]**, **[plan: X]** (needs that plan), **⚠ sends** (sends email/SMS/push or moves money, so take care when testing).
Paths are relative to the repo root. `ui:` = page files, `api:` = route handlers under `app/api/`.

Who's who in the data: `profiles.role` is `customer` / `professional` / `shop`, admins have `profiles.is_admin = true`. A pro's solo plan is `profiles.subscription_plan` (`basic`/null, `apprentice`, `pro`, `master`) and only counts while `subscription_status` is `active`/`trialing`. A shop's plan is `studios.plan` (`studio` / `studio_plus`), and its team lives in `studio_members` (role `owner`/`manager`/`member`).

## Public (logged out)

| Feature | Route | Main files |
|---|---|---|
| Landing page. Signed-in users are sent on to `/requests` | `/` | ui: app/page.tsx, app/components/landing/*, middleware.ts |
| About (founder story) | `/about` | app/about/page.tsx, components/landing/FounderCards.tsx, components/site/PublicLayout.tsx |
| Contact form | `/contact` | app/contact/{page,ContactForm}.tsx · api: contact |
| FAQ | `/faq` | app/faq/{page,FaqList}.tsx |
| Privacy and Terms | `/privacy`, `/terms` | app/privacy/page.tsx, app/terms/page.tsx |
| News list and newsletter signup | `/news` | app/news/{page,NewsSignup}.tsx, lib/email/issues.ts · api: newsletter/subscribe |
| News issue (hard-coded slugs, e.g. `lineup-is-live`) | `/news/[slug]` | app/news/[slug]/{page,IssueFrame}.tsx |
| Local SEO hub, city pages and city+trade pages (hard-coded cities and trades) | `/beauty`, `/beauty/[city]`, `/beauty/[city]/[trade]` | app/beauty/*, app/lib/cities.ts |
| Discover verified pros, with Spotlight and LineUp picks | `/discover` | app/discover/*, components/discover/{SpotlightStage,LineupPicks}.tsx, components/SaveHeart.tsx · api: spotlight, places/reverse-geocode |
| Shops directory (live studios) | `/shops` | app/shops/{page,ShopFilter}.tsx |
| Shop page: team, services, booking, memberships | `/shop/[slug]` | app/shop/[slug]/{page,ShopBooking,ShopMemberships}.tsx · api: memberships, bookings/pay-at-shop, stripe/create-payment-intent, professional/busy-times |
| Pro profile: portfolio, services, reviews, availability, direct booking | `/profile/[id or username]` | app/profile/[id]/{page,ProfilePageClient,getInitialData,ReviewReply}.tsx · api: places/* |
| Booking short link that redirects to the profile | `/book/[slug]` | app/book/[slug]/route.ts |
| Buy a gift card for a pro or a shop | `/gift/[pro or shop]/[slug]` | app/gift/[kind]/[slug]/{page,GiftForm}.tsx, app/lib/giftCardsServer.ts · api: gift-cards/checkout |
| Gift card balance lookup (LU-XXXX-XXXX-XXXX) | `/gift/balance` | app/gift/balance/* · api: gift-cards/balance |
| Gift card thank-you page, which activates the card from `session_id` | `/gift/thanks` | app/gift/thanks/page.tsx |
| Log in and sign up | `/login` | app/login/page.tsx |
| Auth callback for confirm and recovery links | `/auth/callback` | app/auth/callback/route.ts |
| Reset password | `/reset-password` | app/reset-password/page.tsx |
| Marketing unsubscribe | `/unsubscribe?email=` | app/unsubscribe/* · api: unsubscribe |
| Sitemap, robots (blocks Vercel previews), OG and Twitter images | `/sitemap.xml`, `/robots.txt` | app/sitemap.ts, app/robots.ts, app/opengraph-image.tsx, app/twitter-image.tsx |

## Customer

| Feature | Route | Main files |
|---|---|---|
| Onboarding: pick role and trades, accept terms. SMS signup is turned off (`SMS_SIGNUP_UI_ENABLED=false`) | `/onboarding` | app/onboarding/page.tsx |
| Requests home: the customer's requests, offers and bookings. Pros get a different view on the same route | `/requests` | app/requests/{page,RequestsPageClient,getInitialData}.tsx, components/{WelcomeTour,OnboardingChecklist,NotificationNudge,BrowseCardNudge,BidCountBlip}.tsx, components/moments/* |
| New request: location, photos, preferred pro. The client inserts it directly and pros are notified ⚠ sends | `/requests/new` | app/requests/new/page.tsx, components/{TimeSelect,LocationAutocomplete}.tsx · api: notifications/request-created |
| Request detail: offers, accept and pay (tip, gift card), chat, edit or cancel | `/requests/[id]` | app/requests/[id]/{page,RequestDetailPageClient,getInitialData}.tsx, components/payments/{TipStep,PaymentModal,CheckoutForm}.tsx · api: requests/update, requests/bid-counts, stripe/{create-payment-intent,tip,gift-card}, notifications/clear-request |
| Booking detail: countdown, chat, cancel, complete, review. The client inserts reviews directly into `professional_reviews` | `/bookings/[id]` | app/bookings/[id]/{page,RegularCard,ClientNotes}.tsx, components/BookingChat.tsx · api: bookings/{cancel,complete} |
| Regular (standing appointment): pay the next visit or end the series | `/regular/[id]` | app/regular/[id]/page.tsx · api: standing |
| Account: profile, saved pros, push and weekly toggles, delete account | `/account` | app/account/{page,AccountPageClient,getInitialData}.tsx (2,300 lines, mixes customer and pro code), components/{SavedProsCard,PushNotificationToggle}.tsx · api: delete-account, push/{subscribe,unsubscribe} |
| Saved pros (heart) | on discover and profile | components/SaveHeart.tsx, app/lib/savedPros.ts |
| Join a shop membership (Stripe Checkout) ⚠ money | `/shop/[slug]` | ShopMemberships.tsx · api: memberships |
| Archive of past completed bookings (also for pros) | `/archive` | app/archive/page.tsx |
| Referral capture on signup | (all pages) | components/ReferralCapture.tsx · api: referrals |

## Pro

| Feature | Route | Main files |
|---|---|---|
| Work dashboard: open requests, offers sent (withdraw), upcoming bookings | `/work` | app/work/{page,WorkPageClient,getInitialData}.tsx · api: offers/withdraw, bookings/complete, notifications/clear-offer |
| Respond to a request with an offer. Verified pros only, enforced by a DB trigger ⚠ sends | `/requests/[id]/respond` | app/requests/[id]/respond/page.tsx · api: notifications/offer-created |
| Calendar: bookings, regulars, ICS feed sync, monthly request-booking usage. **[plan: Apprentice+]** for the instant-booking schedule | `/calendar` | app/calendar/{CalendarPageClient,CalendarSync,RegularsPanel}.tsx · api: calendar/link, calendar/feed/[key], professional/booking-usage |
| Services, prices, modes, location, weekly hours, booking window. **[plan: Apprentice+]** for the schedule settings | `/services` | app/services/page.tsx, components/{WeeklyHoursEditor,SchedulingControls}.tsx |
| Earnings report, statement PDF, manual entries, tax year (expenses with receipts, GST/HST) | `/earnings` | app/earnings/page.tsx, components/earnings/{EarningsReport,TaxYear}.tsx, app/lib/{earnings,earningsCore,earningsStatement,earningsPdf}.ts* · api: earnings, earnings/{statement,entries,tax} |
| Analytics: goals, alerts, win-back nudges, PDF summary, Spotlight stats. **[plan: Apprentice basic, Pro/Master full]**; studio members get full ⚠ win-back sends | `/analytics` | app/analytics/page.tsx, components/analytics/ProAnalytics.tsx, app/lib/{proAnalytics,analyticsMetrics,analyticsInsights,analyticsPdf}.ts* · api: analytics/{pro,goal,alerts,winback,summary,weekly}, spotlight |
| Import clients and appointments from other apps. **[plan: Apprentice+]**, role must be exactly `professional` ⚠ may email | `/import` | app/import/page.tsx, app/lib/{appointmentImport,importBatch,importSave,importSources}.ts, app/lib/calendarImport/* · api: pro/import |
| Chair openings: browse and apply with a resume ⚠ emails the shop | `/chairs` | app/chairs/page.tsx · api: chairs, chairs/apply, chairs/resume-upload |
| Subscription: solo plans, Stripe Checkout and portal, profile boosts ⚠ money | `/subscription` | app/subscription/page.tsx, app/lib/plans.ts · api: stripe/subscription/{create-checkout-session,customer-portal}, boosts |
| Verification: upload a licence or student documents ⚠ emails admins | `/verification` | app/verification/* · api: verification/{upload-url,submit} |
| Refer a pro: link and stats. Linked for everyone, but the API returns 403 for non-pros **[half-built]** | `/refer` | app/refer/page.tsx · api: referrals |
| Gift cards you sell: share link, list, redeem | `/gift-cards` | app/gift-cards/page.tsx · api: gift-cards/manage |
| Reply to reviews | on `/profile/[id]` | app/profile/[id]/ReviewReply.tsx · api: reviews/reply |
| Complete a booking, mark a no-show (charges the fee) ⚠ money, sends | on bookings and work | api: bookings/{complete,no-show}, app/lib/bookingCompletion.ts |
| Payout account (Stripe Connect Express) | `/account`, `/earnings` | api: stripe/connect/{create-account,account-status,onboarding-link,dashboard-link} |
| Busy times for booking UIs | api only | api: professional/busy-times, app/lib/{busyTimes,fetchBusyTimes}.ts |
| Profile and chair boosts (a week of paid placement) ⚠ money | `/subscription`, studio chairs | api: boosts, app/lib/{boosts,boostsServer}.ts |
| Spotlight placement. **[plan: Pro+]** | `/discover` | api: spotlight, components/SpotlightStats.tsx |

## Studio (shops)

Every section lives in `app/studio/` (layout.tsx, StudioContext.tsx, StudioTabs.tsx, [section]/page.tsx). Any unknown section returns a 404.

| Feature | Route | Main files |
|---|---|---|
| Setup in 4 steps (shop, you, team invites, plan) when you have no studio. Choose-plan banner until the plan is live ⚠ money | `/studio` | Setup.tsx, Plans.tsx · api: studio, studio/billing |
| Today / front desk: what's next, who's free, one-tap walk-in, waiting requests, checklist | `/studio` | app/studio/page.tsx, Today.tsx · api: studio/schedule |
| Shop calendar: walk-ins, phone bookings, done / no-show. The tab is hidden from plain members but the page has no guard **[half-built]** | `/studio/calendar` | Schedule.tsx · api: studio/schedule, studio/front-desk (402 if the plan isn't live), bookings/no-show |
| Requests near the shop; managers pass them to a pro | `/studio/requests` | Requests.tsx · api: studio/requests |
| Team: members, invites, roles, commission or booth rent. **[plan: Studio Plus]** for commission and rent ⚠ invite emails | `/studio/team` | Team.tsx · api: studio/{members,invite,rent} |
| Clients: list, import, invite to LineUp, remove ⚠ invite emails | `/studio/clients` | Clients.tsx, clientImport.ts · api: studio/clients, studio/clients/unsubscribe |
| Calendar and client import from other apps | `/studio/import` | Import.tsx, app/lib/calendarImport/* · api: studio/import |
| Memberships: plans for regulars, check-ins | `/studio/memberships` | Memberships.tsx · api: studio/memberships |
| Chair openings: post, review applicants, boost | `/studio/chairs` | Chairs.tsx · api: chairs, chairs/manage, boosts |
| Shop analytics by pro, chair and hour; alerts; weekly push | `/studio/analytics` | components/analytics/ShopAnalytics.tsx, app/lib/analytics*.ts · api: analytics/{shop,goal,alerts,winback} |
| Shop earnings (pros' sales, shop cut, rent, memberships, gift cards) | `/studio/earnings` | components/earnings/EarningsReport.tsx (scope=shop) · api: earnings?scope=shop |
| Settings: shop profile, plan and billing, shop payout account, default commission. Owner only, reached from a header button. **[plan: Studio Plus]** for commission and payouts | `/studio/settings` | Settings.tsx · api: studio/{settings,billing,payouts} |
| Join a shop from an invite link | `/studio/join` | app/studio/join/page.tsx · api: studio/join |

## Admin

| Feature | Route | Main files |
|---|---|---|
| Admin dashboard (Users, Verification, Newsletter, Content). It checks `is_admin` in the browser only; the APIs check it again on the server | `/admin` | app/admin/page.tsx |
| Users: search, toggle featured and founding artist | api | api: admin/users |
| Content moderation: delete requests, reviews, portfolio items | api | api: admin/content |
| Verifications: approve or reject ⚠ emails the pro | api | api: admin/verifications, components/AdminVerifications.tsx, app/lib/verificationServer.ts |
| Newsletter: audience counts and send the current issue ⚠ **emails the whole real list** | api | api: admin/newsletter, components/AdminNewsletter.tsx |
| Legacy newsletter send, using the `x-admin-key` header ⚠ real list **[unused][legacy]** | api (removed 25 Nov) | api: send-newsletter |
| Newsletter test send to a hard-coded address **[unused]** | api (removed 25 Nov) | api: send-newsletter-test |
| Newsletter audience (returns every subscriber's email) **[unused]** | api (removed 25 Nov) | api: newsletter-audience |

## Money, notifications and crons

### Money (Stripe and Stripe Connect)

| Feature | Main files |
|---|---|
| Stripe webhook: payment_intent.*, setup_intent.succeeded, checkout.session.completed (boost, gift card, membership, rent, studio plan, pro plan), customer.subscription.updated/deleted, invoice.payment_failed | api: stripe/webhook |
| Booking payment intent. Refuses unverified pros; booking cap is Basic 15, Apprentice 25, Pro/Master unlimited a month | api: stripe/create-payment-intent, app/lib/{paymentBookings,commission}.ts |
| Commission: 15% standard, 10% Master while live, 0% for a live Studio's members on their own clients. It comes out of the price, never on top. **Do not change** | app/lib/commission.ts, app/lib/plans.ts |
| Tip (0/15/18/20%) and gift card applied at checkout | api: stripe/tip, stripe/gift-card, app/lib/giftCheckout.ts |
| Pay at shop: card saved with a SetupIntent, no-show fee charged only on a no-show | api: bookings/pay-at-shop, bookings/no-show, app/lib/payAtShop.ts |
| Gift cards: checkout, webhook activation, balance, redeem ⚠ emails on activation | api: gift-cards/*, app/lib/{giftCards,giftCardsServer}.ts |
| Memberships and booth rent (Checkout subscriptions) | api: memberships, studio/memberships, studio/rent, app/lib/memberships.ts |
| Pro plans, studio plans, boosts | api: stripe/subscription/*, studio/billing, boosts |
| Connect payouts for pros and for shops (a separate shop account) | api: stripe/connect/*, studio/payouts |
| Referral credit (Stripe customer balance) when a referred pro pays | api: referrals, app/lib/referrals.ts |
| Payments health: says whether keys are live or test and whether they match. Never returns key values | api: health/payments |

### Notifications

| Feature | Channel | Main files |
|---|---|---|
| Email core (Resend). **No dry-run switch**; a real key sends for real | email | app/lib/email.ts |
| SMS core (Twilio). Off unless the TWILIO_* vars are set, which they aren't (it was "never wired up") **[half-built]** | SMS | app/lib/sms.ts |
| Web push core (VAPID) | push | app/lib/push.ts, app/lib/useWebPush.ts |
| New request goes to matching pros ⚠ | email, SMS, push | api: notifications/request-created |
| New offer goes to the customer ⚠ | email, SMS, push | api: notifications/offer-created |
| Booking confirmed (internal, CRON_SECRET) ⚠ | email, SMS, push | api: notifications/booking-confirmed |
| Clear notifications for a withdrawn offer or cancelled request | none | api: notifications/clear-{offer,request} |
| Weekly push opt-in | none | api: notifications/weekly-push, components/WeeklyPushToggle.tsx |
| In-app notifications list (`notifications` table) | in app | components/{MarkRequestNotificationRead,NotificationNudge}.tsx |
| Other senders: win-back, booking complete (review request), chair apply, pro import, studio clients, studio invite, verification submit ⚠ | email, push | see the Pro and Studio tables |

### Crons (vercel.json; all check `Bearer CRON_SECRET`)

| Cron | When (UTC) | What it does | Sends |
|---|---|---|---|
| `/api/reminders` | daily 09:00 | Booking reminder about 24h ahead | email, SMS, push ⚠ |
| `/api/cron/auto-complete-bookings` | daily 10:00 | Completes bookings more than 24h old and releases payouts | email ⚠, **moves money** |
| `/api/cron/expire-verifications` | daily 11:00 | Expires lapsed verifications | email ⚠ |
| `/api/cron/completion-nudges` | daily 12:00, plus every ~15 min from GitHub Actions | "Did it happen?" nudge once a booking has ended | push ⚠ |
| `/api/cron/standing-appointments` | daily 13:00 | Rolls regulars forward: pay link a week before, frees the slot two days before | email, push ⚠ |
| `/api/cron/rebook-nudges` | daily 15:00 | "Time for your next one?" three weeks after a visit | email, push ⚠ |
| `/api/cron/weekly-summary` | Mon 14:00 | Weekly stats email to pros and owners | email ⚠ |
| `/api/cron/weekly-push` | Mon 14:00 | Weekly stats push for those who opted in | push ⚠ |
| `/api/cron/enable-direct-booking` | GitHub Actions only, not in vercel.json | One-off catch-up that turns on instant booking for paying pros | none |

## Dead or odd code found while mapping

- **[unused]** app/components/AccordionSection.tsx (services/page.tsx has its own copy), app/components/discover/SwipeStack.tsx, app/components/analytics/AnalyticsView.tsx, and so `GET /api/analytics` (the root route).
- The schema is split across supabase/RUN_THIS_ONCE.sql, supabase/STUDIO_SETUP.sql and supabase/migrations/ (history starts 24 Sep).
- The paid-plan check `isSubscribedToSchedule` is copied in three places, and role checks are written differently on each page (a `shop` role passes the earnings and analytics checks).
- Very large client files: RequestDetailPageClient (~3.3k lines), ProfilePageClient (~3.4k), RequestsPageClient (~2.7k), AccountPageClient (~2.3k), requests/new (~1.5k).
- Unmerged branches (one commit each, not on main): `admin-comp` (admin gives a shop a free plan), `polish-and-speed-pass`, `promo-code-reels` (REELS promo code).
