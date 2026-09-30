// The Premium panel's primary-control decision, extracted pure so it is TESTED. This exact
// mapping shipped wrong for three weeks (the screen read the URL's ?status= param where the
// ENTITLEMENT status was meant, so trial users saw a Manage button that could only 404 and the
// trial-convert CTA never rendered): nothing exercised the state -> control mapping, because it
// lived inline in the screen and the harness only tests pure lib/ logic. Now it lives here.
//
// The rule this encodes: never render a control whose only outcome is an error.

export type PrimaryAction =
  | 'convert' // the trial's "Go Premium to keep it" (Stripe checkout; the server's guard allows a trial to convert)
  | 'manage' // "Manage subscription": the Stripe portal, or Apple's sheet (manage() routes by source)
  | 'nothing' // premium with nothing to manage (comp/allowlisted: no Stripe customer, no portal exists): a calm line, no button
  | 'none' // no control at all (iOS mid-trial: StoreKit refuses a second purchase while premium, and the trial never auto-charges)
  | 'elsewhere'; // a plain line saying where it is managed, with no button or link (Android sells nothing, so it links to no billing)

/**
 * Which primary control the PREMIUM (entitled) panel renders. `status` is the ENTITLEMENT status
 * from the server ('active' | 'trial' | 'comp' | 'canceled' | ...), never the URL param.
 * - trial: convert via Stripe where that works (the web); on iOS no control, the copy carries it.
 * - comp: nothing to manage, say so calmly (a Manage button here can only 404 the portal).
 * - everything else entitled: manage (portal or Apple's sheet).
 * - where this build sells nothing (Android, `sellsHere` false): the trial has no control (the "Free until"
 *   line carries it, as on iOS), comp keeps its calm line, and a paying member gets `elsewhere`, a plain line
 *   saying where it is managed. Never a Stripe portal or checkout there (Play's Payments policy).
 */
export function premiumPrimaryAction(status: string | null, iapAvailable: boolean, sellsHere = true): PrimaryAction {
  if (status === 'comp') return 'nothing';
  if (!sellsHere) return status === 'trial' ? 'none' : 'elsewhere';
  if (status === 'trial') return iapAvailable ? 'none' : 'convert';
  return 'manage';
}

/**
 * Whether the entitled panel may say "the free monthly scrapbook is always yours, even if you cancel". Only
 * to someone who COULD cancel: a trial and a comp have nothing to cancel, and a subscription already set to
 * end has been cancelled. Saying "if you cancel" to them implies a subscription that is not there (the
 * wording review, 2026-09-27: the comped reviewer account would read it). They get the plain line instead.
 */
export function showsCancelReassurance(status: string | null, cancelAtPeriodEnd: boolean): boolean {
  return status !== 'trial' && status !== 'comp' && !cancelAtPeriodEnd;
}

/** Where the card-free trial offer sits on the paywall, or whether it sits there at all. */
export type TrialSlot = 'inline' | 'separated' | 'hidden';

/**
 * WHERE to put the free month.
 *
 * SIGNED OUT: hidden. `startTrial()` can only answer `sign_in` there, and this file's own rule is
 * that we never render a control whose only outcome is an error. (It was already effectively hidden,
 * gated on `session`; this states the reason rather than leaving it as a bare condition.)
 *
 * ON iOS: SEPARATED, not removed. It sat twelve pixels under the "Go Premium" button, painted in the
 * same accent, with copy opening "Or", which only parses as an alternative to whatever is directly
 * above it. Beside a control that takes real money instantly, that adjacency is a trap worth
 * removing. Hiding it altogether was the other option and is worse: it relocates a genuinely free
 * offer to somewhere an iPhone-only user would never look, and creates a platform difference we
 * could not explain kindly to anyone who asked.
 *
 * ELSEWHERE: inline, unchanged. Nothing on that screen can charge anyone without a Stripe redirect,
 * so there is no adjacency to fix.
 *
 * Honest about its own limits: no evidence ties this layout to any real charge. It is a UX defect
 * on its own merits, not a proven cause. See the decision log for the hypothesis and why it stayed
 * one.
 */
export function trialSlot(s: { signedIn: boolean; iapAvailable: boolean }): TrialSlot {
  if (!s.signedIn) return 'hidden';
  return s.iapAvailable ? 'separated' : 'inline';
}

/** Where "Manage subscription" goes, by the store that sold it and the platform this is running on. */
export type ManageRoute =
  | 'apple-sheet' // on an iPhone: Apple's own Manage Subscriptions sheet
  | 'apple-elsewhere' // an Apple subscription seen anywhere else: say where it lives, no link
  | 'google-play' // on Android: the Play Store's subscriptions page
  | 'google-elsewhere' // a Google subscription seen anywhere else: say where it lives, no link
  | 'stripe-portal'; // everything Stripe (and a pre-2026-07 row, which is always Stripe)

/**
 * Which way Manage goes. Each store's subscription can only be managed in that store's own screen, so
 * the button opens it where it CAN open and says where it lives everywhere else. Until Path A, a Google
 * subscriber seen on the web fell through to Stripe's portal, which found no customer and answered
 * "Your Premium is on us": false, to someone who pays. `platform` is Platform.OS.
 */
export function manageRoute(source: 'stripe' | 'apple' | 'google' | null, platform: string): ManageRoute {
  if (source === 'apple') return platform === 'ios' ? 'apple-sheet' : 'apple-elsewhere';
  if (source === 'google') return platform === 'android' ? 'google-play' : 'google-elsewhere';
  return 'stripe-portal';
}
