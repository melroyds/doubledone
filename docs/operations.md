# DoubleDone, operations

*The control centre: what watches the live service, what the alarms mean, and how to run it. The implementation is [`server/src/monitor.ts`](../server/src/monitor.ts); this is the operator's guide. The notes after the rollback section cover the rest of the operator's picture as of the 2026-07-12 release: the `/energy` route's spend, cross-device scrapbooks, cutting a release, and the exact-alarm Play declaration.*

---

## What it is, and why

A solo founder cannot watch a dashboard, and a new product on a $25/month AI budget can hit trouble (a spend spike, an outage, an abuse run) in the hours between glances. The control centre is a proactive early-warning system: it rides the Worker's existing hourly cron, sweeps the live telemetry, and emails the owner only when something needs attention. **Silence is the healthy state.**

## The alarms

Each fires to the `FEEDBACK_TO` inbox, de-duplicated so the same kind cannot repeat within 6 hours:

| Alarm | Trips when | Why it matters |
|---|---|---|
| **Spend** | month-to-date Anthropic spend reaches 50% of the cap, or the month-end projection exceeds it | the $25 cap is a kill switch; hitting it makes every AI route fail, so you want the warning, not the wall |
| **Errors** | ≥5 AI errors in an hour and >30% of calls fail, or ≥10 in an hour outright | a Claude outage or a broken deploy shows here first |
| **Scrapbook budget** | global image generations today cross the daily guard | the Workers AI free-tier neuron budget is the wall the dollar query cannot see |
| **Scrapbook abuse** | one source nears the per-IP 24h cap | a script trying to drain the shared image budget |
| **Volume** | AI calls in an hour exceed the launch-normal ceiling | a surge (good) or an attack (bad); the endpoint mix tells you which |
| **App events volume** | 2,000 or more feature-usage counts in one day | the `/event` beacon takes no token, so a flood is likely scripted and would poison the counts in `app_event_counts` |
| **Stripe** | a dispute, refund, or failed payment arrives on the webhook, or the webhook cannot read a subscription from Stripe (at most one email per 6 hours) | real-money events Stripe's dashboard no longer emails about, and a broken `STRIPE_SECRET_KEY` found inside Stripe's three days of retries instead of after them |
| **RevenueCat** | a delivery fails the HMAC signature check (at most one email per 6 hours), or a TRANSFER event arrives | a signing secret out of step with the dashboard, or a purchase moving between accounts, which writes nothing |

The alert email is deliberately information-poor: counts, endpoints, error strings, and dollar amounts only. Never task text, never an IP, never a user id. An alert email is a new way data leaves the pseudonymous store, so it carries nothing identifying.

## The daily pulse

Once a day (20:00 UTC, so about 6am in Melbourne, or 7am during daylight saving) the cron emails a one-line summary: calls, errors, month-to-date spend, premium count, trials, new premium, scrapbooks, reminder subscriptions. It is not an alarm. Its job is the pulse, and its mere arrival is proof the cron and email path are alive.

## The dead-man's-switch

The custom alarms only protect you while the cron is firing. If the cron silently stops, every alarm goes dark and you would never know, the worst failure mode because it is invisible. So the cron pings an external watcher (`HEARTBEAT_URL`, e.g. a Healthchecks.io check) on every tick, first and unconditionally. The watcher emails you if the pings stop. With it, silence provably means healthy rather than "the alarm itself died."

## Running it

**Configuration** (Worker secrets and vars, see [`server/wrangler.jsonc`](../server/wrangler.jsonc)):
- `ANTHROPIC_MONTHLY_CAP_USD` (var, default `25`): the spend baseline. Tunable without a code change.
- `SEND_EMAIL` (binding) + `FEEDBACK_TO` (secret): the alert email path, shared with in-app feedback.
- `HEARTBEAT_URL` (secret, optional): the dead-man's-switch ping. Set with `npx wrangler secret put HEARTBEAT_URL`.

**Tuning thresholds:** the named constants in `THRESHOLDS` at the top of `monitor.ts`. They are set deliberately low for tiny launch numbers (a low absolute floor plus a ratio, so a 2-of-2 blip is not read as 100% failure). Retune after real traffic.

**Testing it:** the pure logic (pricing, the threshold evaluation, the dedup, the email bodies) is unit-tested in `server/src/monitor.test.ts`. To exercise the live path, spike a value in D1 (insert a few `ok=0` `ai_calls` rows) and wait for the next hourly tick, or simply wait for the daily pulse, its arrival confirms the whole chain.

