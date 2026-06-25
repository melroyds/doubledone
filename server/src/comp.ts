// Comp allowlist: emails that are ALWAYS premium, with no Stripe subscription. The owner's own
// account, and anyone later granted a free month for feedback (that promo can graduate to a D1-backed
// list; for now the owner lives here in code). The check runs against a CRYPTOGRAPHICALLY VERIFIED
// email on the money gate (requirePremium verifies the token's signature before the email is read), and
// against the decoded email on the entitlement read (cosmetic, since the verified gate is what protects
// paid compute). Case-insensitive, whitespace-tolerant.
const COMP_EMAILS = new Set<string>(['melroyvivekdsouza@gmail.com']);

/** True if the email is on the always-premium comp list. */
export function isCompEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && COMP_EMAILS.has(email.trim().toLowerCase());
}
