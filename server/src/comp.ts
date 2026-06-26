// Comp allowlist: emails that are ALWAYS premium, with no Stripe subscription. The owner's own account, and
// anyone later granted a free month for feedback. The list lives in the COMP_EMAILS Worker SECRET
// (comma-separated), NOT in source, so no personal address is committed to the public repo. The check runs
// against a CRYPTOGRAPHICALLY VERIFIED email on the money gate (requirePremium verifies the token's signature
// before the email is read), and against the decoded email on the entitlement read (cosmetic, since the
// verified gate is what protects paid compute). Case-insensitive, whitespace-tolerant.

/**
 * True if `email` is on the always-premium comp list. The list is the `COMP_EMAILS` secret, a comma-separated
 * string (unset or empty = no comps). Pass `env.COMP_EMAILS` from a handler that has env.
 */
export function isCompEmail(email: string | null | undefined, compEmails: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const allow = new Set((compEmails ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  return allow.has(email.trim().toLowerCase());
}
