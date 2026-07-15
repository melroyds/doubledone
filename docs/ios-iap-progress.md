# iOS In-App Purchase, where we are

*Live progress note so nobody has to remember the state. Started 2026-07-15.*

## Decisions locked
- **Ship Apple IAP from iOS v1** (not the hide-everything path). Melroy: "15% of 0 is 0, I want a path to convert iOS users."
- **Parity pricing** on iOS (absorb Apple's 15%): monthly ~A$4.99, annual ~A$49.99, matching the Stripe price.
- **Sign in at the point of purchase** (not before), so the entitlement follows the user across web/Android/iOS. Everything else stays anonymous-first.
- Architecture (RevenueCat Path C): RevenueCat is **iOS StoreKit plumbing only**. Stripe stays the source of truth. A RevenueCat webhook writes Apple purchases into the existing D1 `entitlements` table. App User ID = Supabase user id.

## Done
- **Apple:** Paid Apps agreement, tax (ABN + GST + W-8BEN), banking, all Active. Small Business Program enrolled (15%), awaiting approval (blocks nothing).
- **App Store Connect subscription products created:** `app.doubledone.premium.monthly` and `app.doubledone.premium.annual`. Promo image done (docs/doubledone-premium-1024.png).
- **RevenueCat: FULLY SET UP (2026-07-15).** Project `DoubleDone`; iOS app (bundle `app.doubledone`); App Store connected (In-App Purchase key + App Store Connect API key + vendor number `94342932`); entitlement **`premium`**; both products (`app.doubledone.premium.monthly` / `.annual`, showing "Missing Metadata" which is normal until App Store review, both attached to `premium`); offering **`default`** ("DoubleDone Premium") with a `$rc_monthly` package -> Premium Monthly and a `$rc_annual` package -> Premium Annual, set current.
- **RevenueCat iOS SDK key captured** in `.env` as `EXPO_PUBLIC_RC_IOS_KEY` (the public `appl_…` key; placeholder in `.env.example`).

## Melroy's dashboard tasks: ALL DONE. From here it is code (Claude).

## Left for Claude (the code)
- `react-native-purchases` SDK in the client; App User ID = Supabase id; iOS paywall showing the two products + a "sign in to restore" path for existing Stripe subscribers.
- Worker route: RevenueCat webhook -> write Apple-sourced Premium into the D1 `entitlements` table (reuse the Stripe entitlement path).
- ~~Fix the tap-and-hold text-selection bug~~ **DONE 2026-07-15.** It was the iOS WEB app (Safari / home-screen PWA), not native, native RN `<Text>` is non-selectable by default, so the loupe + Copy callout only ever fired on iOS Safari's long-press. Fixed in `client/src/global.css` with app-wide `user-select: none` + `-webkit-touch-callout: none`, re-enabled on inputs/textareas so the capture box still works. Web-only change, deploys on push; Melroy to confirm on his iPhone's Safari/PWA.
- App Privacy labels, review notes (draft already written), and the demo-account/OTP-for-reviewers solve (Supabase test OTP, the one real unknown).
- Then a dev build for sandbox testing, screenshots, submit for review. **EAS build only on Melroy's explicit ask.**