**The native layer (outside this code):** turn on Cloudflare's Pages deploy-failure and Worker notifications, a 5-minute uptime monitor on `/health` (e.g. UptimeRobot), and Stripe's own alerts. Route the native ones to a different channel (your phone) than the custom path, so the two do not share a single point of failure.

## What cannot be rolled back

The D1 schema (the `alerts_sent` dedup table) is additive and safe. Key rotations and any deletion of telemetry cannot be undone. The sweep itself is best-effort and fails open everywhere, so it can never break the app or the daily nudge it shares the tick with; the worst case is a missed alarm, not an outage.

---

*Everything above is the monitor. The notes below are the rest of the operator's picture, first added after the 2026-07-12 Android cut (versionCode 11, which went to closed testing only. The first public Android release was versionCode 20, on 2026-07-31).*

## Refunding a subscriber: refund AND cancel, always both

**A refund does not revoke premium.** `charge.refunded` is wired to the money-trouble ALERT only (it emails you); it never touches the `entitlements` row. Nothing else does either: premium is changed by `checkout.session.completed` and the `customer.subscription.*` events, and a refund is none of those. So a customer refunded mid-period keeps their access, and if the subscription itself is still live they will simply be charged again next cycle.

**The rule: whenever you refund in the Stripe dashboard, cancel the subscription in the same visit.** The cancellation fires `customer.subscription.*`, which is what actually writes `premium=0`. One extra click, and the webhook does the rest correctly.

**This is deliberately NOT automated.** Auto-revoking on `charge.refunded` looks tidy and is a trap: Stripe fires that same event for PARTIAL refunds, so a few dollars returned as goodwill would strip a paying subscriber's access entirely. Wrongly revoking someone who paid is the worst failure this particular app can have, and a refund is already a rare, deliberate, human action taken with the dashboard open. A documented click beats a clever webhook that can misfire. Revisit only if refund volume ever makes the manual step unreliable.

*Verified 2026-07-25 on the live table: the Apple sandbox EXPIRATION had landed correctly (premium 0, status `expired`, written 72 seconds after the expiry), and a stale TEST-mode Stripe row that had been left granting premium to a real user id was zeroed by hand. Test-mode Stripe events go to a separate endpoint with a separate signing secret, so a test subscription ending in production listens to nothing: never read a test-mode row as evidence about the live path.*

## The Stripe webhook writes the live subscription (2026-11-01)

Stripe delivers webhooks at least once, out of order, and retries a failed delivery for up to three days, so an event's own copy of a subscription can be days old. Until 2026-11-01 `/stripe-webhook` wrote that copy, so a retried `past_due` landing after the card was fixed switched a payer to "fix your card", and an old subscription's `incomplete_expired` switched off a new paid one. Now (`server/src/stripe.ts` `handleWebhook`):

