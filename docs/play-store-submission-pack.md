# DoubleDone, Google Play submission pack (2026)

Assembled June 2026 from a readiness audit (Data Safety form, current 2026 Play policy verified by web
search, refreshed listing). This is the current source of truth. It **supersedes
[play-store-release.md](play-store-release.md) section 6**, which wrongly marks closed testing as optional.
Work the "Before you can submit" list during the 14-day closed-test window, nothing here blocks starting
the test.

---

## The timeline reality (read first)

Google requires a closed test before a **new personal account** can publish to production:

- **12 testers, opted in for 14 consecutive days**, before you can apply for production access. (Was 20;
  cut to 12 on 11 Dec 2024.) A tester dropping out resets the clock. Google now measures **engagement**, so
  testers must actually open and use the app over the two weeks, not just install it.
- The `$25` individual signup is a **personal** account, so this applies. Budget **~3 to 4 weeks** to
  production, then a 1 to 3 day review. It is uncompressible and is the dominant launch-date driver.
- Organisation accounts are exempt but need a D-U-N-S number (up to 30 days), so that is not faster for you.

**The single highest-leverage move: recruit and opt in 12 real testers today.** Your partner, friends, and
the ADHD / OCD people you built this for are perfect (and engaged daily users by nature). The 14-day clock
starts when they are in. Everything below happens in parallel.

Avoid the "12 testers fast / tester farm" services that flood search results. With Google now measuring
engagement, paid fake testers are a flag risk, and you do not need them.

---

## Before you can submit (the real to-do list)

### 1. Privacy policy: disclose the rate-limit IP  — *needs your OK (it is the live policy), then I apply it*
The audit found the **only** Data-Safety-vs-policy gap: the premium scrapbook route briefly logs the request
IP (24h) for abuse rate-limiting (`server/d1/schema.sql` scrapbook_log, write in `server/src/index.ts`), but
the policy leans hard on "no IP". The specific "no IP" claims it makes are true, but this log is never
mentioned, and a mismatch is an automatic rejection. Fix: add one line to **both** `client/src/app/privacy.tsx`
and `client/public/privacy.html` (kept in sync), under "Keeping the service running":

> To stop abuse of the AI image keepsake, our systems briefly note the network address a request came from,
> for no more than 24 hours, never tied to your account.

Then also **prune scrapbook_log rows older than 24h** (currently they are only filtered by query, not
deleted) so retention matches the claim. Belt-and-braces: widen the policy's AI-features list to "such as
Break it down, Sort, Combine, and the photo scan" so no reviewer thinks an undisclosed feature sends data.

### 2. Pin target API 36  — *MEDIUM, do before the production AAB*
`app.json` pins no `targetSdkVersion`, so it inherits the Expo SDK 56 default (API 35). From **31 Aug 2026**
new apps must target Android 16 (API 36). Pin it now via `expo-build-properties` (SDK 56 supports it) so the
launch build is already on the soon-mandatory level and no forced mid-launch rebuild can happen. About half a
day plus a device smoke-test. (Android 16 also brings the 16 KB page-size requirement, the smoke-test covers it.)

### 3. One-time AI consent before the first call  — *RECOMMENDED, your call*
You are 90% there: capture names Claude, the handoff line is honest, AI-off stops every call before it fires,
and the app is fully usable AI-free. The gap Google's late-2025 third-party-AI guidance prefers: AI is **on by
default**, so the first call can fire on a tap to "Sort for me" rather than a dedicated tap-to-accept. Cheap
insurance (~a day): a one-time card naming Anthropic / Claude before the first AI call, with "Use AI" and
"Stay offline". Debatable, the tap on "Sort for me" with the disclosure right above it arguably already
counts as the affirmative action. Worth a decision, not urgent.

### 4. The standing checklist
- Privacy URL returns HTTP 200 in an incognito browser (it is static HTML, just confirm after the deploy).
- Update the policy "Last updated" date to the submission date.
- Account verification complete (done).
- Exact-alarm and POST_NOTIFICATIONS justifications entered in the Console (see play-store-release.md 5a/5b).

---

## Good news (no action needed)

- **The generative-AI content policy does NOT apply.** It targets apps whose purpose is generating content;
  DoubleDone uses AI to improve existing features, which is excluded. Just keep the scrapbook keepsake image
  private and do not market it as shareable AI image generation.
- **External Stripe checkout is fine** for a productivity subscription. Never say "subscribe in-app" or "via
  Google Play". The listing already frames it correctly.
- **The data footprint is small and clean** and matches the privacy policy on everything except the one IP
  line above.

---

## Data Safety form, exact answers

Encrypted in transit: **YES** for everything (TLS to Supabase, the Worker, Anthropic, Stripe). Data deletion:
**YES**, in-app (Settings, the `delete_account` RPC cascades) and by email; use `doubledone.app/privacy` as the
data-deletion URL. No ads, no third-party analytics/trackers, no advertising ID.

