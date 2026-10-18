// What THIS build may sell, and how it may talk about it, resolved at compile time per platform. The base
// file is web and iOS. `storefront.android.ts` overrides it for the Android build. Three switches, because
// one switch answered two questions at once and that is how an A$ price came back on Android:
//
// - SELLS_HERE: may this build sell Premium at all. True everywhere since Path A (Android sells through
//   Google Play Billing). It stays a switch on purpose: setting it false in storefront.android.ts is the
//   pre-decided Path C rollback (no price, no buy button, the card-free month only), and every Path C
//   branch it guards is kept for exactly that day. It also hides the store's buy button (premium.tsx reads
//   `IAP_AVAILABLE && SELLS_HERE`), so the lever is one line.
// - STRIPE_HERE: may this build show Stripe (checkout, the billing portal, the dunning link) and OUR OWN
//   fixed figures (A$5, A$50, "save 17%" as a sum we worked out). Web and iOS yes. Android never: Play's
//   Payments policy forbids leading an Android user to any payment method but Play Billing, and its
//   Subscriptions policy rejected 1.5.1 for a fixed A$ price shown to a reviewer abroad. A PRICE of ours
//   (A$5, A$50) also needs a build where no store sells, which is the web alone (`!IAP_AVAILABLE`): a store
//   build prices from the store's own string, so an iPhone shows Apple's price and never our A$5 (Melroy's
//   call, 2026-10-19, `welcomeFineKey` in lib/premium-ui). "save 17%" is the one figure iOS keeps (Path A).
// - PLAY_COPY: say it the way Google Play needs. Android only. Store names, the renewal line, the trial
//   wording that is not a Play trial, and prices that come ONLY from Play's own localised string.
//
// No react-native import on purpose: this is read by pure, node-tested logic too. Metro picks the
// `.android.ts` file on Android, the same way it picks `purchases.ios.ts` on iOS. Every export here must
// exist, with the same type, in storefront.android.ts: `platform-split.contract.ts` fails the typecheck
// if they drift, because tsc only ever reads THIS file.
export const SELLS_HERE: boolean = true;
export const STRIPE_HERE: boolean = true;
export const PLAY_COPY: boolean = false;