- **Every `customer.subscription.*` event, and the subscription behind `checkout.session.completed`, is read from Stripe by id** (`GET /v1/subscriptions/{id}`, one read per event, eight seconds at most) and the LIVE object is written. A redelivered event is still skipped first (`processed_events`), before any read. **An ending is the exception**: a copy whose status is `canceled` or `incomplete_expired`, both of which Stripe documents as terminal, is written as the event carries it, with no read. Nothing can follow a terminal state, so the copy cannot be stale, and a canceled subscription never sends another event, so an ending that waited on the read and was lost would keep Premium on for good.
- **The row remembers which subscription it is about** (`entitlements.stripe_sub`). While that subscription is alive (premium, or a Stripe `past_due`/`unpaid`), news about a DIFFERENT subscription that is not a fresh sale writes nothing. The Worker adds the column itself on its first entitlement write, Stripe's or RevenueCat's (no ALTER to apply by hand). A row written before the deploy carries no id until its subscription's next event, so for that first period it is judged as before.
- **The reply says what happened**, in Stripe's dashboard beside each delivery: `{"received":true,"live":"active"}` (written, with the status Stripe holds now), `{"received":true,"final":"canceled"}` (an ending, written from the event itself), `"healed":true` (the row recorded an older subscription Stripe holds as ended, so the guard let this write land, see the self-heal below), `"kept":true,"by":"other-subscription"` (about an old subscription, refused) or `"by":"other-store"` (an Apple or Google row, refused), `"duplicate":true` (already applied). A bare `{"received":true}` is an event that is not an entitlement change.
- **`500 subscription read failed` means Stripe could not be read**, so the change was not written and Stripe will retry. Each one emails `FEEDBACK_TO` ("Stripe webhooks cannot read subscriptions"), at most once every six hours, naming Stripe's HTTP status and error code and the event. A 401 or 403 is the `STRIPE_SECRET_KEY` Worker secret (wrong, revoked or blank): put the live secret key straight from the clipboard, `Get-Clipboard -Raw | npx wrangler secret put STRIPE_SECRET_KEY` from `server/` in PowerShell (wrangler accepts a blank secret without complaint, see CLAUDE.md's gotchas). A 404 `resource_missing` on every delivery is a test-mode key. A 429, a 5xx or no answer is Stripe struggling, and usually passes. While it lasts, endings still land (above), and a paid `checkout.session.completed` is granted from the session's own copy before the 500, so the purchase shows and Go Premium refuses a second subscription; Stripe's retry then writes the live state. That grant never lands on a row that already records its subscription, so a session retried after its subscription ended cannot undo the ending. `500 store error` is D1, as before; if it follows this deploy on every delivery, the column could not be added, so apply `ALTER TABLE entitlements ADD COLUMN stripe_sub text` by hand.
- **After three days Stripe stops retrying**, so a key fixed later does not bring a failed delivery back by itself. In Workbench, open the webhook endpoint's Event deliveries tab (each delivery shows as Delivered, Pending or Failed) and press Resend on each failed one, which works up to 15 days after the event. The Stripe CLI's `stripe events resend evt_... --webhook-endpoint=we_...` works up to 30 days after. Past that an event is gone, and the row has to be set by hand from what the dashboard shows for the subscription.
- **Resending an event that was already applied proves nothing**: it answers `duplicate` before any read. To see the live read work, look at the next real delivery's reply, or replay in test mode.
- **A recorded subscription that has ended stops guarding the row (the self-heal).** A Worker from before 2026-11-01 (a rollback, a deploy from a branch without this change, a D1 Time Travel restore) writes the rest of the row but leaves `stripe_sub` as it was, so an id can go stale, and a stale id would refuse the real subscription's past_due and ending for good, keeping Premium on for a non-payer. So when the guard refuses a write on a Stripe row, the webhook reads the recorded subscription from Stripe once. Alive there (active, trialing, past_due, unpaid): the refusal stands. In any other state, with the row's customer being that subscription's or the incoming one's (every Checkout makes its own customer): the write lands in the same statement and records the new subscription (`"healed":true`). A row about some third subscription keeps the refusal, so an old subscription's late ending still cannot switch off a live one, and that third subscription's own next event heals it. A 404 for the recorded id is never read as an ending, because a test-mode key answers that for every live id: it answers 500 and alerts like any failed read. So nothing needs clearing after a rollback; the old step (`UPDATE entitlements SET stripe_sub = NULL`) is no longer needed, and running it would only switch the guard off until each subscription's next event. **Before any Worker deploy from `premium`, merge `main` into it first** (`git diff --stat main premium -- server` must be empty): a deploy from a branch without this change rolls it back.

**Replaying in test mode.** Test-mode events go to their own endpoint with their own signing secret (the note above), so production never applies one. Run the Worker locally with test-mode values in `server/.dev.vars` (`STRIPE_SECRET_KEY` the test secret key, `STRIPE_WEBHOOK_SECRET` the `whsec_` that `stripe listen` prints), apply the schema to the LOCAL D1 (`npm exec -w server -- wrangler d1 execute doubledone-telemetry --local --file d1/schema.sql`), start `npm --workspace server run dev`, and forward with `stripe listen --forward-to localhost:8787/stripe-webhook`. Give each test subscription `metadata[user_id]` set to a test uuid. `stripe events resend evt_…` then redelivers an event to the listener; to replay one that already landed, first `DELETE FROM processed_events WHERE event_id = 'evt_…'` on the local D1, or the resend answers `duplicate`.

## The RevenueCat webhook (Apple and Google Play), added 2026-07-18

