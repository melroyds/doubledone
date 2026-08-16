# DoubleDone, Google Play submission pack (2026)

Assembled June 2026 from a readiness audit (Data Safety form, current 2026 Play policy verified by web
search, refreshed listing). This is the current source of truth. It **supersedes
[play-store-release.md](play-store-release.md) section 6**, which wrongly marks closed testing as optional.
Work the "Before you can submit" list during the 14-day closed-test window, nothing here blocks starting
the test.

**Updated 2026-07-12** for the versionCode 11 release (the production AAB cut from git tag `android-v11`):
the "Before you can submit" items are done and dated below, the What's-new copy is current for v11, and the
exact-alarm posture changed (see the standing checklist). The listing copy itself is live and unchanged.

---

## The timeline reality (read first)

Google requires a closed test before a **new personal account** can publish to production:

- **12 testers, opted in for 14 consecutive days**, before you can apply for production access. (Was 20;
  cut to 12 on 11 Dec 2024.) Keep 12+ opted in throughout: per Google an uninstall does NOT drop an opted-in
  tester, but falling below 12 stalls you, so recruit a buffer. Google now measures **engagement**, so testers
  should actually open and use the app over the two weeks, not just install once.
- The `$25` individual signup is a **personal** account, so this applies. Budget **~3 to 4 weeks** to
  production, then a 1 to 3 day review. It is uncompressible and is the dominant launch-date driver.
- Organisation accounts are exempt but need a D-U-N-S number (up to 30 days), so that is not faster for you.

**What to do now, in parallel: line up your people.** Collect ~14-15 Gmail addresses (a buffer, since some
never follow through). That is just a list, no Console action yet. Your partner, friends, and the ADHD / OCD
people you built this for are perfect, and engaged daily users by nature.

**The opt-in itself happens only AFTER the app and the closed-testing track exist** (you cannot opt testers
into a track that does not exist yet). Order: create the app, upload the AAB to a Closed-testing track, add
testers or share the opt-in link, then each tester clicks "Become a tester" and installs. That click is what
counts and starts the 14-day clock. Full sequence in "Who does what" below.

**How the 12-for-14-days is verified:** not manually. Testers join through Google's own system, so the Play
Console counts and timestamps every opt-in for you. The dashboard shows your live count, the production-access
flow checks the criteria itself, and you just describe your testing in a short questionnaire. No screenshots,
no evidence to submit.

Avoid the "12 testers fast / tester farm" services that flood search results. With Google now measuring
engagement, paid fake testers are a flag risk, and you do not need them.

---

## Before you can submit (the real to-do list)

### 1. Privacy policy: disclose the rate-limit IP. *Done 2026-06-28: the line is live in both policy copies, the 24h purge is real.*
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

### 2. Pin target API 36. *Done 2026-06-28, pinned via expo-build-properties, riding every build since.*
`app.json` pinned no `targetSdkVersion`, so it inherited the Expo SDK 56 default (API 35). From **31 Aug 2026**
new apps must target Android 16 (API 36). Pin it now via `expo-build-properties` (SDK 56 supports it) so the
launch build is already on the soon-mandatory level and no forced mid-launch rebuild can happen. About half a
day plus a device smoke-test. (Android 16 also brings the 16 KB page-size requirement, the smoke-test covers it.)

### 3. One-time AI consent before the first call. *Resolved 2026-06-29: a point-of-use line, not a modal.*
You are 90% there: capture names Claude, the handoff line is honest, AI-off stops every call before it fires,
and the app is fully usable AI-free. The gap Google's late-2025 third-party-AI guidance prefers: AI is **on by
default**, so the first call can fire on a tap to "Sort for me" rather than a dedicated tap-to-accept. Cheap
insurance (~a day): a one-time card naming Anthropic / Claude before the first AI call, with "Use AI" and
"Stay offline". Debatable, the tap on "Sort for me" with the disclosure right above it arguably already
counts as the affirmative action. Worth a decision, not urgent.

*Resolution (2026-06-29): Melroy chose the point-of-use line. A faint line above the AI actions reads "Sort
and Break it down send what you type to Anthropic's Claude", shown only when AI is on and there is text.
Escalate to a modal only if a reviewer ever flags it.*

