# Publishing DoubleDone to the Google Play Store

> **2026 update:** the current, paste-ready submission pack is
> [play-store-submission-pack.md](play-store-submission-pack.md) (Data Safety form, listing, the verified
> policy + timeline). **Correction to section 6 below:** for a new personal account, closed testing is NOT
> optional, it is a mandatory 12-tester / 14-day gate before production. Read the pack first; use this guide
> for the step-by-step Play Console mechanics.

A first-release guide for DoubleDone (Expo SDK 56 / EAS, Android package `app.doubledone`, currently
v1.0.0). Researched and adversarially reviewed 2026-06-24. Work top to bottom. The handful of things most
likely to block the review are marked **BLOCKER**, deal with those first.

The build plumbing is already done: `client/eas.json` has a `production` profile that outputs an **AAB**
(an Android App Bundle, which Play requires) with `autoIncrement` and a remote-managed versionCode, so you
never hand-edit the versionCode. The rest of this is mostly Play Console work and assets.

---

## 0. Gather these first

- **$25** for a Google Play Developer account (one-time, credit card).
- A **monitored inbox** behind support@doubledone.app. Google sends policy and suspension notices here and
  expects a reply within 7 days, or the app can be auto-suspended. **BLOCKER if it silently drops mail.**
  Forward it somewhere you actually read, and watch for senders from `@google.com`.
- **Store graphics** (not in the repo yet, you need to make these):
  - **Feature graphic**: 1024x500 PNG/JPG, the banner at the top of the listing. Design it larger
    (1440x810 or 1920x1080) and let Play downscale, so it stays crisp on modern phones.
  - **Phone screenshots**: 2 minimum, 5 recommended, portrait. Capture from a device or emulator. Around
    1080x1920 is safe. Good set: Today with a few tasks, capture, a Break-it-down result, a reminder, the
    calm empty/Lookback state.
  - **App icon**: 512x512 PNG. Already in the repo at `client/assets/images/icon.png`.
- The **store description** (draft in section 4).

---

## 1. One-time account and app setup

1. Sign in at https://play.google.com/console, accept the Developer Program policies, pay the $25, fill in
   your profile (website https://doubledone.app). Account verification can take 24-48h, so start here.
2. **Create app**: name **DoubleDone**, default language English, app category **Productivity**, type
   **Free**. Not a game, no ads. (The base app is free; Premium is billed externally via Stripe, not Play
   Billing, see section 5.)
3. **Package name**: lock it to **app.doubledone**. It is immutable after the first release.
4. **App signing** (Release > Setup): let Google manage the signing key. This is mandatory for new apps,
   do not upload your own keystore.

---

## 2. Build the production AAB

```bash
cd client
eas whoami                 # run: eas login  if you are not signed in
eas build --platform android --profile production
```

- The output is a `.aab`. Confirm the extension before uploading, Play rejects APKs for new apps.
- **Use the `preview` profile for throwaway test builds, not `production`.** Every `production` build bumps
  the remote versionCode, so testing on it would inflate your first release's versionCode (harmless to
  users, just untidy).
- Version name stays 1.0.0 (set in `app.json`). For future releases bump it there (1.0.1, 1.1.0); the
  versionCode auto-increments on its own.

---

## 3. BLOCKER: the privacy policy must be a real, public web page

Google fetches your privacy policy URL during review and cross-checks it against the Data Safety form. Two
requirements:

1. **It must load publicly** at https://doubledone.app/privacy: HTTP 200, no sign-in, real HTML, on a
   desktop browser in incognito.
2. **Its content must match the Data Safety form exactly** (section 5). Any contradiction (for example the
   form says "no IP logging" but the policy says otherwise) is an automatic rejection.

The catch for DoubleDone: the web app is a **client-rendered SPA** (`output: "single"`), so `/privacy`
renders in JavaScript, and a non-JS crawler sees only the empty app shell. **This is now fixed**
(2026-06-24): `client/public/privacy.html` is a static copy of the policy, served at `/privacy` by
Cloudflare's clean URLs (a rewrite rule loops, so there is none), so a non-JS fetch returns the full text. Keep it in step with the in-app `privacy.tsx`. Just
confirm it is live after the deploy (the checklist item below).

Also: update the "Last updated" date in the policy to the submission date before you submit, reviewers
flag stale dates.

---

## 4. Store listing

- **Name**: DoubleDone
- **Short description** (<=80 chars): `A calm, ADHD-friendly to-do app with AI task breakdown.`
- **Full description** (draft, edit to taste):

