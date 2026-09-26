# Publishing DoubleDone to the Google Play Store

> **2026 update:** the current, paste-ready submission pack is
> [play-store-submission-pack.md](play-store-submission-pack.md) (Data Safety form, listing, the verified
> policy + timeline). **Correction to section 6 below:** for a new personal account, closed testing is NOT
> optional, it is a mandatory 12-tester / 14-day gate before production. Read the pack first; use this guide
> for the step-by-step Play Console mechanics.
>
> **Release state (2026-07-12):** the current production AAB is **versionCode 11** (version name 1.0.0),
> cut from commit `d983bbf`, code-frozen under the git tag `android-v11`, and **submitted and live on
> Google Play the same day**. Web deploys from the same code.
> Section 5a below has been updated in place: after Play blocked `USE_EXACT_ALARM` on 2026-06-29, the app
> now declares `SCHEDULE_EXACT_ALARM` alone (since versionCode 11).
>
> **Correction (2026-09-27), read before anything about Premium:** section 5d used to say the Stripe web
> checkout was allowed on Android. It never was. Play rejected 1.5.1 on 2026-09-26, and the Android app is
> now **consumption-only (Path C)**: it sells nothing and shows no price. Section 5d has the why, and
> section 10 is the step-by-step resubmission run sheet.

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
   **Free**. Not a game, no ads. (The Android app sells nothing. Premium bought on the web or an iPhone
   works in it after sign-in, see section 5d.)
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
- As of 2026-07-12 the production AAB is **versionCode 11**, cut from commit `d983bbf` and code-frozen
  under the git tag `android-v11`. To reproduce or inspect exactly what shipped, check out that tag.

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
- **Full description** (the original 2026-06 draft, kept for the record; the current paste source is in
  [play-store-submission-pack.md](play-store-submission-pack.md), and the localised ones in
  [play-store-listings-localised.md](play-store-listings-localised.md)):

> **Rule for every Play listing, in every language (Path C, 2026-09-27):** no price, no Premium section,
> no list of paid-only features, no "billed through Stripe" or "not Google Play" line, and no call to buy
> or subscribe on the website. Payments policy section 4 names the store listing itself as a place an app
> must not lead users to another payment method. `node scripts/check-listings.mjs` fails on any of it.

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

PRIVACY:
- Your tasks live on your device by default.
- AI features (Break it down, Combine, and similar) send the task text to Anthropic's Claude to do
  their work. You can use the whole app without them.
- No ads, no third-party trackers, nothing sold.
- Export your data or delete your account any time.

Read the plain-English privacy policy at doubledone.app/privacy.
```

- **Graphics**: the feature graphic, screenshots, and icon from section 0.
- **Content rating**: fill the questionnaire, answer No to all the sensitive-content questions, and No
  to users buying digital goods in the app (the Android app sells nothing, see 5d). Expect a 3+ /
  Everyone rating. The shared-list (Ours) answers are in [ours-store-compliance.md](ours-store-compliance.md).
- **Support email**: support@doubledone.app (monitored, see section 0).

---

## 5. Policy declarations (the part that gets apps rejected)

### 5a. BLOCKER: exact alarms, the corrected declaration (SCHEDULE_EXACT_ALARM only)

This section has a history, kept because the first attempt was blocked and the lesson matters:

- **2026-06-24:** the app shipped `USE_EXACT_ALARM` + `SCHEDULE_EXACT_ALARM` via a config plugin, on the
  belief that reminder apps qualify.
- **2026-06-29:** Play **blocked the release**. `USE_EXACT_ALARM` is reserved for apps whose core function
  is an alarm clock or a calendar, and those two are the only declaration options the console offers. A
  to-do app is neither, so both permissions and the plugin were removed and reminders ran on inexact alarms.
- **2026-07-12 (versionCode 11):** inexact delivery failed in the field. On Android 12+, expo-notifications
  arms an exact alarm only when the OS has granted it; otherwise it silently falls back to an inexact alarm
  that Doze defers, so nudges only arrived when the app next opened. The app now declares
  **`SCHEDULE_EXACT_ALARM` alone**, in `app.json` under `android.permissions` (no plugin). It is
  pre-granted on Android 12-13; on Android 14+ the user grants it through the app's "Allow alarms &
  reminders" door (the nudge-health block opens the system toggle, and returning from it re-arms every
  schedule). `USE_EXACT_ALARM` stays deliberately avoided.

If the console asks for an exact-alarm declaration, the answer is **user-set reminders as core
functionality**. Justification text, current for versionCode 11:

```
DoubleDone is a task and reminder app. SCHEDULE_EXACT_ALARM is used only for
user-initiated reminder features:

