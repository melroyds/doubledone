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
  | 'none'; // no control at all (iOS mid-trial: StoreKit refuses a second purchase while premium, and the trial never auto-charges)

/**
 * Which primary control the PREMIUM (entitled) panel renders. `status` is the ENTITLEMENT status
 * from the server ('active' | 'trial' | 'comp' | 'canceled' | ...), never the URL param.
 * - trial: convert via Stripe where that works (web/Android); on iOS no control, the copy carries it.
 * - comp: nothing to manage, say so calmly (a Manage button here can only 404 the portal).
 * - everything else entitled: manage (portal or Apple's sheet).
 */
export function premiumPrimaryAction(status: string | null, iapAvailable: boolean): PrimaryAction {
  if (status === 'trial') return iapAvailable ? 'none' : 'convert';
  if (status === 'comp') return 'nothing';
  return 'manage';
}