```
DoubleDone is a calm, ADHD-friendly to-do app for people who get overwhelmed by ordinary
productivity tools. It shows you only what today needs, and quietly keeps everything you finish.

WORKS OFFLINE: Create, manage, and complete tasks with no account and no connection. Syncing across
devices is optional and needs only an email address (a one-time code, no password).

WHAT IT DOES:
- Capture tasks in seconds, no friction.
- Break it down: hand a dreaded task to AI and get small, doable steps.
- Combine: fold several small tasks into one when the day feels cluttered.
- Gentle reminders you ask for, never nagging.
- Lookback: see everything you have actually finished.

PREMIUM (optional):
- Try it free for 30 days, no card needed.
- A$5/month or A$50/year unlocks the AI keepsake scrapbook of your finished week, photo-to-tasks
  scan, richer AI planning, and custom colour themes.
- Cancel any time. Premium is billed via Stripe web checkout, not Google Play.

PRIVACY:
- Your tasks live on your device by default.
- AI features (Break it down, Combine, and similar) send the task text to Anthropic's Claude to do
  their work. You can use the whole app without them.
- No ads, no third-party trackers, nothing sold.
- Export your data or delete your account any time.

Read the plain-English privacy policy at doubledone.app/privacy.
```

- **Graphics**: the feature graphic, screenshots, and icon from section 0.
- **Content rating**: fill the questionnaire, answer No to all the sensitive-content questions. Expect a
  3+ / Everyone rating.
- **Support email**: support@doubledone.app (monitored, see section 0).

---

## 5. Policy declarations (the part that gets apps rejected)

### 5a. BLOCKER: exact-alarm permission

DoubleDone ships `USE_EXACT_ALARM` + `SCHEDULE_EXACT_ALARM` (via `client/plugins/with-exact-alarm.js`) for
the daily reminder and per-task nudges. Play scrutinises this. Declare it under
**Policy > App content > "Permissions and APIs that access sensitive information"** and justify it around
**user-requested timing**, not as a Doze workaround (reviewers reject the workaround framing):

```
DoubleDone is a task and reminder app. The exact-alarm permissions are used only for two
user-initiated reminder features:

1. Daily reminder: the user picks a time (e.g. 9am) to be shown their tasks.
2. Per-task nudges: the user explicitly asks to be reminded of a task at a chosen time
   (e.g. "remind me in 2 hours").

Exact alarms honour the time the user asked for. Without them, Android 12+ batches the
notification into a roughly 15-minute window, so a reminder the user set for a specific
time fires late, breaking the feature. The permissions are never used for background
tracking, ads, or unsolicited notifications, and the app runs fully if reminders are off.
```

If it is still rejected, you can appeal with evidence: on a Samsung/Galaxy device with Doze forced
(`adb shell dumpsys deviceidle force-idle`), an inexact alarm delays 30+ minutes while the exact alarm fires
on time. Reminder apps (Todoist, Google Tasks) are permitted this, so it is defensible.

> Note for later: `USE_EXACT_ALARM` carries an ongoing Play policy expectation that the app genuinely is an
> alarm/reminder app. DoubleDone qualifies. If a future version ever drops reminders, drop this permission too.

### 5b. POST_NOTIFICATIONS

Declare it. It is a **runtime permission on Android 13+** (the user grants it via a prompt when they turn
reminders on), and a normal auto-granted permission on Android 12 and below. It is for the app's own local
reminder notifications, no push service.

### 5c. Data Safety form (must match the privacy policy)

Declare these data flows, each **optional / user-initiated**, and **word every line to match
doubledone.app/privacy** (do not invent retention periods, use whatever your policy actually states):

1. **Task text -> Anthropic (Claude).** Sent only when the user uses an AI feature (Break it down, Combine,
   Strategise, Sort, and the premium Chart a course / Plan my day / Lookback insights / photo scan, which
   also send task titles or a photo). Disclose it as collected + shared with a service provider (Anthropic)
   for app functionality. Before submitting, re-check Anthropic's current data-handling terms and make sure
   your privacy policy's wording still matches them.
2. **Email -> Supabase.** Collected only if the user turns on sync. For account/authentication.
3. **Pseudonymous completion telemetry -> the Worker's D1.** No user id, IP, or task text. For improving
   the breakdown suggestions. Disclose per your policy's wording.
4. **Payment data -> Stripe.** Only if the user buys Premium. Stripe (not us) processes the card; the app
   receives subscription events (type, amount, Stripe event id) to keep Premium status correct. Declare it
   as collected + shared for purchases, matching the policy's "Payment events" section.

Two things that must also match the policy: synced data is stored in **Supabase (Sydney, Australia)**, and the
service sends the owner **system health alerts** (counts and error strings only, no personal data, no task
text) per the policy's "Keeping the service running" section.

