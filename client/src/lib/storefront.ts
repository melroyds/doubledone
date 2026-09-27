// Whether THIS build may sell Premium, resolved at compile time per platform. The base file is web and
// iOS: the web sells through Stripe, iOS through Apple (lib/purchases.ios.ts). `storefront.android.ts`
// overrides it for the Android build, which sells nothing (Path C, 2026-09-27): Google Play's Payments
// policy forbids leading an Android user to any payment method but Play Billing, and its Subscriptions
// policy rejected 1.5.1 for showing an Australian-dollar price to a reviewer abroad. So on Android there
// is no price, no purchase control, no Stripe checkout or portal, and no call to action to buy anywhere.
// Premium bought on the web or an iPhone still works there once you sign in, and the card-free month
// (which takes no payment) is still offered.
//
// No react-native import on purpose: this is read by pure, node-tested logic too. Metro picks the
// `.android.ts` file on Android, the same way it picks `purchases.ios.ts` on iOS.
export const SELLS_HERE = true;