`POST /rc-webhook` (`server/src/revenuecat.ts`) is a second billing webhook beside `/stripe-webhook`. It writes the SAME D1 `entitlements` row (via the `source` column) when an Apple or Google Play subscription changes. It has **two layers of auth**:
1. The **`RC_WEBHOOK_AUTH`** Worker secret, always required: a long random string set both here AND as the webhook's Authorization header in the RevenueCat dashboard, and the two must match. No secret set → the route 503s (safe default). A wrong header → 401, no write.
2. **RevenueCat's HMAC signature** (added 2026-10-04), active only once the **`RC_WEBHOOK_HMAC`** Worker secret is set. Each delivery then must carry `X-RevenueCat-Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.raw body">`, within five minutes. **Turning it on, in this order:** RevenueCat dashboard → the webhook → toggle **HMAC webhook signing** (the secret is shown ONCE), then copy it and run `Get-Clipboard -Raw | npx wrangler secret put RC_WEBHOOK_HMAC` from `server/` in PowerShell (straight from the clipboard: wrangler accepts a BLANK secret without complaint, a blank one switches the check off silently, and a paste into its hidden prompt can fail unseen on Windows, which is exactly what happened on 2026-10-04), then **Send test event** and confirm it lands in `rc_events` as `TEST`, not `bad-signature`. Done and verified 2026-10-04 (Worker version `667b5a49`). The webhook's Authorization header value is masked in RevenueCat and not written down anywhere, so a probe that needs it is not possible: prove the signature by a clipboard put plus a test event instead. The reverse order would refuse every delivery until both match. **Rotating:** Rotate in RevenueCat (the old secret dies at once), then put the new one straight away; RevenueCat's first retry is five minutes later, so a quick put loses nothing.

If purchases stop unlocking Premium, check: (0) a 401 whose body is **`bad signature`**, an `rc_events` row with outcome `bad-signature`, or an owner alert email saying so, all mean `RC_WEBHOOK_HMAC` does not match the dashboard: put the current secret, or `npx wrangler secret delete RC_WEBHOOK_HMAC` to fall back to the Authorization header alone; (1) the two Authorization secrets still match; (2) the Worker is deployed; (3) the RevenueCat dashboard shows the webhook delivering 2xx.