### 4. The standing checklist
- Privacy URL returns HTTP 200 in an incognito browser (it is static HTML, just confirm after the deploy).
- Update the policy "Last updated" date to the submission date.
- Account verification complete (done).
- Exact alarms, current posture (versionCode 11, 2026-07-12): the app declares **`SCHEDULE_EXACT_ALARM`
  only**. `USE_EXACT_ALARM` stays out, it blocked the 2026-06-29 release because Play reserves it for
  alarm-clock and calendar apps. If the console asks for an exact-alarm declaration, the answer is
  **user-set reminders as core functionality**. POST_NOTIFICATIONS declared as before. Full text and the
  why-trail in play-store-release.md 5a/5b.

---

## Good news (no action needed)

- **The generative-AI content policy does NOT apply.** It targets apps whose purpose is generating content;
  DoubleDone uses AI to improve existing features, which is excluded. (Updated 2026-07-12: the keepsake
  gained a share action on 2026-07-11 and now shares as a captioned page, so "keep it private" no longer
  describes the app. The exclusion still holds, a user sharing their own week's record does not make image
  generation the app's purpose. The listing guidance stands: never market DoubleDone as an AI image
  generator.)
- **External Stripe checkout is fine** for a productivity subscription. Never say "subscribe in-app" or "via
  Google Play". The listing already frames it correctly.
- **The data footprint is small and clean** and matches the privacy policy on everything except the one IP
  line above.

---

## Data Safety form, exact answers

Encrypted in transit: **YES** for everything (TLS to Supabase, the Worker, Anthropic, Stripe). Data deletion:
**YES**, in-app (Settings, the `delete_account` RPC cascades) and by email; use `doubledone.app/privacy` as the
data-deletion URL. No ads, no third-party analytics/trackers, no advertising ID.

> **ACTION REQUIRED before the next AAB ships (added 2026-08-01):** the app-event beacon (Settle usage
> counts) is the app's first opt-in-free collection, and the live Data Safety form does not declare it.
> Add the **App activity > App interactions** row below in the Play Console BEFORE promoting any build
> containing the beacon (v22+). Google cross-checks the form against the policy URL and app behaviour;
> the policy already discloses it (doubledone.app/privacy, "Feature-usage counts"). Apple's label needs
> no change: ASC already declares Usage Data > Product Interaction (not linked) for /outcome.

| Data type | Collected | Shared | Optional? | Purpose | Note |
|---|---|---|---|---|---|
| App activity > App interactions | Yes | No | **No** | Analytics | The feature-usage beacon (2026-08-01): opening Settle sends the feature's name (plus the guide's on/off) to our Worker, stored as an event name + the DAY only. No user_id, no IP stored, no content, closed server-side allowlist, not optional (no setting, by design). Disclosed in the policy's "Feature-usage counts". |
| Personal info > Email address | Yes | No | Optional | Account management | Only if the user turns on sync. OTP sign-in, no password. Supabase (Sydney). Deletable in-app. |
| App activity > Other user content (task text) | Yes | **Yes** | Optional | App functionality, personalization | Two opt-in flows: sync (to Supabase) and AI (to Anthropic). "Shared" because text leaves to Anthropic when AI is on. AI off = nothing sent. Pseudonymous AI-call copy in D1, no user_id, no IP. Since 2026-07-12 the weekly scrapbook keepsake (a short caption derived from finished tasks, plus its image link) also syncs to Supabase under the same sync opt-in. |
| Photos > Photos | Yes | **Yes** | Optional | App functionality (OCR scan) | Premium photo-to-tasks. Sent to Anthropic (vision), then discarded, not stored as an image. Only on explicit action, AI on. |
| Financial info > Payment info | Yes | **Yes** | Optional | Manage subscription, purchases | Billed by **Stripe** (external web checkout), not Play Billing. Stripe holds card data; DoubleDone never sees it. Be honest: Stripe retains payment records after deletion (tax/legal). |
| Device or other IDs (push endpoint; rate-limit IP) | Yes | No | Optional | Deliver reminders; **security/anti-fraud** | Push subscription only if reminders enabled (no user_id, no task text). The scrapbook rate-limit IP is the item in to-do #1. Declare the security use, not silence. |
| Location / Contacts / Health / Messages / Calendar / Audio / Files / Web history / Installed apps / Crash logs | **No** | No | n/a | n/a | Explicitly NOT collected. The audience is ADHD/autism/OCD, but the app collects no health data. |