| Data type | Collected | Shared | Optional? | Purpose | Note |
|---|---|---|---|---|---|
| Personal info > Email address | Yes | No | Optional | Account management | Only if the user turns on sync. OTP sign-in, no password. Supabase (Sydney). Deletable in-app. |
| App activity > Other user content (task text) | Yes | **Yes** | Optional | App functionality, personalization | Two opt-in flows: sync (to Supabase) and AI (to Anthropic). "Shared" because text leaves to Anthropic when AI is on. AI off = nothing sent. Pseudonymous AI-call copy in D1, no user_id, no IP. |
| Photos > Photos | Yes | **Yes** | Optional | App functionality (OCR scan) | Premium photo-to-tasks. Sent to Anthropic (vision), then discarded, not stored as an image. Only on explicit action, AI on. |
| Financial info > Payment info | Yes | **Yes** | Optional | Manage subscription, purchases | Billed by **Stripe** (external web checkout), not Play Billing. Stripe holds card data; DoubleDone never sees it. Be honest: Stripe retains payment records after deletion (tax/legal). |
| Device or other IDs (push endpoint; rate-limit IP) | Yes | No | Optional | Deliver reminders; **security/anti-fraud** | Push subscription only if reminders enabled (no user_id, no task text). The scrapbook rate-limit IP is the item in to-do #1. Declare the security use, not silence. |
| Location / Contacts / Health / Messages / Calendar / Audio / Files / Web history / Installed apps / Crash logs | **No** | No | n/a | n/a | Explicitly NOT collected. The audience is ADHD/autism/OCD, but the app collects no health data. |

---

## Store listing, paste-ready

**App name:** DoubleDone

**Short description** (<=80): `A calm to-do app for ADHD and overwhelm. Shows only today. AI optional.`

**Full description** (<=4000):

```
Today is finite and achievable.

DoubleDone shows you only what today needs, sized to be doable, and quietly keeps everything you finish. Nothing is ever overdue here. It just waits.

Most to-do apps hand you the whole list and call it motivation. For a lot of us, that is the overwhelm. DoubleDone is the opposite. A calm home screen, a small day, and a list that never shames you for a task simply existing.

MADE FOR
People with ADHD, autism, the AuDHD overlap, OCD, and anyone whose list has ever felt like too much. Built with care for how those brains actually work: low friction, no streaks to break, no guilt mechanics, no punishment for a task that has waited a while.

THE CALM CORE, FREE FOREVER
- Capture anything in seconds. One thing per line, in any order.
- See only today, sized so it feels possible.
- Break it down: take a dreaded task and turn it into small, doable steps.
- Make it tiny: a two-minute version, just to begin.
- Lighten today: ease a too-full day by moving a few things to later.
- Combine: fold several small tasks into one when the day feels cluttered.
- Gentle reminders, only the ones you ask for. Never nagging.
- Close the day kindly. It honours what you did, never what you didn't.
- Lookback: see everything you have actually finished, including the old task you dreaded for weeks. Your brain can't tell you that you did nothing.

AI THAT HELPS, FULLY OPTIONAL
AI is on by default and does real work: it sorts a brain-dump into your day, breaks a hard task into steps, and reads a photo of a written list into tasks. But it is genuinely optional. One tap in Settings turns it off, and then nothing you type is sent anywhere. The whole app keeps working, entirely on your device. If you are wary of AI or just like things private, this is built for you.

PRIVATE BY DEFAULT
- Your tasks live on your device. No account needed to use the app.
- Optional sync across devices needs only an email and a one-time code. No password.
- When AI is on, only the text you choose goes to Anthropic's Claude to do its work, and it is not used to train models. When AI is off, nothing leaves your device.
- No ads. No third-party trackers. Nothing sold.
- Export your data or delete your account any time.

PREMIUM, WHEN YOU WANT A LITTLE MORE
Everything above is free, forever. Premium adds a few extras, never anything you need: a weekly keepsake scrapbook of what you finished, scan a written list with your camera, Chart a course from a goal into ordered steps, a gentle suggested order for today, your quiet patterns, and custom colour themes. Try it free for 30 days, no card needed. A$5 a month or A$50 a year, cancel any time.

Premium is billed through Stripe web checkout, not Google Play, and you will never see card details stored by us.

you're allowed to go slowly

Read the plain-English privacy policy at doubledone.app/privacy.
```

**What's new:** `New: AI is now fully optional. One tap turns it off and nothing you type is ever sent anywhere, the whole app still works on your device. Plus a calmer onboarding and small fixes.`

**Category:** Productivity. **Tags:** adhd, to-do list, task manager, calm productivity, focus, neurodivergent, autism, ocd, planner, reminders, anti-overwhelm, daily tasks.

---

## Screenshots (5, portrait ~1080x1920)

I can generate these from the app (the screenshot harness in `scripts/screenshots.mjs`). The set:

1. **Today** with a few tasks — "Only today, sized to feel possible. The rest waits calmly."
2. **Break it down** result (steps) — "Hand a dreaded task to DoubleDone and get small, doable steps."
3. **Capture** mid-sort — "Empty your head. Sort it yourself, or let AI order your day."
4. **Close the day** at dusk — "Close the day kindly. It honours what you did, never what you didn't."
5. **Lookback** with finished tasks — "Everything you finish, you keep. Proof your brain can't argue with."

---

## Who does what

**You:** confirm account type; recruit + opt in 12 testers (start the clock now); run `eas build --profile production` (your EAS account, minds the build-credit cap); create the app + Closed-testing track in Play Console; upload the AAB; complete Data Safety + content rating; submit for production after 14 days.

**Me (on your go-ahead):** apply the privacy-policy line + scrapbook_log pruning; pin target API 36; generate the 5 screenshots; and we decide on the one-time AI-consent card.