1. Daily reminder: the user picks a time (e.g. 9am) to be shown their tasks.
2. Per-task nudges: the user explicitly asks to be reminded of a task at a chosen
   time (e.g. "remind me in 2 hours").
3. Rhythms: gentle recurring nudges the user sets up themselves, either every so
   often within waking hours (30 minutes to 12 hours) or at fixed clock times
   (e.g. medication at 8:00 and 20:00).

Exact alarms honour the time the user asked for. Without them, Android 12+ defers
the notification under Doze, so a nudge the user set can arrive hours late or only
when the app next opens, breaking the feature. On Android 14+ the permission is
granted by the user via the system "Alarms & reminders" toggle; the app runs fully
if they decline, delivery is just less punctual. The permission is never used for
background tracking, ads, or unsolicited notifications.
```

> Do not re-add `USE_EXACT_ALARM`, ever. It carries a hard eligibility gate (alarm clock or calendar as
> core function), the 2026-06-29 block proved DoubleDone does not pass it, and `SCHEDULE_EXACT_ALARM` with
> a user grant covers the need honestly.

### 5b. POST_NOTIFICATIONS

Declare it. It is a **runtime permission on Android 13+** (the user grants it via a prompt when they turn
reminders on), and a normal auto-granted permission on Android 12 and below. It is for the app's own local
reminder notifications, no push service.

### 5c. Data Safety form (must match the privacy policy)

Declare these data flows, each **optional / user-initiated**, and **word every line to match
doubledone.app/privacy** (do not invent retention periods, use whatever your policy actually states):

1. **Task text -> Anthropic (Claude).** Sent only when the user uses an AI feature (Break it down, Combine,
   Strategise, Sort, energy matching ("What fits right now?" inside Focus, which sends today's open task
   titles), and the premium Chart a course / Plan my day / Lookback insights / photo scan, which
   also send task titles or a photo). Disclose it as collected + shared with a service provider (Anthropic)
   for app functionality. Before submitting, re-check Anthropic's current data-handling terms and make sure
   your privacy policy's wording still matches them.
2. **Email -> Supabase.** Collected only if the user turns on sync. For account/authentication.
3. **Pseudonymous completion telemetry -> the Worker's D1.** No user id, IP, or task text. For improving
   the breakdown suggestions. Disclose per your policy's wording.
4. **Payment info: Not collected, for the Android app (corrected 2026-09-27).** Premium is not sold in the
   Android app (5d). Payments happen on the web (Stripe) or through Apple, outside this app, so the Android
   Data Safety form declares **Financial info > Payment info: Not collected**. The privacy policy still
   describes Stripe's payment events, because the web sells, and it should say plainly that those happen
   on the website or through Apple, never in the Android app.

Two things that must also match the policy: synced data is stored in **Supabase (Sydney, Australia)**, and the
service sends the owner **system health alerts** (counts and error strings only, no personal data, no task
text) per the policy's "Keeping the service running" section.

Declare **no ads, no third-party analytics/trackers, no advertising ID**. Do not declare camera, location,
contacts, etc. (DoubleDone uses none).

### 5d. BLOCKER: the Android app sells nothing (Path C, corrected 2026-09-27)

**What this section used to say was wrong.** It said the external Stripe web checkout was allowed on
Android and planned a reviewer reply defending it. Neither was ever true, and that reply must **never be
sent**. Do not appeal the rejection either. A compliant update is the answer.

**What happened.** Play rejected Android 1.5.1 on 2026-09-26 under the Subscriptions policy ("Currency
differences with prominent display price"): the in-app Premium screen showed "A$5 / month" to a reviewer
outside Australia. A policy sweep then found the bigger problem. The Stripe link-out broke the Payments
policy in essentially every country, whatever currency it showed:

- **Payments policy, section 2:** an app sold on Play that charges for in-app features or services must
  use Google Play's billing system.
- **Payments policy, section 4:** an app may not lead users to a payment method other than Google Play's
  billing system, and the channels it names include **the app's listing on Google Play** itself, as
  well as in-app buttons, links, webviews and promotions.
- **Payments policy, section 6:** developers must tell users the terms and pricing of anything offered
  for purchase clearly and accurately. A fixed Australian-dollar price shown to everyone is the same
  failure the Subscriptions rejection named.
- **The exceptions (sections 8 and 9, and the country link-out programs):** the ones that allow an
  outside payment link at all need enrolment and the Play Billing Library, and they require the listing
  to carry no outside-purchase information. DoubleDone is in none of them.

**The fix Melroy chose: Path C, consumption-only.** Built in code on the `play-reader` branch
(`client/src/lib/storefront.android.ts`, `SELLS_HERE = false`). On Android:

| Android shows | Android never shows |
|---|---|
| Premium that was bought on the web or an iPhone, or comped, working after sign-in | Any price, in any currency, anywhere in the app |
| The card-free month: a server-granted trial, no payment taken, never converts to paid | A Subscribe, Upgrade or Buy control |
| | A Stripe checkout or the Stripe billing portal |
| | Any call to action to buy elsewhere, including an unlinked "available at doubledone.app" line |

Web (Stripe) and iOS (Apple in-app purchase through RevenueCat) are unchanged. **Play Billing (Path A) is
the later step**, parity-priced like iOS, and until it ships Android is a place to use Premium, never to
buy it.

**Why this is compliant.** The Payments FAQ says any app may be consumption-only, even as part of a paid
service: a user can sign in and use content paid for somewhere else, provided nothing can be purchased
from within the app. The free month takes no payment, so it is not a sale.

**Why even the unlinked website line is out, this round.** The same FAQ lets a consumption-only app
mention, without a link, that purchases can be made on the website. It is left out anyway for this
resubmission. The app already has one rejection on this exact theme, and the listing is a named banned
channel, so the resubmission gives a reviewer nothing that reads as a route to another payment method.
Revisit only after approval, and only inside the app, never in the listing.

**Sources:** [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
(sections 2, 4 and 6), [Payments FAQ](https://support.google.com/googleplay/android-developer/answer/10281818),
[Subscriptions policy](https://support.google.com/googleplay/android-developer/answer/9900533),
[Fixing a rejected update](https://support.google.com/googleplay/android-developer/answer/2477981).
The run sheet is section 10.

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
- [ ] Stripe in LIVE mode: live keys + live price ids on the Worker, the webhook registered for the live endpoint, one real test purchase verified. (This is the WEB's checkout. The Android app sells nothing, 5d.)
- [ ] The Android build shows no price, no purchase control and no buy-elsewhere line anywhere, and `node scripts/check-listings.mjs` passes on every listing paste source (5d, section 10).
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
| Exact-alarm declaration blocked | `USE_EXACT_ALARM` is reserved for alarm-clock/calendar apps (this blocked the release on 2026-06-29) | Declare `SCHEDULE_EXACT_ALARM` only, answer "user-set reminders as core functionality" (5a) |
| Privacy policy unreachable | The SPA served only a JS shell to the crawler | Serve a static/prerendered /privacy page (section 3) |
| Data Safety mismatch | Form contradicts the policy | Align the policy and the form word for word |
| "Requires sign-in" | Reviewer could not use it without an account | It is offline-first, verify on a clean device + the "Works offline" line is in the listing |
| Payments / Subscriptions policy (this rejected 1.5.1 on 2026-09-26) | The app showed an A$ price and sold Premium through a Stripe link-out. Payments policy sections 2 and 4 forbid both on Android, and section 4 bans pointing to another payment method from the listing too | Never argue that Stripe is allowed, and never appeal. Ship the consumption-only build (5d, Path C) with scrubbed listings, then follow the run sheet (section 10). Play Billing is the later fix |

---

*Generated from a researched + adversarially-verified pass on 2026-06-24. The build config and permissions
are already in place; the open work is the assets, the policy forms, and confirming the privacy URL is
crawlable.*

---

## 9. Release notes: versionCode 20, the final pre-launch build (2026-07-26)

**v20 (cut from `38981c6`) is the designated pre-launch build**: v19's content plus the capture
keyboard fix (a tester's screenshots showed the redesigned Add panel buried under the Android
keyboard; see the decision log). v19 reached the closed track earlier the same day and is
superseded: never promote it. The Play "What's new" below is unchanged from v19's draft (it
describes the wave for production users, who upgrade from v11); the tester announcement is
re-cut for v20.

### Play Console "What's new" (en, under 500 chars)

> The final polish before launch.
> • Adding something is calmer: one quiet door holds when, repeating and steps, and the Add button tells you exactly what will happen.
> • Today's tools wait in one fixed spot, with Low / Normal / High energy for the day.
> • The home-screen widget fits any size neatly.
> • Missed nudges fade away quietly instead of piling up.
> • Tap a future day on the Calendar to add to it.
> • A friendlier introduction, and gentler words throughout.

### Tester announcement (email / message, Melroy's voice)

> **Subject: DoubleDone v20 is up, and it's the one**
>
> Hi all,
>
> Version 20 just landed on the testing track, and it's a milestone: this is the final
> pre-launch build. Whatever you're holding after this update is what the public launch
> will look like.
>
> (If you updated earlier today and got v19: update once more. Its new Add panel could
> hide under the keyboard on some phones. One of you spotted it and sent screenshots
> within hours, which is exactly what this group is for. Thank you.)
>
> What changed since last time:
> - Adding a task is much calmer. Another day, repeating, steps: it all lives behind one
>   quiet door now, and the Add button tells you what will happen before you tap it.
> - Today's tools sit in one fixed spot at the bottom, under "Right now", with
>   Low / Normal / High energy for the day.
> - The widget behaves at every size now.
> - Missed nudges quietly expire instead of stacking up.
> - You can tap a future day on the Calendar to add something to it.
> - Softer, clearer wording across the whole app.
>
> If you have ten minutes this week, the two things I'd love eyes on:
> 1. Add a few tasks through the new panel, including a weekly repeating one. Does it
>    feel obvious?
> 2. Resize the widget, and let a nudge go unanswered overnight. Anything weird, tell me.
>
> Update from the Play testing track as usual (please don't sideload over it). Once
> Google grants production access, this exact build goes live.
>
> Thank you for being here before it was ready. It's nearly time.
> Melroy

---

## 10. Path C resubmission run sheet (2026-09)

Melroy's by-hand Play Console steps to replace the rejected 1.5.1 with the consumption-only build (5d).
Do them in order and send everything for review as **one batch** in step 7. Menu names are as of
September 2026, and the Console moves things. If a path has moved, the App content page is always
reachable by swapping the last segment of the app-dashboard URL for `app-content`.

**Nothing here starts until the new AAB exists.** It is built only when Melroy asks for a build in that
exchange (the EAS quota rule), from `client/`, with
`npx --yes eas-cli build -p android --profile production --non-interactive`. EAS auto-increments the
versionCode, so it lands above the rejected 1.5.1 bundle.

### 1. Replace the bundle on every track

1. **Test and release > App bundle explorer**: note every track that holds the rejected 1.5.1 bundle or
   the older live bundle. Expect production plus any of internal, closed or open testing.
2. On each of those tracks (**Test and release > Production**, or **Test and release > Testing >**
   Internal / Closed / Open testing): **Create new release**. If a draft release is sitting there,
   discard it first.
3. **Add from library** (or upload) the new AAB.
4. Check that the rejected 1.5.1 bundle **and** the older live bundle both sit under **Not included**.
   Google's rule: a non-compliant bundle left active fails the resubmission, and live versions can be
   removed from Play.
5. Release notes: paste the Play six-tag block from **`docs/release-notes/1.6.0.md`** (en-AU, de-DE,
   es-419, es-ES, fr-FR, it-IT, each under 500 characters, real diacritics). It follows the listing rule:
   no price, no Premium, no trial, no Stripe, no website. **Never paste `docs/release-notes/1.5.1.md`'s Play
   block**: every tag in it mentions Premium.
6. **Save > Review release**. On production, roll out to **100%**, not a staged percentage.

### 2. Edit every store listing

1. Run `node scripts/check-listings.mjs` from the repo root. It must pass before anything is pasted.
2. **Grow users > Store presence > Store listings**, the main listing (en-AU): paste the short and full
   description from [play-store-submission-pack.md](play-store-submission-pack.md) ("Store listing,
   paste-ready").
3. Each translated listing on the same page: de-DE, es-ES, fr-FR and it-IT from
   [play-store-listings-localised.md](play-store-listings-localised.md).
4. **es-419**, if Play has it (the release notes carry the tag, so it probably does): the repo has no
   es-419 paste source. Paste the es-ES copy, which the gate has checked. It uses Spain's vosotros forms,
   which is a copy nicety, not a policy problem. Never leave an old es-419 text in place that still carries
   a price or a Stripe line.
5. After each paste, read it once on screen: no price, no Premium section, no "Stripe", no "not Google
   Play", no "subscribe on our website".
6. **Screenshots.** Regenerate them for Today v3 (`node scripts/play-assets.mjs`) and make sure **no shot
   shows a Premium surface**: no `settings-light` shot with "Colour theme PREMIUM", no Menu shot with a
   Premium row. The current `settings-light` slide shows that badge, so re-capture it without it or drop
   it. Check each translated listing's own screenshots too, and replace any that show Premium or a price.

### 3. App access (the reviewer can sign in and lands on Premium)

**Monitor and improve > App content > App access**: choose **All or some functionality in my app is
restricted**, and add one set of instructions.

Before filling it, three things outside the Console, all by hand:

1. **The code relay still works.** In Cloudflare: doubledone.app > Email > Email Routing > routing rules,
   `appreview@doubledone.app` must still route to the Worker `doubledone-ai`. The July note said to delete
   it after Apple's approval, so it may be gone. Recreate it if so. (How the relay works:
   `server/src/review-otp.ts`.)
2. **A permanent comp on the review account.** Add `appreview@doubledone.app` to the `COMP_EMAILS` Worker
   secret (Cloudflare dashboard > Workers & Pages > doubledone-ai > Settings > Variables and Secrets, or
   `npx wrangler secret put COMP_EMAILS` from `server/`). The value **replaces** the whole list and cannot
   be read back, so type every existing address plus this one, comma-separated. It is a production
   change, so it is Melroy's hand.
3. **Walk it yourself once** on the new build: sign in as the review account, see Premium on, see no price.

Paste this into the instructions box. Username `appreview@doubledone.app`. Password: none, the account is
passwordless.

```
Sign-in is passwordless: an email address and a one-time code. To sign in as the review account:
1. Open DoubleDone and tap "Sync and sharing" on Today to reach Sign in.
2. Enter appreview@doubledone.app and tap "Email me a code".
3. In any browser, open https://api.doubledone.app/review-code. It shows the latest 6-digit code.
4. Type that code into the app.
Codes expire after an hour. If the page says there is no code yet, or that it has expired, tap send again in the app and refresh the page.
Everything except Premium features and the shared list works with no account at all. This review account has Premium, so every feature is open.
Premium is not sold in the Android app. Existing members sign in. New users can take a free 30-day trial with no payment.
```

> **The same account is Apple's review account.** While it is comped, an Apple reviewer signed in as it
> finds Premium already on and no purchase screen. Before the next iOS submission that needs the in-app
> purchase tested, either tell Apple in the review notes to test the purchase signed out (iOS sells
> without sign-in) or lift the comp for that review window.

### 4. Data safety

**Monitor and improve > App content > Data safety**: set **Financial info > Payment info** to **Not
collected**. Payments happen on the web or through Apple, outside this app. Every other answer stays as
it is ([play-store-submission-pack.md](play-store-submission-pack.md) has the table).

### 5. Content rating

**Monitor and improve > App content > Content rating**: if the questionnaire answered **Yes** to users
buying digital goods in the app, change it to **No**, save, and submit the new rating in the same batch.
Leave the shared-list (Ours) answers exactly as [ours-store-compliance.md](ours-store-compliance.md) has
them.

### 6. Optional tidy-ups

1. **Grow users > Store presence > Store settings**, the contact details' Website field: point it at
   `https://doubledone.app/support` rather than the root. The root opens the web app, whose Premium screen
   sells through Stripe. Check the support page carries no price and no buy link first.
2. **Monetize with Play > Products**: confirm there is no subscription and no one-time (in-app) product,
   not even a draft.

### 7. Send it, and do not argue

**Publishing overview > Send changes for review**, with every change above in the one batch: the tracks,
the listings, App access, Data safety and the content rating. **Do not reply to the rejection and do not
appeal it.** The compliant update is the reply.

### 8. After approval, check it on a real Play install

On a device installed **from Play** (never sideload over a Play install, the signatures differ), update
from Play, then check:

1. **No price anywhere**: the Premium screen, the welcome, Settings, the Menu, and the in-app Terms and
   Privacy.
2. **A web-bought account shows Premium** after sign-in.
3. **The free month starts** on a fresh free account, with no payment step.

Once the release is live at 100%, bump `android` in `client/public/version.json` by hand (it is only
ever bumped once a store release is genuinely live).
