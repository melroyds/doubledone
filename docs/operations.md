# DoubleDone, operations

*The control centre: what watches the live service, what the alarms mean, and how to run it. The implementation is [`server/src/monitor.ts`](../server/src/monitor.ts); this is the operator's guide.*

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
| **Stripe** | a dispute, refund, or failed payment arrives on the webhook | real-money events Stripe's dashboard no longer emails about |

The alert email is deliberately information-poor: counts, endpoints, error strings, and dollar amounts only. Never task text, never an IP, never a user id. An alert email is a new way data leaves the pseudonymous store, so it carries nothing identifying.

## The daily pulse

Once a day (around 6am Melbourne) the cron emails a one-line summary: calls, errors, month-to-date spend, premium count, trials, new premium, scrapbooks, reminder subscriptions. It is not an alarm. Its job is the pulse, and its mere arrival is proof the cron and email path are alive.

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
