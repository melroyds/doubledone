// The Menu pill's spoken label (the Menu doors handoff, 2026-09-30). It names every destination on the
// Menu page, in PAGE order, each once: Settings first, because it sits second on the page, straight after
// the way back; Chart a course only with AI on; Ours only when its card shows; Premium last. The old
// labels were hand-written per language and put Settings LAST, the one place it is not.
//
// Built by joining the catalogue's own titles, never as a hand-written list per language, so a room that
// is renamed in one place can never leave a stale word in the pill.

import { t } from './i18n-active';

export function menuPillLabel(opts: { ai: boolean; ours: boolean }): string {
  const rooms = [
    t('settings.title'),
    t('lookback.title'),
    t('routines.title'),
    t('repeat.title'),
    ...(opts.ours ? [t('ours.defaultName')] : []),
    ...(opts.ai ? [t('actions.chartACourse')] : []),
    t('common.premium'),
  ];
  // Soft hyphens are for the eye (a long German word breaking at a syllable); a screen reader gets none.
  return t('today.menuA11yList', { rooms: rooms.join(', ') }).replace(/\u00AD/g, '');
}
