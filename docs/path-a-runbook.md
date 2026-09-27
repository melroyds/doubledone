# Path A runbook: selling Premium on Android through Google Play Billing

**"I have to sign up to Google Billing I bet?"** Half right, and you've already done most of it. There's no separate product called Google Billing. Selling needs a **merchant account** (Google calls it a payments profile) inside the Play Console you already use. You created that profile on 27 Sep. What's left is the bank account, the tax forms and one decision about your address. Play Billing comes with the profile ([Play 7161426][p7161426], [Play 140504][p140504]).

*Written 2026-09-27 by a seven-agent planning pass (code audit, RevenueCat docs, Play docs, a synthesis, a Play-policy skeptic, a money-path skeptic, a revision). Two load-bearing claims were re-checked by hand the same day against Google's own pages: a monetising PERSONAL account shows its full address on Google Play (answer 13628312), and Australian subscriptions move to 10% plus a not-yet-announced billing fee on 30 Sep 2026 (answer 16954621). File:line references are as of main `de3c4fc`-era code, so re-read a line before trusting it.*

---

## 1. Verdict

Path A is still the right call, and it's the elegant one. Each store sells through its own checkout, and Play supplies prices already localised for each country. A fixed A$ price shown abroad is exactly what got 1.5.1 rejected (`BUILD-PLAN.md:163`). Path A is also required before any cheaper option later, because Australia's user choice billing keeps Play Billing as one of the choices ([Play 13821247][p13821247]). The US program works differently ([Play 16497028][p16497028]), but that doesn't change anything for you.

**What it costs:**
- **Google's cut** is 15% on subscriptions until 29 Sep 2026 ([Play 112622][p112622]). From 30 Sep, Australian buyers move to 10% plus a billing fee Google hasn't announced yet. It's 5% in the US, UK and EEA ([Play 16954621][p16954621]). Plan on about 15% (roughly 75c of each A$5 month) until Google says otherwise.
- **GST on Google's fee.** While you're not GST-registered, Google may add 10% GST on top of its fee ([Play 138000][p138000]).
- **My code time** is about a week and a half. The reviews added real money-path work: the double-charge guard, writes that cross stores, and payment-failure states. None of it is polish.
- **Your console time** is maybe half a day, spread across waiting periods.
- **Calendar time** is my estimate of about three weeks. It's set by the 1.6.0 review, a 36-hour credential wait, a bank deposit that takes up to 3 business days, one or two EAS builds and one Play review.

**The deciding question isn't about code. It's this: which address does your existing payments profile hold, and are you OK with it being public?**
- On a personal account, Google shows your full legal address once you monetise ([Play 13628312][p13628312]). It also appears on buyers' receipts ([Play 7161426][p7161426]).
- That address comes from the payments profile you already have. Changing it needs a form and a proof-of-address document. If Google can't verify it, "your developer presence and apps may be removed" ([Play 13634888][p13634888]).
- So a virtual office only works if you hold an accepted document in your legal name at that address. Details in M1.

**The Backlog trigger isn't a gate any more.** On 27 Sep you overrode it: "I don't care about the future. I need to be elegant." With 43 Android installs, Path A is about being correct and elegant, not about revenue this quarter. That's a legitimate reason and I'm not reopening it. I'll still pull the two D1 numbers (entitlements by source, Android's share of signups) for the decision log.

| Path | What it is | Verdict |
|---|---|---|
| A | Play Billing now, parity-priced | **Pick**, once the address question is answered |
| B | Wait for user choice billing (Australia, non-gaming apps, 4% off the fee) | It still needs Play Billing as one of the options, so it's Path A plus paperwork |
| C | Stay on Path C | Android earns nothing, and you've already ruled this out |

---

## 2. Melroy's steps (in order)

Never paste a secret, key file, bank detail or tax number into chat. The only key the app needs is RevenueCat's public `goog_` key, and you enter that into EAS yourself.

### M1. Check the address, then decide
- **Where:** Play Console > Settings > Payments profile. Also open your own DoubleDone Play listing and look at the developer contact section. If an address already shows there, the question is answered.
- **The three outcomes:**
  1. It's your home and you're OK with it being public. Go on.
  2. It's your home and you're not OK with that. Change it only if you hold one of Google's accepted documents in your legal name at the new address: a government document, a utility or phone bill, a bank statement, or a lease or mortgage ([Play 13634888][p13634888]). Most virtual offices can't give you one of those, so ask before you pay for one. No PO boxes ([Play 7161426][p7161426]).
  3. Neither works. Path A stops here.
- **Never change it while 1.6.0 is in review.**
- **Time:** one coffee, plus a call to a virtual office if you're considering one.
- **Unblocks:** everything below.

### M2. Ask your accountant three questions
1. **Should you register for GST?** For an Australian developer, Google doesn't collect or remit Australian GST. That becomes your job once you're registered ([Play 138000][p138000]). All DoubleDone revenue counts toward the threshold, Stripe included (ask about Apple too). The A$75k figure is from memory, because the ATO page wouldn't load during research.
2. **Do you need an ABN?** Google's Australia tax form asks individuals for a date of birth and businesses for an ABN, so it isn't strictly required for you ([Play 138000][p138000]).
3. **What changes if you register?** Play shows Australian buyers tax-inclusive prices, and it adds the tax rate you set in Play Console ([Play 138000][p138000]). Until you're registered, leave the Australian rate unset. Once you're registered, set it, and the GST comes out of the A$5.

- **Time:** one call.
- **Unblocks:** your answers in M5 and M11.

