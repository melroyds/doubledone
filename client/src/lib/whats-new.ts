// What's New: content-keyed, never build-keyed (decided with Melroy 2026-08-01). The id bumps
// only when there is something worth TELLING, so a plumbing release never interrupts anyone,
// web (which has no build number) works identically to the stores, and one mechanism serves
// all three surfaces. The card renders once per id as a calm dismissible note at the top of
// Today (the hold-hint coachmark's shape), NEVER a modal: a launch popup would steal the very
// open-the-app-to-dump-a-thought moment the capture redesign protects.

/** The current announcement. Bump `id` and swap the keys when something new is worth telling;
 *  the four catalogs carry the words. */
export const WHATS_NEW = {
  id: 1,
  titleKey: 'whatsnew.title',
  lineKeys: ['whatsnew.line1', 'whatsnew.line2'],
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
