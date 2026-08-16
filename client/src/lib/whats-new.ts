// What's New: content-keyed, never build-keyed (decided with Melroy 2026-08-01). The id bumps
// only when there is something worth TELLING, so a plumbing release never interrupts anyone,
// web (which has no build number) works identically to the stores, and one mechanism serves
// all three surfaces. The card renders once per id as a calm dismissible note at the top of
// Today (the hold-hint coachmark's shape), NEVER a modal: a launch popup would steal the very
// open-the-app-to-dump-a-thought moment the capture redesign protects.

/** The current announcement. Bump `id` and swap the keys when something new is worth telling;
 *  the four catalogs carry the words.
 *
 * id 2 is Ours, and it takes FOUR lines where every announcement before it took two. That is not
 * drift, it is the difference between a change and a surface. Two lines suit "Settle moved" or
 * "annual is selectable now"; Ours is a new room with a rule that a reader must be told, because
 * the rule is the reason it is safe. The four are ordered so that stopping early still leaves you
 * with something true: what it is, why it cannot turn into a scoreboard, why it cannot make your
 * day heavier, and where to find it.
 *
 * The last line exists because the card reaches EVERY existing device while `ours_is_open` still
 * gates the Menu row per account. Without it, a reader outside the allowlist is told about a door
 * that is not on their screen, which is the one thing a What's New card must never do. It names
 * the rollout without ranking anybody: no queue, no waitlist, no place in line. When the allowlist
 * drops and the RPC answers true for everyone, that line is the only one that needs retiring, and
 * retiring it does NOT justify bumping the id (nobody needs re-telling).
 */
export const WHATS_NEW = {
  id: 2,
  titleKey: 'whatsnew.title',
  lineKeys: ['whatsnew.line1', 'whatsnew.line2', 'whatsnew.line3', 'whatsnew.line4'],
} as const;

/**
 * Whether the card shows. A fresh install never sees it (their whole app is new; onboarding
 * stamps the current id on completion), an existing device with no record predates the
 * feature and sees the current announcement once, and a device that has seen this id never
 * sees it again.
 */
export function shouldShowWhatsNew(seen: number | null, onboarded: boolean): boolean {
  if (!onboarded) return false;
  return seen == null || seen < WHATS_NEW.id;
}