**The order and which-subscription guards** (2026-10-04). Each `entitlements` row remembers the `event_timestamp_ms` of the last RevenueCat event it applied (`rc_event_ms`) and the store subscription behind it (`rc_txn`, the `original_transaction_id`). An older event never overwrites a newer one (a retried EXPIRATION cannot switch off a payer whose RENEWAL landed), and a non-sale about a different subscription cannot touch a live row (a late refund for an old subscription cannot switch off a new one). Refusals are logged as `stale-order` or `other-subscription` (the cross-store guard stays `kept`). **Before any deploy that writes these columns, they must exist**, or EVERY entitlement write (Stripe's too) throws: `npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --command "ALTER TABLE entitlements ADD COLUMN rc_event_ms integer"`, the same for `ADD COLUMN rc_txn text`, then read back with `--command "PRAGMA table_info(entitlements)"`, then `npx wrangler deploy`. A TRANSFER event (should never fire under keep-with-original Restore Behavior) emails `FEEDBACK_TO` and writes nothing. The webhook is idempotent (the `rc:`-namespaced event id in `processed_events`) and fails open, like the Stripe one, so a redelivery or a dedup hiccup is harmless.

**`POST /apple/reconcile`** (2026-08-19) attaches an ANONYMOUS Apple purchase to the account that owns it. App Review 5.1.1(v) forbids requiring registration before purchase, so an iOS user can buy signed out; RevenueCat issues an `$RCAnonymousID:` and every webhook for it is dropped, leaving a paying customer with no row at all. Signing in calls `Purchases.logIn`, which aliases their Supabase id onto that RevenueCat customer, but fires no new webhook, so the client asks this route to look once. It needs the **`RC_SECRET_KEY`** Worker secret: a RevenueCat **v1 secret** key (`sk_…`, Project settings -> API keys -> Secret API keys), never the public SDK key. v1 and not v2 because `GET /v1/subscribers/{id}` returns per-subscription `is_sandbox` in one call, which the fail-closed sandbox check depends on. The client sends no body: the server uses the verified `sub` from the caller's token, so a caller can only reconcile themselves. If Apple purchases made while signed out are not appearing after sign-in, check (1) `RC_SECRET_KEY` is set and is a v1 SECRET key, (2) the RevenueCat customer shows the Supabase UUID under aliases, (3) the subscription is not sandbox.

**Sandbox and TestFlight deliveries are refused** (2026-08-19). Nothing read RevenueCat's `environment` field until then, so StoreKit sandbox events, running on Apple's accelerated fake clock with no money moving, wrote the production `entitlements` table exactly like real charges. A TestFlight customer with a fake 2013 first-seen was being counted among real subscribers, and anyone with a TestFlight build could grant themselves Premium. The guard IGNORES a sandbox event (acknowledged, logged with `outcome='sandbox'`, never applied), and fails OPEN on a missing `environment`, because dropping a real purchase costs a paying customer their access and that is far worse than a stray test row. Testers lose nothing: RevenueCat still grants the entitlement on-device, so `localPremium()` reads true and the client merges it over the server's answer.

**Every delivery is logged, including the ones we ignore** (the `rc_events` D1 table, added 2026-08-19). The `entitlements` row is one-per-user and last-write-wins, so it says what somebody's access is NOW and nothing about how it got there. On 2026-08-19 a customer asked why Apple had billed them, and answering "was that a trial or a real charge, and was it even production" took a day across two third-party dashboards, because the webhook read past `period_type` and `environment` and kept no history. Worse, an ANONYMOUS purchase resolves to no Supabase id and is dropped at the door, so a paying customer existed nowhere in our data at all. The table is a named allowlist of columns (no country, no `subscriber_attributes`, no IP, no raw body), self-creating at the call site so deploy order never matters, and every row carries an `outcome` saying WHY the event ended as it did. The three queries worth knowing:

```bash
# What has Apple actually sent us, and how much of it was real?
npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --command "SELECT environment, period_type, type, COUNT(*) n FROM rc_events GROUP BY 1,2,3 ORDER BY n DESC"
```

```bash
# Paying customers we cannot see: an event we could not attribute to any account.
npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --command "SELECT app_user_id, type, period_type, datetime(event_timestamp_ms/1000,'unixepoch') at FROM rc_events WHERE user_id IS NULL ORDER BY event_timestamp_ms DESC LIMIT 20"
```

```bash
# Where did this person's entitlement come from? (provenance, incl. sandbox contamination)
npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --command "SELECT e.user_id, e.status, e.source, r.type, r.period_type, r.environment, r.outcome, r.created_at FROM entitlements e LEFT JOIN rc_events r ON r.user_id = e.user_id ORDER BY r.created_at DESC LIMIT 30"
```

The log starts the day it deploys and is deliberately NOT backfilled: RevenueCat does not replay historical webhooks, and an audit log mixing observed rows with reconstructed ones is worse than one that honestly starts empty, because the next person cannot tell which rows are evidence. The history up to that point is written as dated prose in `decision-log.md` instead.

## The /energy route in the spend picture

Energy matching ("What fits right now?", shipped 2026-07-11, living inside Focus mode's picker since 2026-07-12) calls `POST /energy` on the Worker: today's open tasks plus an energy level in, ONE picked task with a short warm line out ([`server/src/energy.ts`](../server/src/energy.ts)). What an operator needs to know:

- **Cheap by design.** Claude Haiku, roughly USD 0.002 a call, so a free user maxing the month costs about USD 0.03. It rides the same $25 cap and shows in the same spend query as every other AI route.
- **The free meter lives on the device, not the server.** Free is 15 picks a calendar month (`client/src/lib/energy.ts`), with calm reminders exactly at 10 and 5 left; past 15 the tap routes to the paywall and no AI call is ever made. A use is spent only on a successful pick, so a flaky network cannot drain the month. Premium is unmetered, and there is no per-user hourly cap on this route (that cap exists only on the MCP `break_down` tool).
- **The shared server guards apply**: the origin gate, the per-IP rate limit (30 requests per 60 seconds, the `AI_LIMITER` binding), and the 100 KB body cap, plus the route's own input bounds (50 tasks, 200-character titles) and the rule that the returned task id must be one that was actually sent, so a hallucinated id can never reach the client.
- **Telemetry logs `{count, energy}` only**, never task text, so the alarm emails stay information-poor as always.

## Scrapbooks across devices

Keepsakes follow the account as of 2026-07-12. Two moving parts an operator should know:

- **The Supabase `scrapbooks` table** (in [`supabase/schema.sql`](../supabase/schema.sql)): one row per user per week, RLS all four ways, `created_at` written by the client as the last-write-wins truth (a remade week replaces everywhere). Only R2-served https URLs sync; legacy `data:` keepsakes stay on the device that made them. The table had to exist on live before the client that syncs it shipped (the column-first rule); Melroy ran it 2026-07-12.
- **The R2 image route sends CORS.** `GET /scrapbook-img/:key` returns `access-control-allow-origin: *` because the web client `fetch()`es the image to composite the shareable keepsake page (the caption baked into the jpeg). Safe to leave open: public read-only bytes behind an unguessable UUID key, already loadable cross-origin by any `<img>` tag. Removing the header silently degrades web sharing of R2-persisted keepsakes, so leave it.

One accepted edge: deleting an account purges R2 objects from the deleting device's local list, so an object known only to another device can orphan in R2. The table rows themselves die by cascade, and the keys are unguessable.

## Cutting a release

The process used for the 2026-07-12 Play release (versionCode 11), the template for the next one:

1. **Device-verify on a matching preview APK first.** The AAB should carry only code a device pass has already proven (versionCode 11 was cut after the APK pass on the same JS).
2. **Queue the production AAB**: `npx --yes eas-cli build -p android --profile production --non-interactive` from `client/` (`eas-cli` is not a dependency of the repo, and plain `npx eas` fails because the package is named `eas-cli`). For iOS the same profile builds with `-p ios`, then `npx --yes eas-cli submit -p ios --latest` sends it to App Store Connect. EAS holds the version remotely (`appVersionSource: "remote"` plus `autoIncrement: true` in [`client/eas.json`](../client/eas.json)), so every production build bumps `versionCode` by itself and the repo never carries it.
3. **Tag the frozen commit**: `git tag android-vN <commit>`, then push the tag. `android-v11` marks `d983bbf`, so a store bug can always be reproduced from exactly the code that shipped. (It is the only tag so far: later releases were not tagged.)
4. **Align the version name at the cut** (decided 2026-07-12): set `expo.version` in [`client/app.json`](../client/app.json) to match the CHANGELOG heading before queueing the AAB. versionCode 11 shipped with the name lagging at 1.0.0 while the changelog read 1.2.0; from the next release the two move together.
5. **Web ships from the same commit** (versionCode 11's web deploy came from `d983bbf` too), so the two surfaces never drift within a release.
6. **Builds only on Melroy's explicit ask** (rule, 2026-07-12): never queue an EAS build (APK or AAB, any profile) on your own initiative, and ask before any cancel-and-requeue consolidation. EAS moved to a paid Expo subscription (US$19/month) in the week of this release; the ask-first rule stands regardless.

## The exact-alarm Play declaration

The app declares `android.permission.SCHEDULE_EXACT_ALARM` ([`client/app.json`](../client/app.json), added 2026-07-12) so Rhythm nudges, checklist nudges and the daily reminder arrive on time instead of being deferred by Doze. On Android 12-13 the declared permission is pre-granted; on Android 14+ the user flips "Alarms & reminders" via the in-app door in the nudge-health block, and the resilience sweep re-arms everything the moment they return.

If the Play Console asks for the exact-alarm declaration, the answer is: **exact alarms power user-set reminders as core functionality** (rhythms and reminders the user sets explicitly in the app). We deliberately did not take `USE_EXACT_ALARM`, which is auto-granted but Play-policy-restricted to alarm and calendar apps; a to-do app leaning on it invites a rejection.

## The Analytics Centre (added 2026-08-01)

**`GET https://api.doubledone.app/admin/analytics?token=<ANALYTICS_TOKEN>`** is the owner's
morning glance, bookmarkable on a phone. Token-gated (the `ANALYTICS_TOKEN` Worker secret,
same shared-secret posture as the RevenueCat webhook), read-only, no-store, noindex,
server-rendered from D1 with no client involvement. Six sections: **Money** (premium by
store/status + active trials), **AI spend** (month-to-date vs the cap, with the month-end
projection and the 7-day endpoint mix), **The moat** (decompositions offered vs
came-back-with-a-finished-step, median days to the first step), **Scrapbooks** (all-time and
28-day counts), **The room** (Settle opens, plus every feature-usage count over 28 days), and
**AI calls by day** (28 days, with errors).

Set or rotate the token (pick any long random string; it lives only in the Worker and your bookmark):

    npm exec -w server -- wrangler secret put ANALYTICS_TOKEN

Unset, the page answers 503, never an open dashboard. Stripe and RevenueCat's own dashboards
remain the deep-dive for money; Play Console and App Store Connect for installs. The client's
`track()` calls stay on the device, except a closed list of twenty feature names, which post to
`/event` and land in D1 `app_event_counts` as one counter per name per day
([`client/src/lib/telemetry.ts`](../client/src/lib/telemetry.ts),
[`server/src/events.ts`](../server/src/events.ts)).
