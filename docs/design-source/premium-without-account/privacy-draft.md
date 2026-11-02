# Privacy policy lines for Premium without an account (DRAFT, for Melroy's approval)

*Drafted 2026-11-03 against the server and the app as built (`server/src/store-premium.ts`, `server/src/purchaser.ts`,
`client/src/lib/ai.ts`, the purchases split), and corrected the same day by the batch's review: the list of refused ids
covers every phone, says how long it is kept and names the block by hand, and there is now one PRV-03 text. Nothing
here is in `client/public/privacy.html` or `client/src/app/privacy.tsx` yet: legal text waits for Melroy's yes. This
file is the copy to work from. A session's scratchpad may hold the same text as `privacy-line.md`.*

## When it ships

**Before the Worker deploy, never after.** From its first RevenueCat delivery that resolves to an account, the new
Worker keeps scrambled anonymous ids in `store_premium_refused`, and the live policy (Last updated 2 November 2026)
says nothing about them. So: Melroy approves, one commit puts sections 1 to 3 on both pages and PRV-03 in the suite,
main is pushed (the web deploy, which carries both pages), and only then is the Worker deployed. The order, with the
checks, is in `docs/operations.md` ("Shipping it, in this order") and at the top of BUILD-PLAN's Now and next.

**The request-log clause assumes PREM-74 passes on the deployed Worker**, that is, the Logs show
`x-purchaser-token: REDACTED` and a search for `RCAnonymousID` finds nothing. If it fails, the iPhone store build that
sends the id does not ship until it passes (`docs/operations.md`), so no real person's id reaches that log and the
clause stays true. Only a decision to ship with the id showing would need the other wording: "...and its request log
(up to a week) can include the id and the network address the request came from."

## 1. A new section, straight after "Payment events", in both copies

**Heading:** Premium without an account

**Body** (as the html copy has it. In privacy.tsx write each apostrophe as `&apos;`, because its Section takes one string):