---

## Store listing, paste-ready

**App name:** DoubleDone

**Short description** (<=80): `A calm to-do app for ADHD and overwhelm. Shows only today. AI optional.`

**Full description** (<=4000). *Rewritten 2026-08-16 for 1.3.1. The previous copy is in git history; it
was two months stale in five ways, and the audit that found them is worth repeating before any future
release. **Ours was absent entirely**, so a listing for a release about a shared list never mentioned
one. The **scrapbook was listed as Premium-only** when there is a free monthly one, which under-sold
the free tier. The **Premium list named six of nine** features (no Pin, Quiet, Plan my day, or energy
matching). **Settle and repeating tasks** were missing from the free list. And the trial read "30
days" where the app says "a month" everywhere. Rule for next time: diff this against
[premium.md](premium.md)'s wall and the live paywall catalog before shipping, not after.*

3,983 characters of 4,000.

```
Today is finite and achievable.

DoubleDone shows you only what today needs, sized to be doable, and quietly keeps everything you finish. Nothing is ever overdue here. It just waits.

Most to-do apps hand you the whole list and call it motivation. For a lot of us, that is the overwhelm. DoubleDone is the opposite. A calm home screen, a small day, and a list that never shames you for a task simply existing.

MADE FOR
People with ADHD, autism, the AuDHD overlap, OCD, and anyone whose list has ever felt like too much. Built for how those brains actually work: low friction, no streaks to break, no guilt mechanics, no punishment for a task that has waited a while.

THE CALM CORE, FREE FOREVER
- Capture anything in seconds. One thing per line, in any order.
- See only today, sized so it feels possible.
- Break it down: turn a dreaded task into small, doable steps.
- Make it tiny: a two-minute version, just to begin.
- Lighten today: ease a too-full day by moving things to later.
- Combine: fold small tasks into one when the day feels cluttered.
- Repeating tasks, for the things that come back.
- Gentle reminders, only the ones you ask for. Never nagging.
- Settle: a quiet room with a breathing guide, for when the day is loud.
- Close the day kindly. It honours what you did, never what you didn't.
- Lookback: see everything you have actually finished, including the old task you dreaded for weeks. Your brain can't tell you that you did nothing.
- A free monthly scrapbook: a keepsake picture of what you finished.

OURS: ONE SHARED LIST, WITH ONE OTHER PERSON
Free, and unlike every shared list you have used. Nothing on it says who did what, and nothing counts or compares, so it cannot become a scoreboard.

A shared thing with a day on it, bin night on Tuesday, arrives on both your Todays by itself. One without a day, milk and batteries, stays on the shared list and never reaches your Today, so your person cannot make your morning heavier. Tick it from either phone and it closes for both.

You start it by reading somebody a six-character code. There is no feed, no browsing, and nobody can reach you unless you handed them that code. Either of you can leave whenever you like, no reason needed. Like sync, Ours needs only the simple email sign-in.

AI THAT HELPS, FULLY OPTIONAL
AI is on by default and does real work: it sorts a brain-dump into your day, breaks a hard task into steps, and reads a photo of a list into tasks. But it is genuinely optional. One tap in Settings turns it off, and then nothing you type is sent anywhere. The whole app keeps working, entirely on your device. If you are wary of AI or just like things private, this is built for you.

PRIVATE BY DEFAULT
- Your tasks live on your device. No account needed to use the app.
- Optional sync across devices needs only an email and a one-time code. No password.
- When AI is on, only the text you choose goes to Anthropic's Claude, and it is never used to train models. When AI is off, nothing leaves your device.
- No ads. No third-party trackers. Nothing sold.
- Export your data or delete your account any time.

PREMIUM, WHEN YOU WANT A LITTLE MORE
Everything above is free, forever. Premium adds a few extras, never anything you need:
- A weekly AI scrapbook of what you finished, growing the longer you stay
- Scan a written list with your camera, straight into tasks
- Pin the day's one thing
- Plan my day: a gentle suggested order for today
- Chart a course: turn a goal into calm, ordered steps
- Your patterns: gentle stats and a warm weekly reflection
- Energy matching without limits: ask what fits right now
- Quiet: a borderless look where nothing shouts
- Seven calm colour themes

Try it free for a month, no card needed. A$5 a month or A$50 a year, cancel any time.

Premium is billed through Stripe web checkout, not Google Play. We never see or store your card details.

you're allowed to go slowly

Read the plain-English privacy policy at doubledone.app/privacy.
```