### M3. Check the payments profile you already made
- **Where:** Play Console > Settings > Payments profile ([Play 7161426][p7161426]). If the menu has moved, search for "Payments profile".
- **Check these:**
  - legal name
  - legal address (M1)
  - **business country is Australia.** It can't be changed later, and a Play account links to a payments profile only once ([Play 3092739][p3092739])
  - website `doubledone.app` and the support email
  - the name buyers see on their card statement (my suggestion: something they'll recognise, like DOUBLEDONE)
- **Also, from your to-do list:** enrol in the 15% service fee through Manage account group. Subscriptions are 15% anyway ([Play 112622][p112622]), so this only costs five minutes and it settles the question.
- **Unblocks:** creating subscriptions ([Play 140504][p140504]).

### M4. Add and verify the bank account
- **Where:** inside the payments profile.
- **What to enter:** account holder name, BSB, account number. Google's Australian form expects a 9-digit account number, and payouts go by EFT in AUD ([Play 7161440][p7161440]).
- **Then:** Google sends a deposit under US$1. It can take up to 3 business days. Enter the amount to verify ([Play 7161378][p7161378]).
- **This is a hard gate before the production release, not just about getting paid.** Google says monetising developers must verify their payment method "to receive payments and keep their developer account compliant" ([Play 13628312][p13628312]). Testing can go ahead without it.

### M5. Tax forms
- **W-8BEN:** the US form for a non-US merchant, submitted inside the payments profile ([Play 7163598][p7163598]). You couldn't find US tax info last time. Look again under the profile's settings. It affects US sales, but as far as I know it doesn't stop you selling, so don't let it hold up the rest.
- **Australian tax details:** Payments profile > Manage settings > Australia tax info.
  - Tick the declaration.
  - Enter your date of birth and the contact numbers the ATO's sharing-economy reporting asks for.
  - Add an ABN only if M2 says to get one ([Play 138000][p138000]).
- **Time:** 15 minutes.

### M6. Google Cloud project for RevenueCat (day 1, because it has the longest wait)
- **Where:** Google Cloud console.
- **Steps:**
  - Create a project.
  - Enable the Google Play Android Developer API, the Google Play Developer Reporting API and the Pub/Sub API.
  - Create a service account with the roles **Pub/Sub Editor** (switch to Pub/Sub Admin if you hit permission errors) and **Monitoring Viewer**.
  - Create its JSON key ([RC credentials][rc-creds]).
- **If Cloud won't create a JSON key:** a new organisation's "Secure by Default" policy blocks it. Use a project under your personal @gmail account instead ([RC codelab][rc-codelab]). Organisations created after 3 May 2024 may also need Domain Restricted Sharing switched off ([RC RTDN][rc-rtdn]).
- **Where the key file lives:** not in the DoubleDone folder. The repo sits in Dropbox, so anything saved there gets synced. Save it locally, upload it in M8, then delete it. You can always create a new one.
- **Time:** 30 to 45 minutes.

### M7. Invite the service account into Play Console
- **Where:** Play Console > Users and permissions. Invite the `client_email` from the JSON file.
- **Grant the official four permissions** ([RC credentials][rc-creds]). The codelab lists three, so ignore it here.
  - View app information and download bulk reports
  - View financial data, orders, and cancellation survey responses
  - Manage orders and subscriptions
  - Manage store presence
- **Time:** 5 minutes.

### M8. Add the Google Play app in RevenueCat
- **Where:** the **existing** DoubleDone project in RevenueCat, not a new one. The webhook, the entitlement and `RC_SECRET_KEY` apply across the whole project ([RC auth][rc-auth]).
- **What to enter:** app name, package `app.doubledone`, then upload the JSON key ([RC connect a store][rc-connect]).
- **Copy:** the public SDK key that starts with `goog_`. It's public by design.
- **Wait:** up to 36 hours before the credentials work ([RC credentials][rc-creds]).
  - A "Credentials need attention" warning during that window is Google still propagating. Don't redo the setup ([RC codelab][rc-codelab], [RC community][rc-community-creds]).
  - A trick that speeds it up: in Monetize, edit a product description, save, then change it back. This only works once a product exists, so it's for after M11, not day 1.
- **Unblocks:** M9, M12 and M13.

### M9. Put the key into EAS
- **Where:** the expo.dev project `@melroyds/doubledone` > Environment variables (menu name from memory).
- **What to enter:** `EXPO_PUBLIC_RC_ANDROID_KEY` set to the `goog_` key, in both the `production` and `preview` environments. The builds read from those environments (`client/eas.json:14,21`).
- **Why before the build:** the key is baked in at build time.

### M10. Say yes to the release-candidate build (only after 1.6.0 is approved)
- **What happens:** you say "queue the Android build". I run `npx --yes eas-cli build -p android --profile production` from `client/`. Then I compare the AAB's merged-manifest permissions with versionCode 31's (see A3).
- **Then:** upload the AAB to **Internal testing**, not production.
- **Unblocks:** M11. Play won't let you create subscriptions until a build with the Billing Library is on some track ([Android getting-ready][g-ready]).

### M11. Create the subscription
- **Where:** Play Console > Monetize with Play > Products > Subscriptions ([Play 140504][p140504]).
- **Shape:** **one** subscription with **two** auto-renewing base plans, monthly and yearly.
- **IDs are permanent.** They start with a lowercase letter or number, allow `_` and `.`, run to 40 characters at most, and can't be changed or reused ([Play 140504][p140504]). My suggestion: subscription `premium`, base plans `monthly` and `annual`. RevenueCat then shows them as `premium:monthly` and `premium:annual` ([RC Play products][rc-products]).
- **Name and benefits:** name it "DoubleDone Premium". Never use "Free", "Trial" or "Save" in the name. List benefits that match the paywall's feature list, and add translations for de, es, fr and it. Partly localised terms are a listed violation ([Play 9900533][p9900533]).
- **Prices:**
  - On the Australia row, click the pencil and type the amount ([Play 140504][p140504], [Play 138412][p138412]).
  - Leave the Australian tax rate unset unless M2 said register (see M2). Then A$5.00 typed should be A$5.00 shown. Before you activate, check the price shown to Australian buyers reads exactly **A$5.00** and **A$50.00**.
  - Look over the prices Play generates for other countries.
- **No free trial and no intro offer.** The card-free month already covers "try it", and a Play trial brings its own disclosure rules ([Play 9900533][p9900533]).
- **Per base plan, turn off:**
  - **Pause.** It's on by default and can be disabled ([Android lifecycle][g-lifecycle]).
  - **Resubscribe.** It lets someone rebuy from the Play Store, outside the app, which issues a new purchase token that never passes through our guards ([Android lifecycle][g-lifecycle]).
- **Grace period and account hold:** leave the defaults.
- **Then:** activate both base plans.
- **Time:** 45 minutes to an hour, including the translations.

### M12. Real-time developer notifications (at least 36 hours after M8)
- **Steps:**
  1. In RevenueCat's Play app settings, click Connect to Google and copy the topic ID.
  2. In Play Console > Monetize > Monetization setup > Topic name, paste it and choose "Subscriptions, voided purchases, and all one-time products".
  3. Click Send test notification. RevenueCat should show a recent "Last received" time ([RC RTDN][rc-rtdn]).
- **If the test fails:** in Cloud, give `google-play-developer-notifications@system.gserviceaccount.com` the Pub/Sub Publisher role.
- **This proves Google to RevenueCat only.** M13 covers RevenueCat to our Worker.

### M13. Wire the products in RevenueCat
- **Steps:**
  - Import the Play products.
  - Attach both to the **existing** `premium` entitlement ([RC entitlements][rc-ent]). The webhook checks for that id (`server/src/revenuecat.ts:73-74`).
  - In the `default` offering, add `premium:monthly` to `$rc_monthly` and `premium:annual` to `$rc_annual` ([RC offerings][rc-offerings]). The app looks for those names (`client/src/lib/iap.ts:14-15`).
  - **Open the existing webhook's settings.** Set the app filter to all apps and the environment to both production and sandbox ([RC webhooks][rc-webhooks]). It was set up when iOS was the only app. If it's scoped to iOS, Play events never reach `/rc-webhook`.
- **Restore Behaviour:** leave it as keep-with-original (`docs/ios-iap-progress.md:57`).

### M14. Testers
- **Steps:**
  - Play Console > Settings > License testing: add your testers. Your publishing account always counts as a tester ([Play 6062777][p6062777]).
  - Add the same people to the Internal testing track.
  - Open the opt-in URL on the phone. Skip any of these steps and products won't load ([RC Play sandbox][rc-sandbox]).
- **Also needed:** **a second Google account of yours that is not a license tester**, on the internal track. It's the only way to test with real money. A non-tester on a test track pays actual charges ([Android test][g-test]).
  - It must be the Google account signed in to the phone.
  - Its DoubleDone account must **not** be on `COMP_EMAILS`. The comp answers before D1 is read, so it would hide the row you're testing (`server/src/stripe.ts:594`).
- **Device:** a real phone with one Google account signed in ([RC codelab][rc-codelab]).

### M15. Your OKs for the server slice
- "Push the server slice to main." A push to main redeploys the web. Nothing visible changes.
- **Set one new Worker secret**, `SANDBOX_GRANT_UIDS`. It lists the Supabase user ids of the two review accounts and your license-tester account (S1 explains why). It's a production change, so it's yours to make.
- "Deploy the Worker" (`npx wrangler deploy` from `server/`).

### M16. Store declarations before submitting
- **App content > Sign-in details: two sets** ([Play 9859455][p9859455], which allows up to five):
  - **Set 1:** `appreview@`, comped, so every feature is open. Today's note says "Premium is not sold in the Android app" (`docs/play-store-release.md:478`), and that line has to go.
  - **Set 2:** a second passwordless account, for example `appreview-buy@doubledone.app`. Not comped. It exists so the reviewer can reach Play's purchase screen. A comped account never sees it (`client/src/lib/premium-ui.ts:27`), and signed out, Android now shows only a sign-in button (A4).
  - In Cloudflare Email Routing, route the new address to the `doubledone-ai` Worker. I'll make the relay accept it.
  - I'll draft the 500-character note: set 1 for features, set 2 for the purchase, and "use Go Premium, not the free month".
- **Data safety, the full set:**

  | Data type | Collected | Shared | Required? | Purposes |
  |---|---|---|---|---|
  | Financial info > Purchase history | Yes | No | Required | App functionality, Account management (plus Analytics if you use RevenueCat's charts) |
  | Personal info > User IDs | Yes | No | Optional | Account management, App functionality |
  | Device or other IDs | Add RevenueCat's install id | No | **Required** | App functionality |
  | Financial info > Payment info | No | n/a | n/a | n/a |

  Device IDs becomes required because RevenueCat is configured at launch for every user (`client/src/app/_layout.tsx:82-84`), not only buyers. RevenueCat's own guide covers Purchase history ([RC Data Safety][rc-datasafety]). We declare User IDs on our own grounds, since the account id goes to RevenueCat on every sign-in (`_layout.tsx:96`). Play's exemption covers card data only, not stored purchase history ([Play 10787469][p10787469]).
- **Content rating:** "Users can buy digital goods" becomes **Yes** (`docs/play-store-release.md:517`).
- **Store settings > Website field:** point it at `https://doubledone.app/support`, not the root. This used to be optional (`docs/play-store-release.md:523`). Once the app sells, it's required, because the root's Premium screen sells through Stripe.
- **Store listing:** still no price, no Stripe, no "buy on the website". No screenshot or feature graphic shows Premium or a price. The listing gate can't read images.
- **Turn on Managed publishing**, so an approval doesn't go live until you say.

### M17. Release OKs
- **Hard gates first:** the bank deposit is verified (M4) and both review accounts work (M16).
- Approve the Terms and Privacy wording. They're still drafts waiting for a lawyer's review.
- "Merge premium into main." This is the web deploy.
- Promote the tested internal AAB to production as a **staged rollout** (my pick: 20%), or approve a fresh build if we fixed anything. Release notes go in the six locale tags.
- Publish from Managed publishing once you're ready.

### M18. Pre-decided, for the bad days
- **Refunds:** use **Refund and revoke** in Play Console. A plain refund isn't detected, and detection can take up to 24 hours. A refund from the RevenueCat dashboard expires the subscription immediately ([RC refunds][rc-refunds]).
- **If Path A is rejected:** fix it, run the full policy sweep again, and resubmit. Never appeal, and never resubmit on the same theme without that sweep. Two Payments or Subscriptions rejections in one month looks like the pattern that ends in suspension.
- **If something breaks after release:**
  - Halt the staged rollout.
  - The kill switch is deactivating both base plans in Play Console, which stops new purchases. The app then shows its calm "store not answering" state.
  - The versionCode 31 AAB can't serve as a rollback, because Play won't give a device a lower versionCode than the one it already has. The real rollback is a Path C rebuild at a higher versionCode. That costs one build.
- **Fees:** watch for Google's Australian billing-fee announcement around 30 Sep ([Play 16954621][p16954621]).

---

## 3. Claude's steps (in order)

**Git, plainly:** all of this is built on the `premium` branch. A branch is a parallel copy of the code, and nothing on it reaches doubledone.app until it's merged into `main`.

### Step 0: bring `premium` up to date
- `premium` is 77 commits behind `main`. Its last commit is `7558806` from 21 Aug, so it has no `storefront.android.ts` and no `close-billing.test.ts`. Building on it would mean writing against the app as it was before Path C.
- `premium` is a straight ancestor of `main`, so this is safe: `git switch premium && git merge --ff-only main`, then push `premium`.
- In plain terms, "fast-forward" slides `premium` up to where `main` is, without inventing anything new. Pushing `premium` doesn't deploy.

Two slices need to go live early:
- the server change
- the web app's ability to read a `google` subscription correctly

I'll copy just those commits onto `main` (git calls this a cherry-pick), with your OK. Everything that makes Android sell stays on `premium` until release.

### Slice 1: server (deploy first, backward-compatible)

**S1. Record the real store, and map failure states correctly (Tier 1, money).**
- Today `server/src/revenuecat.ts:78` saves every write as `'apple'`. New mapping:
  - `APP_STORE` or `MAC_APP_STORE` → `apple`
  - `PLAY_STORE` → `google`
  - store missing → `apple` (same as today)
  - `PROMOTIONAL`, `TEST_STORE`, `STRIPE`, `RC_BILLING` → logged with a new `other-store` outcome ([RC webhook fields][rc-webhook])
- First, a read-only query of `rc_events` for `PROMOTIONAL` rows, because today those grant Premium.
- **Payment-failure states.** Today a CANCELLATION with `BILLING_ERROR` overwrites `past_due` with `canceled` (`revenuecat.ts:87-93`), so someone whose card merely failed is told "Premium until {date}". The end of grace then writes `expired` (`:101-106`), which looks exactly like a real lapse. Google lets users repurchase in the app during account hold ([Android lifecycle][g-lifecycle]), so that's a double-charge window. New mapping:
  - CANCELLATION with `cancel_reason BILLING_ERROR` → `past_due`, premium on, no scheduled cancel
  - EXPIRATION with `expiration_reason BILLING_ERROR` → `on_hold`, premium off
  - This also changes live iOS behaviour. It's a fix there too.
- **Clock skew.** A revoking EXPIRATION a few seconds ahead of the Worker's clock is currently ignored forever (`revenuecat.ts:105`). Allow about 60 seconds.
- **Sandbox allowlist.** A sandbox event is applied only for the user ids in `SANDBOX_GRANT_UIDS`. It's logged as `sandbox-allowlisted`, and those ids stay out of metrics. Everyone else is still refused (`revenuecat.ts:290-293`).
  - Why: a sandbox purchase unlocks the device (`client/src/lib/premium-provider.tsx:69`), but the paid AI routes only check D1, comp or trial (`server/src/premium.ts:35-58`). So a reviewer who just bought would get "I couldn't read any tasks from that" from Scan (`client/src/lib/ai.ts:238`).
  - The 2026-08-19 line "Testers lose nothing" (`decision-log.md:7471`) is wrong for server-gated features. The new decision-log entry corrects it. RevenueCat staff say Google reviewers need full Premium access ([RC community][rc-community-reviewers]).

**S2. Reconcile reads the store, with the same allowlist (Tier 1).**
- `server/src/revenuecat-api.ts:93` hard-codes `'apple'`, and `grantFromSubscriber` (`:69-101`) grants for `promotional` rows. It should read the store from the v1 subscription row, which is lowercase `play_store` ([RC v1 customers][rc-v1cust]):

  | v1 store value | Source written |
  |---|---|
  | `app_store`, `mac_app_store` | `apple` |
  | `play_store` | `google` |
  | missing | `apple` |
  | anything else | no grant |

- The existing Apple tests stay unchanged as the guard for live iOS.
- Keep the route path. Live iOS clients call it.

**S3. Allow `google` (Tier 1).**
- `server/src/entitlements.ts:17,81`. Today any unknown source is read back as null, and null means Stripe.
- No migration needed. `source` is a plain text column (`server/d1/schema.sql:55`).

**S4. One store can't switch off another store's subscription (Tier 1, money).**
- `writeEntitlement` overwrites `premium` and `source` unconditionally (`server/src/entitlements.ts:37,43`). So a Refund and revoke on an old Google order would switch off a live Stripe subscriber, and a late Stripe event would switch off a live Google one.
- Fix: a write that turns premium off applies only when the row's source matches, or the row isn't premium. It's a condition on the `ON CONFLICT` update. Log a new `cross-store-kept` outcome, and test both directions.

**S5. Account deletion cancels Play billing (Tier 1).**
- In `server/src/stripe.ts:457-499` (`handleCloseBilling`), also cancel Play renewals. On 2026-09-27 you decided that deleting an account stops billing first (`decision-log.md:8507`).
- **Gate first:** call RevenueCat only when `entitlements.source = 'google'` or there's an `rc_events` row with store `PLAY_STORE`. Two conditions, because `logRcEvent` swallows its own errors (`revenuecat.ts:232-252`). The gate also has to come before any RevenueCat call, because `GET /v1/subscribers` creates a customer if none exists ([RC v1 customers][rc-v1cust]).
- **Then** GET the subscriber. For each `play_store` subscription that hasn't expired and has no `unsubscribe_detected_at`, call `POST /v1/subscribers/{id}/subscriptions/{store_transaction_id}/cancel`. Access runs to the period end and it won't renew ([RC v1 transactions][rc-v1tx]). `rc_events` doesn't store that id (`revenuecat.ts:153-170`), so the GET is required. **Never `/revoke`, which refunds.**
- Skip subscriptions that are already cancelled, so a retry after a failed delete can't wedge on a Google error.
- Fail closed for Play users only, so a RevenueCat outage can't block every deletion.

**S6. Checkout guard (Tier 1).**
- `server/src/stripe.ts:398-403` only blocks rows that have a Stripe `customerId`. Add two rules:
  - premium with source `apple` or `google` → 409
  - `past_due`, `unpaid` or `on_hold` from any source → `billing_issue`

**S7. `/entitlement` stops pretending a failure is "free" (Tier 1).**
- On a D1 throw it returns a 200 with the free shape today (`server/src/stripe.ts:605-615`). Make it a 503. Old clients already read any non-2xx as free (`client/src/lib/stripe.ts:112`), so live apps show exactly what they show now. The new client can tell "couldn't check" apart from "free".

**Tests for slice 1:**
- `server/src/revenuecat.test.ts`:
  - The fixture at `:18-31` gains `store`, and `:127` and `:209` still expect `apple` when the store is missing.
  - New cases: PLAY_STORE, other stores, both orders of BILLING_ISSUE and CANCELLATION with BILLING_ERROR, EXPIRATION with BILLING_ERROR → `on_hold`, the 60-second skew, allowlisted and non-allowlisted sandbox.
  - Extend the `rcIgnoreOutcome` mirror test.
- `server/src/entitlements.test.ts` (or `stripe.test.ts`): cross-store off-writes are kept, in both directions.
- `server/src/revenuecat-api.test.ts:74,119`: a Play subscriber in both key shapes, a `promotional` row that gets no grant, and the Apple cases unchanged.
- `server/src/stripe.test.ts`: the source check (`:207`), Apple, Google and `on_hold` → 409 in the checkout guard suite (around `:321-360`), and a D1 throw → 503 on `/entitlement`.
- `server/src/close-billing.test.ts`: non-Play users never call RevenueCat, the gate works from either condition, already-cancelled subscriptions are skipped, 5xx → 502, and the cancelled count. The runbook's old "RevenueCat 404" test is gone, because GET never 404s.

### Slice 2: the web reads `google` correctly (inert until a Google row exists)

**W1. Allow `google` on the client (Tier 1).**
- `client/src/lib/entitlement.ts:20` and `client/src/lib/stripe.ts:120`. Otherwise a Google subscriber on the web sees "nothing to manage".
- `loadEntitlement` returns known or unknown, not a silent free (`stripe.ts:109,112,123`). The calm free display stays a choice made on the client.

**W2. The Premium screen knows the source (Tier 1).**
- `client/src/lib/premium-ui.ts:26-31`: `premiumPrimaryAction` takes the source and the platform. "Manage" appears only where the biller's own screen can open:
  - `google` on Android
  - `apple` on iOS
  - `stripe` on the web, and on iOS as today

  Every other combination shows an "elsewhere" line that names the source.
- `client/src/app/premium.tsx:273-309` (`manage()`): a `google` row on the web or iOS shows a new `googleManageElsewhere` line. Today it falls through to `startPortal` (`:289`) and shows "Your Premium is on us" (`en.ts:512`), which is false for someone who pays.
- `:392-399` (the `elsewhere` branch) gets the same treatment.
- **Live apps until their next build:** iOS shows that false "on us" line to a Google subscriber, and Android 1.6.0 says "isn't billed through Google Play" (`en.ts:503`). Accepted knowingly, written into the decision log, with a support macro. W2 reaches iOS with its next build.

**Tests for slice 2:**
- `client/src/lib/premium-ui.test.ts`: Google-source cases.
- `client/src/lib/stripe.test.ts`: 503 and a network failure read as unknown.
- E2E case PREM-51.

### Slice 3: Android sells (stays on `premium` until release)

**A1. Split the storefront flag, and catch every price string (Tier 1, policy).**
- Today `SELLS_HERE` answers two questions at once: may this build sell, and may it show Stripe or a fixed A$5? Flip it alone on Android and the A$ comes back.
- **The change:**
  - `client/src/lib/storefront.ts:12` and `storefront.android.ts:2`: `SELLS_HERE` becomes true everywhere.
  - A new `STRIPE_HERE`: true on web and iOS, false on Android.
  - A new `PLAY_COPY`: true only on Android. It picks the wording Play's policy needs, so it doesn't get tangled up with Stripe again.
- **Moved onto `STRIPE_HERE`:**
  - the Stripe refusals at `lib/stripe.ts:21,47`
  - the dunning link at `premium.tsx:443-449` (Android keeps `paymentAttentionPlain`)
  - the fixed-price line at `welcome.tsx:468`
- **Moved onto `PLAY_COPY`**, which the first draft missed. Both reviewers flagged these.
  - **Dollar amounts and the fixed discount.** These render inside the `SELLS_HERE` block at `premium.tsx:501-520` and on the buy button's label at `:549`:
    - `planAnnual` "Annual · save 17%" (`en.ts:519`)
    - `planAnnualA11y` and `planMonthlyA11y`, "fifty dollars", "five dollars" (`:520,522`)
    - `subscribeAnnualA11y` and `subscribeMonthlyA11y` (`:540-541`)
    - the same in `de.ts:519-541` ("fünf Dollar"), `es.ts`, `fr.ts` and `it.ts`

    On Android, the accessibility labels are built from `offer.priceString`, and the "save 17%" is dropped. Play rounds each country's price separately, so a fixed 17% would be false somewhere ([Play 9858738][p9858738], [Play 9900533][p9900533]).
  - **Trial copy.** The iOS-style `separated` slot renders `trialLink` and `trialNoCard` without any check (`premium.tsx:642-653`). `trialUntil` (`:339`) and `trialAlreadyUsed` (`:261`) switch on `SELLS_HERE`. On Android they all use the `*Plain` versions, because "Try Premium free for a month" (`en.ts:548`) mirrors Google's own violation example.
- **New:** a third, Play branch in `terms.tsx:47-77` (see A9).
- **Contract test.** `tsc` resolves `@/lib/purchases` and `@/lib/storefront` to the base files (`client/tsconfig.json` sets no `moduleSuffixes`). So a name missing from the `.android.ts` file compiles clean and is `undefined` only on a device. Add a type-only file that `npm run typecheck` checks, comparing each pair's exports in both directions.

**A2. Android purchases glue (Tier 1).**
- New file `client/src/lib/purchases.android.ts`: a copy of `purchases.ios.ts` that reads `EXPO_PUBLIC_RC_ANDROID_KEY`. It keeps the same "no key, don't configure" guard (`purchases.ios.ts:31-32`), or the app crashes at launch.
- **Identity is checked, not assumed.** Today identify returns silently while the SDK isn't configured yet (`purchases.ios.ts:55`), and it swallows `logIn` failures (`:59-62`). The effect only re-runs when the session id changes (`_layout.tsx:85-98`). So on Android:
  - identify waits for configure to finish
  - `buy()` and `restore()` check `await Purchases.getAppUserID() === uid`. On a mismatch they retry `logIn` once, then refuse with a calm line

  Otherwise a Play purchase can land on an anonymous id, which the webhook drops (`revenuecat.ts:296-300`). The person has paid and exists nowhere in D1.
- New `openStoreSubscriptions()`. `showManageSubscriptions` only works on iOS (`node_modules/react-native-purchases/dist/purchases.d.ts:930-933`), so Android opens `customerInfo.managementURL`, falling back to Play's subscriptions page. Play requires a cancel link ([Play 9900533][p9900533]).
- Export `STORE_SOURCE`: `'apple'` on iOS, `'google'` on Android, `null` on web. Use it in `premium-provider.tsx:69` and in the telemetry at `premium.tsx:163`, both of which hard-code `'apple'` today.
- **Reconcile stays on for Android.** `_layout.tsx:97` calls `/apple/reconcile` whenever IAP is available. Keep it as the safety net for a missed webhook, now that S2 filters stores.
- Rewrite the comment at `purchases.ts:1-14` that explains the inverted split.
- `purchases.ios.ts` stays byte-identical, so Path A needs no iOS build. Its identify race goes on Tier 3.
- Also: add the Android key line to `.env.example`, and exclude the new file from coverage in `client/vitest.config.ts:38-42`.

**A3. Build config (Tier 1). This is what actually puts Play Billing in the AAB.**
- `client/package.json:73-81`: remove `react-native-purchases` from `autolinking.android.exclude`, along with its stale comment ("Android sells via Stripe").
- **launchMode.**
  - `expo-share-intent` forces the main activity to `singleTask` (`node_modules/expo-share-intent/plugin/build/android/withAndroidMainActivityAttributes.js:31-33`).
  - RevenueCat warns that `singleTask` can cancel a purchase when the buyer switches to a bank app to verify, and it requires `standard` or `singleTop` ([RC React Native][rc-rn]).
  - Fix: pass `androidMainActivityAttributes: {"android:launchMode": "singleTop"}` to the plugin in `client/app.json:63-72`.
  - **Fallback, decided in advance:** if PREM-57 fails, go back to `singleTask` and accept RevenueCat's warning. The likely cost there is a cancelled sheet that the SDK syncs on the next foreground, not lost money. Confirm that on the device.
- **Permissions.** Don't add BILLING to `blockedPermissions`. It comes from the Billing Library's own manifest, and `app.json:24-26` lists only SCHEDULE_EXACT_ALARM. After M10, I compare the merged manifest with versionCode 31's. If `AD_ID` appears, block it. An SDK bump once brought it in and Play blocked releases over it ([RC community][rc-community-adid]).
- **Stay on react-native-purchases 10.4.3.** It resolves to Billing Library 8.3.0 (purchases-hybrid-common 18.21.0 → purchases-android 10.13.0), and both reviews confirmed that. It meets Google's 31 Aug 2026 minimum ([Android deprecation FAQ][g-deprec]).

**A4. Android requires an account to buy (Tier 1, money).**
- `client/src/lib/iap.ts:106-117`: add `requireAccount`, true on Android. The signed-out buying path at `:116` exists only because Apple's guideline 5.1.1 forces it. Neither review found a Play equivalent.
- **Why:** a web or iPhone subscriber who opens Android signed out would otherwise be one tap from a second charge. With A2's identity check, every Play purchase carries a user id that deletion can cancel. Reconcile stays as a backstop, not a path we rely on.

**A5. The paywall and the pre-buy guard (Tier 1).**
- **The guard, rebuilt.** Today it refuses only when `fresh.premium` is true (`premium.tsx:158-159`). `purchaseGate` (`iap.ts:107-117`) takes `readOk` and `status`. The store sheet opens only if all of these hold:
  - the entitlement read succeeded
  - `premium` is false
  - `status` isn't `past_due`, `unpaid` or `on_hold`, which gives a new `fix_billing` outcome
  - on Android, RevenueCat's `customerInfo` has no active `premium`, which also catches an Apple subscription on the same account

  Why it matters more now: Android sold through Stripe before Path C (`terms.tsx:53`), so Stripe customers are disproportionately Android users. Path A puts a live buy button in front of every one of them. `fix_billing` shows `paymentAttentionPlain` for Stripe, and for Google a line that opens `managementURL`.
- `premium.tsx:600-610` (footer) and `:612-657` (disclosure block) get Google wording. **The renewal line says "charged every month" (or year) and names Google Play:** "{price} a month, charged to your Google Play account every month until you cancel. Cancel any time in Google Play > Payments & subscriptions." It lives on the paywall itself, because `terms.tsx` is English-only and Play wants localised terms ([Play 9900533][p9900533]).
- The price comes only from `offer.priceString` (`:526-531`). The convert panel (`:350-387`) can't render once IAP is on (`premium-ui.ts:29`). A test pins that.
- The annual plan is never shown most prominently as a monthly cost ([Play 9900533][p9900533]).
- Update the "iOS only" comments at `:68-71`, `:104-105`, `:147-151` and `:523-524`.

**A6. Error outcomes and Restore (Tier 1).**
- `iap.ts:33-67`:
  - Code `'6'` on Play (already owned) gets Google wording, not "This Apple ID" (`en.ts:468`).
  - Codes `'7'` and `'13'` become a new `owned_elsewhere` outcome, for a Google account whose subscription belongs to another DoubleDone account.
- **Restore reads the code.** Today any failure shows the same generic line (`premium.tsx:228-242`), so an "already owned" purchase dead-ends at a failed Restore.
- Drop "nothing was charged" wherever the charge might be real (`en.ts:469`). Google only refunds an unacknowledged purchase after 3 days ([Android integrate][g-integrate]).

**A7. Copy in all five catalogs (Tier 1).**
- Google variants or neutral wording, in en, de, es, fr and it, for:
  - `iapUnavailable`, `purchaseAlreadyOwned`, `purchaseStoreDown`, `restoreNothingFound`
  - `purchasePending` (on Play it's usually a slow payment, not an "approval")
  - `purchaseNotAllowed`: Family Link or parental controls, not Screen Time (`en.ts:470`)
  - `appleRenewalTerms`, `appleStoreNote`, `footAnonymousIap`, `appleManageElsewhere`, `deleteAppleNote` (`en.ts:458-503`, `:755`)
  - A1's price and trial keys
  - new: `fix_billing` and `on_hold` lines, a "couldn't check, nothing was started" line, `owned_elsewhere`, and `deleteAfterBilling`'s Google version (`en.ts:757` says "cancelled", but for Google only renewal is off)
- The `Catalog` type (`en.ts:1267`) fails typecheck if a key is missing, so the real risk is translation quality.
- **German needs a native check** of the renewal and cancel strings. It's still a draft (`de.ts:1`).

**A8. The deletion screen (Tier 1).**
- `client/src/lib/account.ts:87-89`: `billedByApple` becomes `billedByStore`.
- `client/src/app/settings.tsx:663`: a Google subscriber gets one short line saying deletion turns off renewal, and access ends with the period.
- Test: `client/src/lib/account.test.ts:127-141`.

**A9. Legal and cross-store copy (Tier 1).**
- `terms.tsx:47-77`, a Play branch:
  - price "shown in Google Play before you buy", never a figure
  - charged every period, renews until cancelled
  - cancel in Play Store > Payments and subscriptions
  - refunds through Google Play

  Plus a Play refunds paragraph at `:76`.
- **Stale sentences on web and iOS:** "Premium is not sold in the current Android app" at `terms.tsx:54-55` and `client/public/terms.html:91`.
- `client/src/app/privacy.tsx:91-99` and `public/privacy.html:127-130`: add Google Play, and RevenueCat on Android.
- **Retention:** billing records (the D1 entitlement row, `rc_events`, the RevenueCat customer) are kept after deletion for tax and refunds. The policy promises to delete "everything synced" (`privacy.html:167`), so disclose this ([Play 13327111][p13327111]).
- **`manageWhereBought` (`en.ts:503`) becomes cancel-only:** unlinked, support email first, no renew, resubscribe or update-card wording. The allowances for apps that sell nothing no longer apply ([Play 10281818][p10281818]).
- The same edits in `public/terms.html:86-104` and `public/support.html:73-82`.

**A10. Gates and docs (Tier 2).**
- `scripts/check-listings.mjs:24-31,98-107`: keep the bans on currency, price per period, Stripe, web checkout, "buy on the website" and "not Google Play". Relax only the `premium` ban (`:105`) and rewrite the header.
- A unit test that the strings Android renders contain no "dollar", "Dollar", "dólares", "A$" or "17 %".
- `server/src/review-otp.ts:16,146`: accept the second review address. One "latest code" row is enough, since the reviewer uses the accounts one at a time.
- `docs/play-store-release.md`:
  - header (`:15-18`) and §4 (`:108-111`)
  - the sign-in note (`:468-485`)
  - Data safety, §5c item 4 (`:210-215`)
  - §5d becomes history (`:223-277`)
  - the §8 table row (`:335`), the content rating answer (`:517`), the Website tidy-up now required (`:523`)
- `docs/play-store-submission-pack.md:125-133`: the Data safety table.
- `CLAUDE.md`: rewrite the "Android sells NOTHING" gotcha, the inverted-split gotcha and the Android row. Add launchMode and contract-test gotchas.
- `BUILD-PLAN.md`: move Path A out of the Backlog. **Kill the unlinked "Premium is available at doubledone.app" line (`BUILD-PLAN.md:164`) instead of shipping it.** The FAQ allows it only while the app sells nothing ([Play 10281818][p10281818]). This is the discipline of stopping.

**Tests for slice 3:**
- `client/src/lib/iap.test.ts`:
  - Rewrite `:101` (Android has no IAP) and `:107` (buying signed out).
  - Add codes 6, 7 and 13.
  - Gate cases: `readOk` false → refuse, `past_due` and `on_hold` → `fix_billing`.
- `client/src/lib/premium-ui.test.ts`: rewrite `:52` and the Path C block at `:64-82`.
- The contract test and the Android dollar-string test.
- The gates run bare: `npm test`, `npm run typecheck`, `npm run lint`.

### E2E manual cases (`scripts/gen-test-suite.py`, then `python scripts/gen-test-suite.py`, in the same commit as each feature)

**Rewrite these:**
- **PREM-29** (`:875`) flips. The Android AAB now **must** contain `com.android.billingclient`, and it must not contain `AD_ID`.
- **PREM-42, 43, 44** (`:860-868`) change from "sells nothing" to "sells only through Play, with no price text of ours, spoken or shown".
- **PREM-45** (`:869`) stays as the guard that web and iPhone are unchanged.
- Add Android siblings for **DEL-05** (`:556`) and **PREM-18, 23, 24, 25** (`:790-811`).

**New cases** (PREM-46 and DEL-06 are the highest IDs today):

| ID | P | What it proves | Prerequisite |
|---|---|---|---|
| PREM-47 | P1 | The Android paywall shows Play's own prices, "charged every month/year", a Play cancel link and Restore. Never Stripe, never "save 17%". TalkBack reads Play's price | License tester, internal track |
| PREM-48 | P1 | Signed out on Android, no purchase sheet opens. Sign-in comes first | Internal build |
| PREM-49 | P1 | A non-allowlisted tester's purchase shows in `rc_events` as PLAY_STORE and SANDBOX and is refused. An allowlisted tester's is applied, and Scan works | Worker deployed, `SANDBOX_GRANT_UIDS` set |
| PREM-50 | P1 | A real-money purchase by a non-tester writes a D1 row with source `google`, premium on | Second Google account, not comped, A$5, refunded afterwards |
| PREM-51 | P1 | A Google subscriber on the web sees Premium and the "managed in Google Play" line, with no portal and no checkout | PREM-50 |
| PREM-52 | P1 | A Stripe or Apple subscriber on Android, signed in, sees Premium, no buy button, and the cancel-only "billed elsewhere" line | A real Stripe subscriber (Stripe is live, so another A$5 or an existing account) |
| PREM-53 | P1 | On Android, Manage opens the Play Subscription Center. Cancelling keeps Premium to the end of the period | PREM-50 |
| PREM-54 | P1 | Refund and revoke in Play Console removes Premium within 24 hours | PREM-50 |
| PREM-55 | P2 | Buy, then Restore, on a second DoubleDone account with the same Google account shows the calm `owned_elsewhere` line, not a generic failure | PREM-50 |
| PREM-56 | P2 | With Play Billing Lab set to India, then Korea, the price shows in that currency, the symbol draws, and it matches the Play sheet | License tester |
| PREM-57 | P1 | Sharing text and a link into DoubleDone works with the app closed and open. Share from Chrome while DoubleDone is in the background, then open it from the launcher: one instance, and Back returns to Chrome | Internal build |
| PREM-58 | P1 | Signed in with the entitlement read failing (airplane mode after sign-in), Go Premium refuses calmly and opens no sheet | Internal build |
| PREM-59 | P1 | An account in `past_due` or `on_hold` sees "fix your payment", never a buy button | Allowlisted tester on the declining test card |
| PREM-60 | P1 | Review set 2 signs in through the relay, reaches Play's purchase screen and, once purchased, has every feature | Set 2 set up, allowlisted |
| DEL-07 | P1 | Deleting a Google Play subscriber turns off auto-renew in Play, access lasts to the period end, and the confirmation says renewal is off | License tester |

### Decision-log entry

Written with slice 1, because a new source value is a data-model change. Extended when Android is switched on to sell.

> **## 2026-MM-DD: Path A, the Android app sells Premium through Google Play Billing**
>
> **Decided:**
> - Sell through Play Billing via RevenueCat, parity-priced at A$5 / A$50, absorbing Google's cut (15% today, and from 30 Sep 2026 10% plus an unannounced billing fee for Australian buyers). Melroy green-lit this on 2026-09-27, overriding the Backlog trigger: "I need to be elegant."
> - Prices come only from Play's localised `priceString`, including the spoken labels. No fixed discount on Android.
> - The entitlement source gains `google`. A premium-off write never crosses stores.
> - Payment failure maps to `past_due` (grace) and `on_hold` (hold), and both block a new purchase.
> - The buy guard fails closed: an unreadable entitlement refuses, never reads as free.
> - Three compile-time flags (`SELLS_HERE`, `STRIPE_HERE`, `PLAY_COPY`) replace one, held together by a type contract test.
> - Android requires sign-in, and a checked RevenueCat identity, before buying.
> - Deleting an account turns off Play renewal through RevenueCat v1 `cancel`.
> - A named sandbox allowlist, for review and tester accounts only. This corrects the 2026-08-19 "Testers lose nothing" line, which was wrong for server-gated features.
> - MainActivity moves to `singleTop`, with `singleTask` as the fallback decided in advance.
> - Known and accepted: the live iOS app tells a Google subscriber "on us" until its next build. Covered by a support macro.
>
> **Decided against:**
> - One flag, which brings back the A$ text and the Stripe portal that got 1.5.1 rejected.
> - A shared `purchases.native.ts`, which touches the live iOS money path and costs an iOS build.
> - A Play free trial, Pause and Resubscribe.
> - Anonymous purchases on Android.
> - RevenueCat `/revoke` in close-billing, because it refunds.
> - User choice billing now, because it needs Play Billing anyway.
> - Upgrading react-native-purchases, because 10.4.3 already ships Billing Library 8.3.0.
> - Renaming `/apple/reconcile`, because live iOS clients call it.
> - The unlinked "available at doubledone.app" line.
> - Holding the Android launch for an iOS build.

### Tier 3 (after launch) and Tier 4 (skip)

**Tier 3:**
- **iOS copies of the Android fixes, riding the next iOS build:** the identify race, the `readOk` and `fix_billing` gate, the dollar accessibility labels, the Google-subscriber wording (W2), and the fixed A$ text iOS already shows (`welcome.tsx:468`, `terms.tsx:51`).
- A RevenueCat `GET /v1/subscribers` check before any revoke, for the rare account with live subscriptions in two stores. S4's rule covers the realistic cases.
- RevenueCat money alerts for refunds (CANCELLATION with reason CUSTOMER_SUPPORT) and for BILLING_ISSUE. Today `server/src/revenuecat.ts:282-286` only alerts on TRANSFER.
- A drift check in `server/src/monitor.ts` for rows where premium=1, source is apple or google, and `current_period_end` is more than 3 days past.

**Tier 4 (skip):**
- renaming `/apple/reconcile`
- a Play free trial
- upgrading the SDK
- working out the annual saving at runtime from the two store prices
- configuring RevenueCat lazily on Android just to keep a Data safety row "optional"

---

## 4. Dependency order

**House rules, decided in advance:**
- **No Path A build goes to Play until the Path C 1.6.0 review (versionCode 31) is approved.**
- **EAS builds only when you ask, in that exchange.** The plan is **one** build: build it, test it on internal, then promote the same AAB to production. A second build only if testing finds a fix.
- **A Worker deploy, a Worker secret and a push to main each need your OK.** Weekend cadence is fine.
- **No change to the payments profile's address while 1.6.0 is in review.**

**Phase 0, now, while 1.6.0 is in review. Nothing here touches Play review.**
1. You: M1 (check the address). If the answer is no and you can't document a new one, stop.
2. You: M6 → M7 → M8 on day 1. The 36-hour clock is the longest wait you control.
3. You: M2, then M3 → M4 → M5. The bank deposit takes up to 3 business days.
4. Me: step 0 (fast-forward `premium`), then slices 1, 2 and 3 in code on `premium`, with tests green. Plus the read-only D1 checks: `PROMOTIONAL` rows in `rc_events`, and entitlements by source (for the log, not as a gate).

**Phase 1, server and web reading go live (needs your OK, doesn't wait on Play).**
5. Me: cherry-pick slices 1 and 2 onto main.
6. You: M15 (push OK, `SANDBOX_GRANT_UIDS`, deploy).
7. Me: after the deploy, `/account/close-billing` without a token must answer 401. The Worker's catch-all answers 200 to anything, so a 200 proves nothing (see the CLAUDE.md gotcha).

**Gate G1: 1.6.0 approved and live on Play.**

**Phase 2, the release-candidate build.**
8. You: M9 (the key in EAS), then M10 (say yes to the build, upload it to Internal testing). Me: the manifest permission check.
9. You: M11 → M13, then M12 once 36 hours have passed since M8, then M14. Set up review set 2 and its Email Routing rule (M16).
10. Both: the test plan below.

**Gate G2: bank verified (M4), both review accounts sign in, the P1 suite passes.**

**Phase 3, release.**
11. You: the rest of M16, including Managed publishing.
12. Me: final docs, the decision-log extension and the suite regenerated. You: M17 (merge = web deploy, then promote the AAB as a staged rollout and submit).
13. Me: after it's live on Play, bump `android` in `client/public/version.json` by hand (CLAUDE.md rule).

**Phase 4, after launch:** Tier 3 work.

---

## 5. Test plan before release

**The catch to understand first:** a license-tester purchase grants Premium on the server only if that tester's id is on `SANDBOX_GRANT_UIDS`. Everyone else's sandbox purchase is refused, the same as TestFlight today (`server/src/revenuecat.ts:129-132`, `:290-293`). So the production write path has one real-money test. The allowlist lets us watch the full state machine without spending money.

| Area | How | What a pass looks like |
|---|---|---|
| Setup | License testers on the internal track, opt-in URL opened, one Google account on the phone | Products load (if they don't, one of M14's steps was skipped) |
| Webhook reach | M13's filter check, then any tester purchase | The event appears in `rc_events`. If it doesn't, the webhook is still scoped to iOS or to production only |
| Prices | PREM-47 and PREM-56 (India and Korea) | The store's own string, in the local currency, with the symbol drawn, matching the Play sheet. None of our A$ text, shown or spoken |
| Sandbox | PREM-49 both ways, then let the subscription renew (sandbox monthly renews every 5 minutes, up to 6 times, per [Android test][g-test]) | Non-allowlisted: each renewal logged and refused. Allowlisted: applied, and Scan works |
| Payment failure | PREM-59 with an allowlisted tester on Play's declining test card ([Android test][g-test]) | `past_due`, then `on_hold`. "Fix your payment", never a buy button |
| Guard | PREM-58 (read fails), PREM-48 (signed out), PREM-52 (other-store subscribers on Android) | Never a second charge, never a wrong "billed by" line |
| Real money | PREM-50 on the second, non-tester, non-comped account. Mind the internal track's spend limits ([Android test][g-test]) | A D1 row with source `google`, premium on |
| Cross-store | PREM-51, plus a unit-tested refund on a stale Google row while Stripe is live | The live store's Premium survives (`cross-store-kept`) |
| Cancellation | PREM-53 on the real-money account | Premium stays on to the period end, and D1 shows cancelling at period end |
| Owned elsewhere | PREM-55 | The calm line on both Buy and Restore. Record which code actually fired |
| Refund | PREM-54 on the real-money account | Premium off within 24 hours. `rc_events` shows the event (the type isn't documented, so record it) |
| Account deletion | DEL-07 with a license tester | Auto-renew off in the Play Store app, and deletion goes through |
| Reviewer | PREM-60, both sets | Set 1 has every feature. Set 2 reaches Play's purchase screen and gets full Premium after buying |
| Regression | PREM-29 (flipped), PREM-45, PREM-57, then the full P1 suite in `docs/qa/` | Web and iPhone unchanged, sharing into the app still works |

The real-money run costs one A$5 month, which you refund in PREM-54. PREM-52 may cost a second A$5 through Stripe if no existing subscriber account is handy.

---

## 6. Open questions and assumptions

| # | Unknown | Why it matters | How we close it |
|---|---|---|---|
| 1 | Which address the existing profile holds, and whether a virtual office agreement counts as proof | Privacy, and the account itself | M1. Ask the virtual office for a document on Google's list before paying ([Play 13634888][p13634888]) |
| 2 | Google's Australian billing fee from 30 Sep | Margin | Watch the announcement ([Google blog][g-blog]) |
| 3 | Whether A$5.00 typed is exactly what the buyer sees with the tax rate unset | Parity, the 1.5.1 theme | Leave the rate unset ([Play 138000][p138000]), then check the buyer price in M11 |
| 4 | Whether license-tester purchases really arrive as SANDBOX | The test plan | PREM-49. If they arrive as PRODUCTION, a tester gets a real row, which is harmless but noisy |
| 5 | Whether Play reviewers buy with test instruments | Reviewer access | The allowlist and set 2 cover both answers |
| 6 | Whether Play requires buying without an account, like Apple | A4 | Neither review found a rule. If a reviewer objects, fall back to Apple's model plus reconcile |
| 7 | Which event and reason a Play Console "refund and revoke" produces | Refund alerts | Observe it in PREM-54 |
| 8 | Whether license testers still see Resubscribe after it's turned off | Test noise | One reviewer says they always do. Not verified, so note it if seen |
| 9 | Pub/Sub Editor or Admin | M6 | Editor first |
| 10 | How long merchant verification takes | Calendar | Google doesn't publish it |
| 11 | Whether a linked-but-unused Billing Library is enough to unlock Products | M11 | If Products stays locked after the upload, look here first |
| 12 | Where the W-8BEN lives in the profile | US sales | Look again in M5. It doesn't block selling |
| 13 | The A$75k GST threshold (from memory) | Tax | Accountant (M2) |
| 14 | Trial members can't subscribe mid-trial (`premium.tsx:158-161`, `premium-ui.ts:29`) | Product call | My pick: leave it, same as iOS |
| 15 | "Premium bought elsewhere works on Android" while Play also sells | Policy | Allowed per [Play 10281818][p10281818]. Our line stays cancel-only (A9) |
| 16 | An organisation account, which shows a business address, as a way round M1 | Privacy | Not researched. It needs a D-U-N-S number and is a bigger move |
| 17 | EU trader-status rules | Compliance | Not researched |
| 18 | Billing Library 8 is supported until 31 Aug 2027 | A future deadline | Add it to the Backlog with that date as the trigger |
| 19 | The legal drafts (sole trader, no ABN, 7-day refund, Victoria) | Legal | Still waiting on a lawyer, same as today |

---

## Changed after review

**Folded in (I checked each one in the code or docs):**

| Change | From |
|---|---|
| Step 0: fast-forward `premium`. I confirmed it's 77 behind and a straight ancestor | Money 3 |
| The pre-buy guard fails closed (`readOk`, `fix_billing`, RevenueCat check) and `/entitlement` answers 503 on a D1 throw | Money 1 |
| Identity checked before buy and restore, and identify waits for configure | Money 2 |
| Dollar amounts, "save 17%" and spoken prices moved off Android. I confirmed `en.ts:519-541` and the de/es/fr/it copies | Policy 1 |
| Two review accounts, a second relay address and a rewritten note | Policy 2, Money 10 |
| Sandbox allowlist, and the "Testers lose nothing" correction. I confirmed `premium.ts:35-58` against `premium-provider.tsx:69` | Policy 3 |
| M1 rewritten: the profile already exists (your 27 Sep notes), the address needs proof to change, and no changes mid-review. I confirmed [Play 13634888][p13634888] | Policy 4, plus my own find |
| `*Plain` trial copy on Android through a new `PLAY_COPY` flag. I confirmed `premium.tsx:642-653` | Policy 5 |
| The full Data safety set, plus a privacy retention line | Policy 6 |
| Bank verification is a hard release gate | Policy 7 |
| "Charged every month/year" disclosure, on the localised paywall | Policy 8 |
| `manageWhereBought` cancel-only, and the Website field required | Policy 9 |
| Subscription name, benefits and translations | Policy 10 |
| Manifest check for `AD_ID` | Policy 11 |
| Factual fixes: the US program, the ATO contact numbers, the tax-rate note | Policy 12 |
| India and Korea in PREM-56 | Policy 13 |
| Managed publishing and a pre-decided failure path | Policy 14 |
| Cross-store off-writes kept, with a `cross-store-kept` outcome | Money 4 |
| `past_due` and `on_hold` mapping, and `on_hold` blocks buying. I confirmed repurchase during hold in [Android lifecycle][g-lifecycle] | Money 5 |
| Resubscribe and Pause off. Both confirmed in [Android lifecycle][g-lifecycle] | Money 6 |
| Webhook app and environment filter check | Money 7 |
| S5 rewritten: `store_transaction_id` from GET, gate before GET, skip already-cancelled, a two-condition gate, Google copy. I confirmed the cancel path and that GET creates customers in the RC v1 docs | Money 8 |
| False copy to Google subscribers on live apps, promoted from "low" to a knowing, logged acceptance with a support macro | Money 9 |
| Type contract test for the platform-split files. I confirmed `tsconfig.json` has no `moduleSuffixes` | Money 11 |
| launchMode fallback decided in advance, and a harder PREM-57 | Money 12 |
| Code 6 on Play, Restore reads the code, Family Link wording, stale "not sold in Android" sentences | Money 13 |
| Reconcile store table, with `promotional` getting no grant | Money 14 |
| Clock-skew allowance, the speed-up trick timing, PREM-50 and PREM-52 setup, the German native check | Money 15 |
| Backlog trigger removed as a gate (you overrode it on 27 Sep), and the 15% enrolment plus the W-8BEN note from your to-do list | My own find, from your notes |

**Rejected or changed, and why:**
- **Policy 15, "gate reconcile to iOS": rejected.** Money 2 is right that it's the safety net for a missed webhook or an identity slip. With S2's store table it can't grant anything wrong. So the fix is to correct A4's claim, not to remove the call.
- **Policy 14, "keep the versionCode 31 AAB as the rollback": changed.** Play won't give a device a lower versionCode than it already has. The rollback is to halt the staged rollout, deactivate the base plans, and rebuild Path C at a higher versionCode.
- **Policy 1, "work out the saving at runtime": not taken.** Dropping it on Android is less code and can't round wrong. It's on Tier 4.
- **Policy 6, "configure RevenueCat lazily so Device IDs stays Optional": not taken.** Declaring it required is honest and costs nothing. Changing the launch path to protect a form answer is the tail wagging the dog.
- **Policy 3's fallback (a note-only split between the sets): kept as belt and braces**, not as the fix. The allowlist is the fix, and it also repairs the same hole for Apple's reviewer.
- **Money 4, "GET RevenueCat before every revoke": moved to Tier 3.** S4's rule covers every case the review named. The GET only matters for an account with live subscriptions in two stores, which the new buy guard prevents.
- **Money 9, "ship an iOS build before Android goes to production": rejected as a gate.** It puts an Apple review on the critical path for what, at 43 Android installs, is probably zero people in the first weeks. Logged, macro written, fixed on the next iOS build.
- **Money 6, "license testers always see Resubscribe": not verified.** I couldn't confirm it in Google's docs, so it's open question 8, not a step.

**Next move:** open your payments profile and your Play listing, and tell me which address is there. If it's one you're OK with, do M6 to M8 the same day so the 36-hour clock starts, and book the accountant. I start step 0 and slice 1 on `premium` when you say go.

[p7161426]: https://support.google.com/googleplay/android-developer/answer/7161426?hl=en
[p140504]: https://support.google.com/googleplay/android-developer/answer/140504?hl=en
[p13628312]: https://support.google.com/googleplay/android-developer/answer/13628312?hl=en
[p13634888]: https://support.google.com/googleplay/android-developer/answer/13634888?hl=en
[p138000]: https://support.google.com/googleplay/android-developer/answer/138000?hl=en
[p16954621]: https://support.google.com/googleplay/android-developer/answer/16954621?hl=en
[p112622]: https://support.google.com/googleplay/android-developer/answer/112622?hl=en
[p3092739]: https://support.google.com/googleplay/android-developer/answer/3092739?hl=en
[p9306917]: https://support.google.com/googleplay/android-developer/answer/9306917
[p7161440]: https://support.google.com/googleplay/android-developer/answer/7161440?hl=en
[p7161378]: https://support.google.com/googleplay/android-developer/answer/7161378?hl=en
[p7163598]: https://support.google.com/googleplay/android-developer/answer/7163598?hl=en
[p138412]: https://support.google.com/googleplay/android-developer/answer/138412
[p9900533]: https://support.google.com/googleplay/android-developer/answer/9900533?hl=en
[p9858738]: https://support.google.com/googleplay/android-developer/answer/9858738
[p10281818]: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
[p10787469]: https://support.google.com/googleplay/android-developer/answer/10787469
[p13327111]: https://support.google.com/googleplay/android-developer/answer/13327111
[p16497028]: https://support.google.com/googleplay/android-developer/answer/16497028
[p9859455]: https://support.google.com/googleplay/android-developer/answer/9859455?hl=en
[p6062777]: https://support.google.com/googleplay/android-developer/answer/6062777?hl=en
[p13821247]: https://support.google.com/googleplay/android-developer/answer/13821247?hl=en
[g-ready]: https://developer.android.com/google/play/billing/getting-ready
[g-test]: https://developer.android.com/google/play/billing/test
[g-deprec]: https://developer.android.com/google/play/billing/deprecation-faq
[g-integrate]: https://developer.android.com/google/play/billing/integrate
[g-lifecycle]: https://developer.android.com/google/play/billing/lifecycle/subscriptions
[g-blog]: https://android-developers.googleblog.com/2026/06/play-expanded-billing.html
[rc-creds]: https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials
[rc-connect]: https://www.revenuecat.com/docs/projects/connect-a-store
[rc-auth]: https://www.revenuecat.com/docs/projects/authentication
[rc-rtdn]: https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications
[rc-products]: https://www.revenuecat.com/docs/getting-started/entitlements/android-products
[rc-ent]: https://www.revenuecat.com/docs/getting-started/entitlements
[rc-offerings]: https://www.revenuecat.com/docs/offerings/overview
[rc-sandbox]: https://www.revenuecat.com/docs/test-and-launch/sandbox/google-play-store
[rc-rn]: https://www.revenuecat.com/docs/getting-started/installation/reactnative
[rc-webhook]: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
[rc-webhooks]: https://www.revenuecat.com/docs/integrations/webhooks
[rc-flows]: https://www.revenuecat.com/docs/integrations/webhooks/event-flows
[rc-v1cust]: https://www.revenuecat.com/docs/api-v1/customers
[rc-v1tx]: https://www.revenuecat.com/docs/api-v1/transactions
[rc-refunds]: https://www.revenuecat.com/docs/subscription-guidance/refunds
[rc-datasafety]: https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety
[rc-codelab]: https://revenuecat.github.io/codelabs/google-play.html
[rc-community-v1]: https://community.revenuecat.com/third-party-integrations-53/android-subscription-adding-base-plan-id-to-product-id-2710
[rc-community-creds]: https://community.revenuecat.com/general-questions-7/credentials-need-attention-permissions-to-call-subscriptions-api-3880
[rc-community-reviewers]: https://community.revenuecat.com/general-questions-7/how-to-allow-google-play-app-reviewers-to-access-premium-features-of-my-app-without-buying-subscription-4997
[rc-community-adid]: https://community.revenuecat.com/sdks-51/react-native-sdk-7-15-requires-the-com-google-android-gms-permission-ad-id-permission-3921