Declare **no ads, no third-party analytics/trackers, no advertising ID**. Do not declare camera, location,
contacts, etc. (DoubleDone uses none).

### 5d. Stripe Premium is not Play Billing

Premium is an external Stripe web checkout with a server-side entitlement check, not Google Play Billing.
That is allowed, but keep the listing from implying otherwise: do not say "subscribe in-app" or "via Google
Play". If a reviewer flags it, the response is that Premium is sold via external web checkout and the app
does not use Play Billing.

---

## 6. Submit

Use a staged rollout, do not go straight to Production:

1. **Internal testing** first. Upload the AAB (Release > Testing > Internal testing > Create new release),
   add yourself as a tester, install from the opt-in link, and verify on a clean device with **no account**:
   - capture / complete / Break-it-down / Combine all work without signing in,
   - the reminder permission prompt appears and a reminder fires,
   - airplane-mode (offline) still works,
   - the in-app privacy link opens https://doubledone.app/privacy.
2. (Optional) **Closed testing** with a handful of real users for a week.
3. **Production**: create the release, add release notes, Send to review. Automated checks take 1-2h, the
   manual review usually 1-3 days. Approved apps appear in search within a couple of hours.

**Before Production, confirm the operational readiness (outside the Play Console):**
- **Stripe is live.** The live secret key + webhook signing secret are the Worker secrets, the live price ids
  are set (`STRIPE_PRICE_ID`, `STRIPE_PRICE_ID_ANNUAL`), the webhook is registered for the live
  `/stripe-webhook` endpoint, and one real test purchase grants Premium.
- **The control centre is armed.** The Worker secrets `SEND_EMAIL` / `FEEDBACK_TO` / `HEARTBEAT_URL` and the
  `ANTHROPIC_MONTHLY_CAP_USD` var are set, the hourly cron is active, and the first heartbeat and daily pulse
  arrive (see [`operations.md`](operations.md)).

Manual upload is simplest for the first release. To automate later, set up a Google Cloud service account
with the Play Android Developer API, invite its email into Play Console as an admin, add it to the `submit`
block in `eas.json`, and run `eas submit --platform android --latest`.

---

## 7. Pre-submit checklist

- [ ] https://doubledone.app/privacy loads 200 in incognito with the full policy text (see section 3).
- [ ] Privacy policy "Last updated" date is current, its content matches the Data Safety form, and `privacy.html` matches the in-app `privacy.tsx`.
- [ ] Terms of Service live at https://doubledone.app/terms.
- [ ] Stripe in LIVE mode: live keys + live price ids on the Worker, the webhook registered for the live endpoint, one real test purchase verified.
- [ ] Control centre armed: SEND_EMAIL / FEEDBACK_TO / HEARTBEAT_URL set, the cron active, the first heartbeat + pulse seen.
- [ ] https://api.doubledone.app is live (the reviewer's device will call it for AI features). Check `/health`.
- [ ] No secrets in the client bundle (all keys live on the Worker; gitleaks already guards this).
- [ ] App tested on a clean, signed-out device: core features and AI work without an account.
- [ ] Exact-alarm justification entered (section 5a), POST_NOTIFICATIONS declared (5b).
- [ ] Data Safety complete and consistent with the policy (5c). No ads/trackers declared.
- [ ] Feature graphic + 2-5 screenshots + 512x512 icon uploaded.
- [ ] Content rating questionnaire submitted (expect 3+).
- [ ] AAB (not APK) built with the `production` profile, file ends in `.aab`.
- [ ] support@doubledone.app is monitored.
- [ ] First release uploaded to Internal testing, not straight to Production.

---

## 8. Most likely rejections, and the response

| Rejection | Why | Fix / response |
|---|---|---|
| Exact-alarm not justified | Generic to-do apps are scrutinised | Use the user-requested-timing justification (5a); appeal with the Doze test evidence |
| Privacy policy unreachable | The SPA served only a JS shell to the crawler | Serve a static/prerendered /privacy page (section 3) |
| Data Safety mismatch | Form contradicts the policy | Align the policy and the form word for word |
| "Requires sign-in" | Reviewer could not use it without an account | It is offline-first, verify on a clean device + the "Works offline" line is in the listing |
| Requires Play Billing | Premium read as an in-app purchase | It is external Stripe, do not market it as in-app (5d) |

---

*Generated from a researched + adversarially-verified pass on 2026-06-24. The build config and permissions
are already in place; the open work is the assets, the policy forms, and confirming the privacy URL is
crawlable.*