> **Adding Ours to the listing raises the stakes on the content rating.** Google's UGC policy keys off
> what the app does, not what the listing says, so the rating answers were already owed. But a listing
> that advertises a shared list next to a content rating claiming no user interaction is the kind of
> contradiction a reviewer notices. Do the rating first, or at the same time. Exact answers in
> [ours-store-compliance.md](ours-store-compliance.md).

**What's new (versionCode 11, 2026-07-12):** `Keepsakes now follow your account across devices, and they share as a proper page with their caption on the picture. Rhythms can nudge every 30 or 90 minutes and arrive on time once 'Alarms & reminders' is allowed. Plus calmer details and small fixes throughout.`

*(Earlier release note, kept for the record: "New: AI is now fully optional. One tap turns it off and nothing you type is ever sent anywhere, the whole app still works on your device. Plus a calmer onboarding and small fixes.")*

**Category:** Productivity. **Tags:** adhd, to-do list, task manager, calm productivity, focus, neurodivergent, autism, ocd, planner, reminders, anti-overwhelm, daily tasks.

---

## Screenshots (8, regenerated 2026-08-16)

**Which folder: `docs/play-store/`, NOT `docs/screenshots/`.** This repo has two screenshot sets with
overlapping filenames and they are easy to confuse (a ship checklist already sent Melroy to the wrong
one). `docs/screenshots/` is the RAW app at 780x1688, for the README and review packs.
`docs/play-store/` is the STORE set: each screen framed in a phone body on a dusk slide with a
one-line caption, which is what the live listing uses.

Generate with `node scripts/play-assets.mjs` (needs `npm run dev` on :8081 and Chrome). It writes all
three sizes plus the icon and feature graphic. **Upload in this order**, which is the order the SHOTS
array is written in:

| # | File | Caption | Why here |
|---|---|---|---|
| 1 | `welcome` | Today is finite and achievable. | The promise. Best first impression. |
| 2 | `today-light` | Only today, sized to feel possible. | The core idea, in one look. |
| 3 | `ours-room` | One shared list. Never a scoreboard. | **What 1.3.x is for.** Play weights the early ones. |
| 4 | `lookback-light` | Everything you finish, you keep. | The emotional payoff. |
| 5 | `ours-when` | A shared day, set from either phone. | What 1.3.1 specifically adds. |
| 6 | `today-dark` | A calm home screen, day or night. | Proves the night face. |
| 7 | `settle-light` | A quiet room, for when today gets loud. | The most distinctive screen in the app. |
| 8 | `settings-light` | AI that helps. One tap turns it off. | The privacy proof, for the wary. |

Sizes, all well inside Play's limits (min 320px, max 3840px, 8MB): `phone/` 1080x1920,
`tablet7/` 1200x1920, `tablet10/` 1600x2560. Same eight names in each.

*Before 1.3.1 the set was five June slides and **none showed Ours**, so the listing for a release
about a shared list pictured no shared list. If a release adds a screen, add its slide in the same
commit.*

---

## Who does what

**You, in order:**
1. (Now, in parallel) Line up ~14-15 testers' Gmail addresses. Just a list, no Console action.
2. `eas build --profile production` (your EAS account, on a paid Expo plan since July 2026, so the old free-tier build cap no longer bites) -> the AAB.
3. Create the app in Play Console.
4. Upload the AAB to a **Closed-testing** track; complete Data Safety (answers above) + content rating; submit the track for review.
5. Add your testers or enable the opt-in link, and share it. Each tester clicks "Become a tester" and installs. **This starts the 14-day clock.**
6. Watch the count in the Console for 14 days (keep 12+ opted in). Capture the 5 screenshots from a tester's phone.
7. After 14 days: Publishing overview -> Production -> **Request production access**, fill the questionnaire honestly, and submit.

**Me (done this session):** privacy-policy line + 24h purge (committed and Worker deployed); target API 36 pinned; the point-of-use AI disclosure (the calm alternative to a consent modal). Screenshots are best captured from a tester's device at step 6, not synthesised.