> On an iPhone or iPad you can buy Premium without signing in. Four Premium features, Scan, Chart a course, Plan my
> day and Reflect on this week, ask our server to check your Premium before they run. When you use one of them
> without an account, the app sends our server the anonymous purchase id that RevenueCat gave this device. It is a
> random code, not your name, email or Apple ID. Our server looks the id up in the store's notices of purchases made
> without an account, which we keep (see Payment events) and which carry that id as the store sends it, and asks
> RevenueCat whether the purchase is active. The check itself keeps only the latest answer, filed under a scrambled
> form of the id that can't be turned back into it and is never tied to an account, and deletes it within two hours
> of the last check. To stop one purchase being overused, it also counts how often that purchase was used in the
> current hour, under the same scrambled form, and deletes that count within two hours (a test purchase made
> through Apple's TestFlight or App Review is also counted for its day, and that count is deleted the next day).
> RevenueCat gives the app such an id on every phone, Android included. Whenever the store's notices show that one
> of these ids belongs to an account, we keep its scrambled form, with no account attached, for as long as we keep
> billing records, so that it works only through that account. We can also block one purchase's scrambled id by
> hand if it is being misused, until we lift the block. We also count how many of these checks ran each day and how
> they came out, as plain numbers. Our hosting provider's short-lived backups (up to 30 days) can hold any of these
> for that long, and its request log (up to a week) can include the network address the request came from. Once you
> sign in, the app stops sending the id and we check your account instead. The Android app and the website never
> send an id for this check.

**Optional to cut:** the parenthesis about test purchases. It is accurate (sandbox purchases get a per-purchase daily
allowance keyed by the scrambled id), but only testers and Apple's reviewers can make one.

## 2. One clause added to "Payment events", in both copies

After the sentence ending "...along with the store's own notice of what happened.", add:

> If you bought on an iPhone or iPad without signing in, there is no account to keep it against, so we keep only
> the store's notices, which carry the anonymous purchase id RevenueCat gave your device, for as long as we keep
> billing records (see Premium without an account).

Without it the two sections contradict each other: "Payment events" says every record is kept against your account.

## 3. Both copies: "Last updated" to the ship date

`privacy.html:59` and `privacy.tsx:25`. The html header asks for both copies, and the Play form, to stay in step. The
Play Data safety form does not change: its "Device or other IDs" row (RevenueCat's install id, Required, for App
functionality and security) already covers the scrambled ids the webhook keeps, and Android never sends an id for
this check.

## 4. PRV-03, ready to paste into scripts/gen-test-suite.py with the privacy commit (after PRV-02)

It belongs to the commit that edits the two privacy pages, not to an app commit, because it fails until then. Its
quote is the body's own words.

```python
    ("PRV-03", "Privacy", "P2", "Both privacy copies describe Premium without an account",
     "Open doubledone.app/privacy, then Settings, Privacy in the app.",
     "Both have a 'Premium without an account' section right after 'Payment events', naming the four server features, the anonymous purchase id RevenueCat gave the device, that the store's notices carry it, 'deletes it within two hours of the last check', the hourly count, that an id the store's notices tie to an account is kept scrambled, Android included, for as long as billing records are, the block by hand, the 30-day backups and the up-to-a-week request log, that signing in replaces it, and that the Android app and the website never send an id for this check. Payment events names a purchase made without an account. Both show the same Last updated date.",
     "iOS + Android + Web"),
```

## 5. docs/ios-submission-prep.md, section 3 (App Privacy), a dated note under the table

> 2026-11 (Premium without an account): a signed-out iPhone's Scan, Chart a course, Plan my day and Reflect on this
> week now send the anonymous RevenueCat purchase id to api.doubledone.app. It is an assigned customer number, so
> Identifiers, User ID (already Yes, Linked, App Functionality) covers it, and whether Premium is active is
> Purchases, Purchase History (already Yes, Linked). Our database keeps the id as RevenueCat sends it only in the
> store's purchase notices (rc_events, as before). The check itself stores only a keyed hash of it, and so does the
> webhook's list of ids that belong to an account. No answer changes. In the Photos or Videos rationale, "the scan
> request carries the sign-in token" becomes "the scan request carries the sign-in token, or for a buyer who has
> not signed in, the anonymous purchase id".

## 6. The app half: no new line

It adds nothing the draft above does not already cover, and nothing the existing "Payment events" text does not.

| Claim in the draft | Where the app makes it true |
|---|---|
| the app sends the anonymous purchase id only without an account | `client/src/lib/ai.ts` `premiumHeaders()`: the session's bearer whenever there is one, the id only without one, never both |
| it is the id RevenueCat gave this device | `client/src/lib/purchases.ios.ts` `purchaserProof()`: `Purchases.getAppUserID()`, passed only in the strict anonymous form (`iap.ts` `anonymousPurchaserId`) |
| once you sign in, the app stops sending it | a signed-in RevenueCat id is the Supabase uuid, which the strict form refuses, and the bearer is sent first anyway |
| the Android app and the website never send an id for this check | `purchaserProof()` is a constant null in `purchases.android.ts` and in the web base `purchases.ts` (tested in `purchases-split.test.ts`) |
| only the four features send it | the header is added only inside `premiumCall` (Scan, Reflect on this week, Chart a course, Plan my day). Scrapbooks, energy matching and the free calls never read the proof (tested in `ai.test.ts`) |
| the app keeps nothing new | the id is never stored by the app or logged: the after-miss note `premium.ai_miss` carries only the feature and the miss, stays on the device's console, and is not on `BEACON_EVENTS` |

Two app behaviours that touch RevenueCat, both already inside "Payment events" ("we use RevenueCat ... to confirm
with Apple or Google Play that a purchase is genuine", "so your subscription can follow your account"):
- After the server refuses a Premium call, the app asks RevenueCat to read the purchase again rather than use its
  cached answer on the device (`localPremium({ fresh: true })`).
- After a Restore while signed in, and once when a signed-in Premium call is refused while the phone's store still
  shows Premium, the app asks our server to attach the store's purchase to the account (`POST /apple/reconcile`, the
  call sign-in already makes).

## Claims against the code

| Claim | Where it is true |
|---|---|
| four features | `requirePremium` callers: `/ocr`, `/lookback-summary`, `/chart`, `/sequence` (`server/src/index.ts`) |
| looks the id up in the store's notices | `STANDING` reads `rc_events` by `app_user_id` (`store-premium.ts`) |
| notices carry the id as the store sends it | `rc_events.app_user_id` (`server/d1/schema.sql`), unchanged |
| latest answer only, scrambled, never tied to an account | `store_premium_cache`, one row per `id_hash` (HMAC-SHA256 under `RC_SECRET_KEY`), no user id |
| deleted within two hours of the last check | a row lives an hour at most (a no, a minute), and the `:00` purge (`purgeStorePremium`) deletes every row past its expiry |
| hourly count under the scrambled form, within two hours | `store_premium_counts` kind `served:<id_hash>`, one slot per hour, purged at the first `:00` after its hour |
| test purchases counted for the day | kind `sandbox:<id_hash>`, one slot per UTC day, purged at the first `:00` of the next UTC day |
| every phone has such an id | both platform files configure RevenueCat with no App User ID at launch, so it starts anonymous (`purchases.ios.ts`, `purchases.android.ts`) |
| an id the notices tie to an account is kept scrambled, no account attached | the webhook calls `refuseForAccount` (`purchaser.ts`) for every verified delivery that resolves to an account, from any store, with every anonymous id it lists (`anonIdsOf`: `app_user_id`, `original_app_user_id`, `aliases`). `store_premium_refused` holds `id_hash`, `why` and `at`, nothing else |
| for as long as we keep billing records | nothing deletes `store_premium_refused` (`purgeStorePremium` touches only the cache and the counts, and `store-premium.test.ts` holds a 400-day-old refusal), the same as `rc_events`, the billing record "Payment events" describes |
| blocked by hand, until lifted | `why = 'blocked'`, added and deleted by hand (`docs/operations.md`, "Blocking one purchase") |
| plain numbers | `premium.store.*` in `app_event_counts`, one count per name per day, and the global `lookup` counts per minute, which name no id |
| backups up to 30 days, request log up to a week | D1 point-in-time recovery and the Worker's request log, in the policy's existing words (the "Feature-usage counts" section) |
| signing in replaces it | `premiumHeaders()` sends the bearer whenever there is a session, and the server then never reads the purchase header (`requirePremium`) |
| Android and the website never send an id for this check | the client's `purchaserProof` is null there (section 6) |
