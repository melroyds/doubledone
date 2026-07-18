# DoubleDone: iOS submission prep pack

Everything below is in the order you will actually do it. Section 1 is the device test, do that first while the phone is in your hand. Sections 2 and 3 are paste-and-answer. Sections 4 and 5 are the run sheet.

**Price correction (2026-07-19):** an earlier draft of this pack said A$4.99 / A$49.99. The real App Store Connect prices are **A$5.00 / A$50.00**, confirmed by Apple's own purchase sheet showing $50.00. Every price below has been corrected.

**Read this before you start:** the privacy draft had an adversarial verification run against it. Where they disagreed I have gone with the verification and marked each one, so you can see what changed and why.

**The one thing that reshapes the plan.** The RevenueCat disclosure gap has to be fixed in two places: `client/public/privacy.html` (the web page, deploys instantly via Pages) and `client/src/app/privacy.tsx` (the in-app screen, which is what the paywall's "Privacy policy" link opens, and which is therefore your 3.1.2 compliance surface). The in-app one needs a new build. So **build 8 is probably not your submission build**. Your call, and I am not queuing anything. Options are at the top of section 4.

---

# 1. The purchase test

Steps 1 to 5 are about 10 minutes. Steps 6 to 9 add a wait, because sandbox subscriptions have to expire before you can re-test. Do 1 to 5 now, come back for the rest.

Each step is **do**, then **expect**, then **what it means if you do not see that**.

### Step 0. Only if you have already purchased on this device

Settings, Developer, Sandbox Apple Account, Manage, clear the purchase history. Sandbox subs also expire on their own (monthly = 5 minutes, annual = 1 hour, auto-renews 6 times then stops), so waiting works too.

### Step 1. Sign into the sandbox account

**Do:** Settings, Developer, Sandbox Apple Account, Sign In, `melroy+sbx@dsouza.tech`.

Do this rather than signing in when the purchase sheet prompts you. The account gets attached to StoreKit before the transaction starts, and it lets you clear purchase history between runs, which you will want.

**Expect:** Settings, Developer, Sandbox Apple Account shows `melroy+sbx@dsouza.tech`.

**If wrong:**
- No Developer menu at all: this iPhone was never paired with Xcode. Fall back to signing in when the Apple sheet prompts you at step 5. That works fine, it is just less forgiving of a typo.
- "This Apple Account is not valid for sandbox": the tester was not created properly. Fix in App Store Connect, Users and Access, Sandbox. Not a code problem.

**Never** sign the sandbox account into Settings, your name, or into Media & Purchases. Developer menu only.

### Step 2. The anonymous paywall

**Do:** open DoubleDone. Do **not** sign in. Settings, then the DoubleDone Premium card at the bottom.

**Expect:**

| Must be there | Exact text |
|---|---|
| Heading | "More of what you love." |
| Price | **A$5.00 / month**, from StoreKit, not "A$5" |
| Renewal line | "It renews on its own until you cancel it. You can cancel any time in your Apple ID settings, up to a day before it renews." |
| Store line | "Billed through your Apple ID." |
| Legal row | **Terms of use · Privacy policy**, both tappable, both open a real screen |
| Restore | "Restore a purchase", visible and tappable |
| Button | "Sign in to go Premium" |

**Must not be there:** the word Stripe, anywhere.

**Known and expected:** signed out you see only the monthly price. The plan toggle is gated on `session` (verified: `premium.tsx:344`), so annual does not appear until you sign in. Apple is satisfied by this because price, period and renewal terms for the product being sold are all present. It is also the reason a reviewer cannot reach the buy button, which section 4 handles with a review account.

**If wrong:**
- "The App Store is not answering right now": App Store Connect product metadata is incomplete, so the offering is empty. Not a code bug, and section 2 fixes it.
- "A$5 / month" (the rounded catalog price): `EXPO_PUBLIC_RC_IOS_KEY` was not in the build env. The whole IAP path is inert. Wrong build.
- "Billed securely via Stripe": same cause. The iOS seam is not active.
- Terms or Privacy do not open: routing bug, and an Apple rejection under 3.1.2. Tell me and stop.

### Step 3. Tap the button while still anonymous

**Do:** tap "Sign in to go Premium".

**Expect:** the sign-in screen. No Apple sheet. No charge. Nothing store-related.

**If wrong:** an Apple purchase sheet here means `purchaseGate` is being bypassed. **Stop the test and tell me.** That is the bug that orphans a receipt on an anonymous RevenueCat customer, the webhook then refuses to write it, and the person pays and stays free.

### Step 4. Sign in

**Do:** enter your email, send, get the 6-digit code, enter it.

**Expect:** "Signed in", then it returns you after about 1.5 seconds. Because sign-in was pushed from the paywall, you land back **on the paywall**. The plan toggle now appears, tapping Annual flips the price to **A$50.00 / year**, the button now says **"Go Premium"**, and "Or try Premium free for a month" appears below it.

**If wrong:**
- Code never arrives: Supabase auth, separate problem.
- You land on Today: navigate back to Settings, Premium. Cosmetic.
- Button still says "Sign in to go Premium": the session is not reaching the paywall. Tell me.
- One price renders but not the other: only one of the two products has cleared metadata in App Store Connect.

**Do not tap "try Premium free for a month" during this test.** It grants premium server-side and masks everything below.

### Step 4b. Take the two review screenshots now

This is the only moment they are capturable: signed in, real StoreKit prices, before you become Premium.

**Do:** with **Monthly** selected, take a screenshot. Switch to **Annual**, take a second one. Native iPhone screenshots are fine, these are reviewer-only.

Each frame needs to contain the price line, the "Go Premium" button, the renewal-terms sentence, and the Terms · Privacy row. If it will not all fit, prioritise price plus button plus renewal block, and note the scroll in the product's review notes.

One screenshot per product, with the matching plan selected. Reusing one for both is a common rejection.

### Step 5. The purchase

**Do:** Monthly selected, tap **"Go Premium"**.

**Expect, in order:**
1. Button reads "Opening checkout…".
2. Apple's native sheet, with **[Environment: Sandbox]** at the top. A$5.00. Confirm with Face ID or the sandbox password.
3. Sheet dismisses, the paywall shows "Thanks. Setting up your Premium, this updates in a moment."
4. It polls every 2 seconds, up to 10 times. **Within about 20 seconds** the screen flips to **"You're Premium ✓"** with a Manage subscription button and a renewal date.

**If wrong:**
- No sheet, error "That did not go through. Nothing was charged.": the package was not in the offering. RevenueCat offering config.
- "The App Store is not answering. Nothing was charged.": StoreKit or sandbox account. Retry.
- "Purchases are turned off on this device": Screen Time restriction.
- "Your purchase is waiting on approval": Ask-to-Buy is on for the sandbox account. Turn it off and re-run.
- **Stuck on "Setting up your Premium", then "This is taking longer than usual… tap Refresh":** this is the one that matters. The purchase succeeded at Apple but the webhook did not write D1. **Tap Refresh once** before concluding. Then check, in order: (a) `RC_WEBHOOK_AUTH` mismatch between the RevenueCat dashboard and the Worker secret, which shows as a 401; (b) the webhook URL is not `https://api.doubledone.app/rc-webhook`; (c) RevenueCat is not forwarding sandbox events. RevenueCat's webhook delivery log shows you the response code, look there first.
- Flips to Premium but no renewal date: the event carried no `expiration_at_ms`. Cosmetic, note it.

**Then tell me it worked** and I will query D1 to confirm the `entitlements` row has `source = 'apple'`. If it says `stripe`, the wrong branch wrote.

### Step 6. Cancel

Needs you non-premium. Wait out the sandbox sub (5 minutes) or clear purchase history, then relaunch.

**Do:** tap "Go Premium", then swipe Apple's sheet away.

**Expect: nothing.** No error, no red text, no "cancelled" note, no state change. The button returns from "Opening checkout…" to "Go Premium" and the paywall sits exactly as it was.

**If wrong:** any visible error means the cancel outcome is not mapping to `'cancelled'`. Send me the exact text. Shaming someone for backing out of a purchase is the one thing this app does not do.

### Step 7. Restore

**7a. Anonymous.** Sign out, go to the paywall, tap "Restore a purchase".
**Expect:** it routes you to sign-in, possibly showing "Sign in first, so the purchase attaches to your account." No Apple sheet, no restore attempted.
**If wrong:** an Apple restore sheet here is the same class of bug as step 3.

**7b. Signed in, with something to find.** Purchase, then delete and reinstall from TestFlight, sign in, tap Restore.
**Expect:** "Checking…" then "Restored. Premium is back on.", and the screen flips.

**7c. Signed in, nothing to find.**
**Expect:** "Nothing to restore on this Apple ID. If you subscribed somewhere else, sign in with that account and it will follow you here."

**If wrong:** "Could not check just now. Nothing changed." means the SDK threw. But the real failure to watch for is a tap that produces **no message at all**. Apple rejects a Restore control that visibly does nothing. Flag it if you see it.

### Step 8. Manage subscription

**Do:** while Premium via Apple, tap "Manage subscription".

**Expect:** Apple's own Manage Subscriptions sheet, in-app. Some iOS versions bounce you to Settings, Subscriptions instead, which is fine.

**If wrong:**
- **A browser opens to a Stripe portal:** the entitlement row's `source` is `stripe`, not `apple`. Either the webhook wrote the wrong branch or an older Stripe row is shadowing the Apple one. This one matters, sending an Apple subscriber to a Stripe portal is both broken and a 3.1.1 problem.
- Error mentioning "bought on an iPhone or iPad, so Apple handles it": you are on the non-iOS branch. Wrong build.
- Nothing happens: `showManageSubscriptions` threw silently. Note it, low severity.

### Step 9. The double-charge guard

Only testable if you have an account with a live Stripe subscription. If not, skip and I will cover it another way.

**Do:** sign out on the iPhone, sign in with the Stripe-subscribed account, open Premium.

**Expect:** the paywall never appears. Straight to "You're Premium ✓" with Manage subscription. No Buy button exists, so no second charge is possible.

**If wrong:** if an Apple sheet appears for an account with a live Stripe sub, stop and tell me. That is a real double charge.

**Related, and worth a separate conversation before public listing:** a Stripe subscriber tapping Manage subscription on iOS opens the Stripe portal in an external browser. Correct for their subscription, but Apple has opinions about external purchase management in an app that also sells IAP.

### Quick failure map

| Symptom | Almost certainly |
|---|---|
| No prices, "App Store is not answering" | Product metadata incomplete in App Store Connect |
| Catalog prices (A$5, A$50) | `EXPO_PUBLIC_RC_IOS_KEY` missing from the build |
| Purchase works, Premium never flips | Webhook: `RC_WEBHOOK_AUTH` mismatch or wrong URL |
| Apple sheet on an anonymous tap | `purchaseGate` bypassed (serious, stop) |
| Error text after cancelling | `purchaseOutcome` mapping |
| Manage opens a browser | `source` wrote `stripe` instead of `apple` |
| Restore tap produces no message | Rejection risk, flag it |

Files if something needs tracing:
`C:/Users/molte/OneDrive/Claude Output/Product Manager Portfolio/DoubleDone/client/src/app/premium.tsx`
`C:/Users/molte/OneDrive/Claude Output/Product Manager Portfolio/DoubleDone/client/src/lib/iap.ts`
`C:/Users/molte/OneDrive/Claude Output/Product Manager Portfolio/DoubleDone/client/src/lib/purchases.ios.ts`
`C:/Users/molte/OneDrive/Claude Output/Product Manager Portfolio/DoubleDone/server/src/revenuecat.ts`

---

# 2. Copy to paste into App Store Connect

Monetization, Subscriptions, open the group, open each product.

### `app.doubledone.premium.monthly`

Display Name (30 max, 15 used):
```
Premium Monthly
```

Description (45 max, 44 used):
```
Scan, themes, Quiet, scrapbook and insights.
```

### `app.doubledone.premium.annual`

Display Name (30 max, 14 used):
```
Premium Yearly
```

Description (45 max, 44 used):
```
A year of scan, themes, Quiet and scrapbook.
```

Both descriptions name only features that exist in `client/src/lib/catalogs/en.ts`. Nothing promised that is not shipped.

### Review notes

Paste into both products. Swap the plan line for the annual one, and fill the two blanks. **Submitting with the credentials blank is the single most likely cause of a rejection here.**

```
DoubleDone is a calm daily to-do app, designed for people who find a full
task list overwhelming. The full daily loop is free forever and needs no
account. Premium adds optional extras only.

This subscription unlocks: photo scan to tasks, pin the day's one thing,
the Quiet interface, colour themes, the weekly AI scrapbook, patterns and
insights, Chart a course, Plan my day, and energy matching. The scrapbook
and the insights accrue over time (a week, then two months, then six
months), so the value is ongoing rather than a one-off unlock.

Plan: A$5.00 per month, auto-renewing monthly.

HOW TO REACH THE PURCHASE
1. Open the app and complete the short welcome.
2. Open Settings and tap the DoubleDone Premium card at the bottom.
3. Sign in is required before purchase. Credentials below.
4. Choose Monthly or Annual, then tap Go Premium.

REVIEW ACCOUNT
Sign-in is a one-time code sent by email, so we have provided an account
whose code is fixed and needs no inbox access.
Email: [FILL]
Code: [FILL]

NO PURCHASE IS NEEDED TO TEST PREMIUM
On the same screen there is a "try Premium free for a month" link. It
grants full Premium with no transaction, so every Premium and AI feature
can be exercised without a sandbox purchase.

AI FEATURES AND THIRD-PARTY DISCLOSURE
AI is off by default. The user turns it on from a consent card in
Settings, which names the provider (Anthropic's Claude) and states that
the task text is sent there. No AI request is made before that consent.

ACCOUNT DELETION
Settings, at the bottom, "Delete account".

PURCHASE PLUMBING
Purchases are validated server-side by RevenueCat, which grants the
entitlement by webhook. The app polls for confirmation for about 20
seconds and shows a short "setting up your Premium" note meanwhile.

Restore Purchases is on the same screen and also requires sign-in, because
the receipt must attach to a user account.

Prices, renewal terms, and working links to the Terms of Use and the
Privacy Policy are all shown on the purchase screen before purchase.
```

For the annual product, change the plan line to:
```
Plan: A$50.00 per year, auto-renewing yearly.
```

Two notes on this:

- The AI disclosure paragraph is deliberate. Apple added 5.1.2(i) in November 2025 and reviewers are actively hunting undisclosed third-party AI sharing. DoubleDone already passes it better than most apps will, because the consent card names Anthropic outright. Volunteering it converts a risk into a credit.
- **Genuinely uncertain:** offering a server-side free month outside StoreKit is normal practice (comped access, promo grants) and it is not an IAP circumvention because nothing is being sold outside the store. But 3.1.1 enforcement around free grants has moved before. I would still include it, the upside of a reviewer being able to exercise every feature outweighs the small chance of a question.

### Two different screenshots, do not mix them up

| | Review screenshot | App Store screenshots |
|---|---|---|
| Where | On each IAP product | On the app version |
| Who sees it | App Review only, never published | Everyone |
| Size | Minimum 640 x 920 | **1320 x 2868** (6.9-inch) |
| Source | Your iPhone, step 4b above | Generated from the web build, [Claude] |
| How many | One per product, matching plan selected | 5 |

App Store screenshot rules: 1 to 10, PNG or JPEG, sRGB, **no alpha channel**. A PNG with transparency is the most common upload rejection. Apple accepts 6.9-inch and scales everything smaller from it. Your iPhone 16e is 6.1-inch (1170 x 2532), which is **not an accepted upload size**, so you cannot produce these by screenshotting the phone. That is why the harness route is the answer.

### What Apple forbids in these fields

- **No prices** in the display name or description. Apple renders those from your price tier. Putting "A$5.00" in a description is a metadata violation. Neither draft above has any.
- **No other platforms.** Never mention Android, Google Play, the web app, or doubledone.app in these fields. Given DoubleDone sells on Stripe on the web, this matters more than usual. No alternative purchase route, no "also available on the web". That is 3.1.1 and 3.1.3(b).
- **No duration or renewal terms** in the description. Apple renders them itself and restating them reads as redundant metadata.
- **No emoji, HTML, or special Unicode** in the display name.
- **No medical or therapeutic claims.** ADHD, autism and OCD are your audience, not a condition you treat. Describe features. The review notes describe the audience factually without claiming benefit.

Only English is required to reach Ready to Submit. You have `es`, `fr` and `it` catalogs, and adding those localizations later is polish, not a blocker.

---

# 3. App Privacy labels

These are your answers. Everything is traced to code.

| Apple data type | Collected | Linked to identity | Tracking | Purpose |
|---|---|---|---|---|
| Contact Info, Email Address | Yes | **Yes** | No | App Functionality |
| User Content, Other User Content (task text) | Yes | **Yes** | No | App Functionality, Analytics |
| User Content, **Photos or Videos** | **Yes** | **Yes** | No | App Functionality |
| User Content, Customer Support | Yes | No | No | App Functionality |
| Identifiers, User ID | Yes | **Yes** | No | App Functionality |
| Identifiers, Device ID | Yes | **Yes** | No | App Functionality |
| Purchases, Purchase History | Yes | **Yes** | No | App Functionality |
| Usage Data, Product Interaction | Yes | No | No | Analytics |
| **Diagnostics** | **No** | | | |
| Location | No | | | |
| Health & Fitness | No | | | |
| Financial Info | No | | | |
| Contacts, Browsing History, Search History, Sensitive Info, Audio Data | No | | | |

**Tracking: No.** No IDFA, no ATT prompt, no ad SDK, no data broker, no cross-app linking. Do not add `NSUserTrackingUsageDescription`.

### Three answers the verification changed

I am flagging these because the first pass had them differently and the verification is right.

1. **Photos or Videos went from No to Yes, Linked.** The first pass claimed Apple's ephemeral exception. It does not clearly hold: `/ocr` is premium-gated and authenticated (`server/src/index.ts:491` verifies the Supabase JWT), so the photo travels with a verified identity in the same request. The exception also requires that the collection not be part of primary functionality, and photo scan is a paid, marketed Premium feature. And your own policy already says flagged content can be held by Anthropic for up to two years, on the same page a reviewer will open. Under-declaration is the violation. Concede this one, the label already reads heavy.

2. **Diagnostics went from Yes to No.** The evidence offered was `ai_calls.error` and `latency_ms`, which is your server timing its own upstream call, not device crash or performance data. There is no crash SDK in the app (no Sentry, Firebase, Bugsnag or Datadog). Answering Yes raises a flag for nothing.

3. **Usage Data stays Yes, Not Linked, but the reasoning was wrong.** The first pass said no client-side analytics exists at all. The device does POST product-interaction data: `client/src/lib/ai.ts:135` sends `reportOutcome()` to `/outcome`, built in `outcome.ts` and fired from `today.tsx:1020`. `telemetry.ts` being console-only is true of that module, not of the client. The answer is unchanged. The reasoning would have embarrassed you if a lawyer traced it.

Also worth knowing: **Device ID rests on RevenueCat SDK behaviour**, not on your code. There is no device-identifier call anywhere in `client/src`. The SDK collects IDFV by default. Cross-check against the `PrivacyInfo.xcprivacy` inside `react-native-purchases@^10.4.3` so your label does not contradict the SDK's own manifest. I can do that.

### Fix before submitting: where the live policy and the code disagree

Ranked. The first three are the ones I would not submit without.

**1. CRITICAL. RevenueCat is disclosed nowhere, and one sentence is currently false.**
The policy says payments are handled by Stripe or Apple, "never by us." On iOS that is incomplete. `react-native-purchases` sends receipts, its own app user id and the IDFV to RevenueCat, and `purchases.ios.ts:58` calls `Purchases.logIn(userId)`, which transmits your Supabase uid. The policy's "What we never do" section says "No third-party trackers or analytics identities." RevenueCat assigns its own id and links it to yours. A reviewer reads that as an analytics identity, so the sentence is false on iOS. It is also an APP 8 overseas-disclosure point, since RevenueCat is a US company and the policy names only Anthropic and Stripe.
**Fix:** name RevenueCat in the payment section, and soften the never-do line to something defensible, for example "no advertising identifiers and no cross-app tracking."

**2. HIGH. The Anthropic retention sentence may itself be a misstatement.**
`privacy.tsx:49` says Anthropic "does not keep your text or the response by default." The standard Anthropic API does retain inputs and outputs for a period by default. Zero-retention is a separate arrangement. This is stronger than the RevenueCat problem, because it is an affirmative claim rather than a silence. I will verify it against Anthropic's current commercial terms before you touch it, since this is exactly the kind of thing that changes.

**3. HIGH. The whole AI-agent surface is undisclosed.**
Two parts. The custody: `mcp_grants` holds `user_id`, `email`, an encrypted rotating refresh token, and a **plaintext cached access token**, while the policy says the only personal info held is an email for sign-in codes. And the egress: a user's task text flows out to ChatGPT, claude.ai or Cursor through `/mcp` and `/api/v1`. It is user-initiated, but "tasks can be read by an AI client you connect" belongs in the policy. The encryption and the `/mcp/disconnect` kill switch are good engineering that you currently get no credit for. One paragraph closes both.

**4. MEDIUM. Payment-event scope is understated.** The policy says the processor sends an event type, amount and event id. Reality is a durable per-account record: status, `current_period_end`, `cancel_at_period_end`, `started_at`, `stripe_customer_id`, `source`, plus `trials` and `processed_events`. Not damaging, but it reads as less than you hold.

**5. MEDIUM. Two data stores are missing entirely.** The Supabase `scrapbooks` table (`user_id`, caption, image URL, RLS-scoped) and the R2 keepsake images served **unauthenticated** at `/scrapbook-img/:key` behind a random UUID. The policy honestly calls that "an unguessable address", which is fine, but capability-URL security deserves naming.

**6. LOW, web-only, not in the iOS label but on the same public page a reviewer may open.** `push_subs` (a push endpoint is a stable per-browser identifier) is undisclosed. The IP sentence is scoped to the scrapbook but `index.ts:304` also keys a rate limiter on `CF-Connecting-IP`, transient and not stored, so defensible but narrower than the code. And `speech.web.ts` claims the Google-speech caveat is "recorded in the privacy copy", which it is not.

### Two things the table cannot say

**Apple's questionnaire is per data type, not per pathway.** If one route links a type, the answer is Linked. Task text is unlinked in `ai_calls` but linked in the synced `tasks` table, so User Content must read Linked. The label will therefore look heavier than the default experience actually is. That nuance belongs in the policy and the store description, not the label.

**The anonymous-first default is genuinely true, and it is a strong story.** With no account and AI off, nothing is collected: tasks live in AsyncStorage, client telemetry is a console line, no network call fires. `loadEntitlement` returns FREE without a fetch when there is no auth header. Collection starts at sign-in or first AI use. One honest edge: someone who used AI once, then turned it off, still pings `/outcome` when finishing an old decomposition step.

Worth saying out loud in the policy, because it is true and most apps cannot claim it: most AI routes carry no identity at all. Only 4 of 14 call `requirePremium`. `/decompose`, `/triage`, `/split`, `/strategise`, `/combine`, `/tiny`, `/sequence`, `/energy` and `/scrapbook` are unauthenticated, and `ai_calls` has no `user_id` and no IP column. That is a better unlinked story than the draft told.

---

# 4. The rest of the submission checklist

### First, a decision only you can make

The privacy fixes in section 3 land in two files. `privacy.html` deploys instantly. `privacy.tsx` is the in-app screen behind the paywall's compliance link, and it **needs a new build**.

| | What it costs | What it leaves |
|---|---|---|
| **Fix both, build 9, submit that** | One EAS build from the monthly quota | Nothing. Clean. |
| **Fix the web page only, submit build 8** | Nothing | A known misstatement sitting behind the 3.1.2 privacy link |

I would take the build. The RevenueCat line is currently false on iOS and it sits exactly where a reviewer or a regulator would look. But it is your quota, and I will not queue anything until you say so.

### Already done, nothing to do

- **Export compliance.** `client/app.json:14` sets `ITSAppUsesNonExemptEncryption: false`. Correct: your client-side crypto is HTTPS and auth tokens in storage, both exempt. The AES-GCM work runs on the Worker, not in the shipped binary, so it does not enter the declaration. No "Missing Compliance" prompt per build. **Standing rule:** if a future client feature adds real encryption (encrypted local vault, custom crypto, end-to-end sync), revisit this key before that build ships.
- **Renewal terms are translated.** I checked all four catalogs. `appleRenewalTerms` is present and non-placeholder in `en`, `es`, `fr` and `it` (line 317 or 321 in each). A missing translation would render a key name on a paywall and trip 2.1. Closed.
- **Account deletion.** Present at `settings.tsx:533`, with R2 scrapbook purge. Satisfies 5.1.1(v). The review notes above point the reviewer at it so they do not hunt.
- **Sign in with Apple.** Does not apply. That attaches to third-party or social login, not first-party email OTP.
- **3.1.1 external purchase links.** I checked `terms.tsx`. The Stripe mentions at lines 49, 50 and 58 are conditional prose ("If you subscribed on our website or on Android"), not a tappable route. That is fine. One softening worth making: line 50 says the Stripe portal is "reachable from the app", which on iOS it is not, and which reads like steering. Small copy fix, I can do it.
- **Secondary category.** Do not add Health & Fitness. It pulls you toward medical scrutiny for no discovery gain. Primary Productivity, secondary none.

### The run sheet

1. **[you]** Section 1, steps 1 to 5, plus 4b for the two review screenshots.
2. **[Claude]** Query D1 and confirm the `entitlements` row flipped with `source = 'apple'`. Needs step 1 done.
3. **[Claude]** Regenerate App Store screenshots at 1320 x 2868. `scripts/screenshots.mjs:31` is currently `{ width: 390, height: 844 }` at `deviceScaleFactor: 2`, which yields 780 x 1688 and is unusable. Repointing to 440 x 956 at scale 3 gives exactly 1320 x 2868. I also need to strip alpha on export. The existing `docs/screenshots/*.png` are Play Store assets at the wrong size and cannot be reused. Five shots: Today, Break it down, Lookback, Scrapbook, Premium paywall.
4. **[Claude]** Write the Supabase fixed-OTP migration for `appreview@doubledone.app`, forcing a constant code. **[you]** apply it and verify the code works. This is the fix for the reviewer login wall. The alternative, letting the reviewer self-provision with their own email, works in theory but assumes they bother, have inbox access on the test device, and read the note. Three assumptions gating the thing being reviewed. Do not bet a review cycle on it. Disable the trigger after approval.
5. **[Claude]** Write the privacy policy paragraphs (RevenueCat, AI-agent access, payment scope, the two missing stores) into both `privacy.tsx` and `privacy.html`. **[you]** read and approve before either ships.
6. **[Claude]** Build a real `doubledone.app/support` page. There is currently no support route in `client/public` or `client/src/app`, only a `support@doubledone.app` address inside the terms and privacy screens. A bare mailto as the Support URL is a common 2.1 rejection. **[you]** approve the Pages deploy.
7. **[Claude]** Draft the subtitle (30), description (4000, with the terms URL appended at the end), keywords (100, comma separated, no spaces), and promotional text (170, editable later without review). Design language, not clinical: "calm", "built for people who find a full to-do list overwhelming", never "treatment", "therapy" or "symptoms".
8. **[you]** App Store Connect, age rating questionnaire. Mandatory since 31 January 2026 or the submission is blocked. Answer the medical and wellness question **No**. Expected outcome 4+.
9. **[you]** App Store Connect, App Privacy labels. Section 3 above.
10. **[you]** App Store Connect, listing: name, subtitle, description, keywords, promo text, screenshots, Support URL, Marketing URL (`https://doubledone.app`), Privacy Policy URL. Verify the privacy URL loads in a logged-out incognito window before you paste it.
11. **[you]** The EULA. Either set Apple's standard EULA under App Information, License Agreement, or paste your own terms URL at the end of the App Description. Missing this is a frequent 3.1.2 rejection.
12. **[you]** App Review Information: set **Sign-in required to Yes** (not No, the reviewer hits the login wall the moment they test the IAP), paste the credentials, paste the review notes, and give a phone number with +61 that you will actually answer.
13. **[you]** Per product: localization, review screenshot, review notes, pricing confirmed. Then **Add for Review** on each. Both must reach **Ready to Submit**.
14. **[you]** In the Add for Review modal, because this is your first subscription of this type, it will ask for a platform and app version. **Choose iOS and the version carrying the new build.** Add the subscription group to the same submission. Add the second product to that same submission.
15. **[you]** Go to App Review in the sidebar. Confirm the draft lists the app version, the subscription group, and both products. Then submit once, from there.

**The rule behind steps 14 and 15, because the failure mode is silent:** your first auto-renewable subscription must be submitted attached to a new app version, and a new subscription group must go with at least one of its subscriptions. Submit the products on their own and they are simply not reviewed. The binary gets approved, the products sit in "Waiting for Review" forever, and every purchase in production fails.

The two items that will actually delay you are the **6.9-inch screenshots** (blocked by no Mac and no compatible device, hence the harness) and the **reviewer OTP**. Everything else is form-filling.

---

# 5. What I can do

### While you are away, without touching a device, App Store Connect, or a build

- Repoint the screenshot harness and generate the five 6.9-inch shots with alpha stripped.
- Write the Supabase fixed-OTP migration file, ready for you to apply.
- Draft subtitle, description with the terms URL appended, keywords, promotional text.
- Write the privacy policy paragraphs into both `privacy.tsx` and `privacy.html`.
- Build the support page, held un-deployed until you approve.
- Verify the Anthropic retention sentence against their current commercial terms. This is item 2 in section 3 and I do not want to guess at it.
- Check `PrivacyInfo.xcprivacy` inside `react-native-purchases` so the app label does not contradict the SDK's own manifest.
- Grep every route for a raw i18n key rendering, which reads as placeholder content and trips 2.1.
- Soften the `terms.tsx:50` line about the Stripe portal being "reachable from the app".

### When you are back, and only then

- Query D1 to confirm the `entitlements` row, needs the sandbox purchase to have happened.
- Deploy anything to Pages or the Worker, needs your per-instance OK.
- Anything requiring a build. Nothing in the away list needs one. The privacy edits do, and that is the decision at the top of section 4.

Start with the phone in your hand. Section 1, steps 1 to 5, then step 4b before you buy.