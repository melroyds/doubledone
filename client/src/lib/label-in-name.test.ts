import { describe, expect, it } from 'vitest';

import { ordinalDay, SUPPORTED, translate } from './i18n';

// Label in name (WCAG 2.5.3, bug sweep 2026-11-01 #34). Voice Control and Voice Access find a button by the words
// on it, so its spoken name must START with those words, in every language. Until the copy batch, "Mark as a lot"
// spoke "Mark this task as a lot", "Skip today" spoke "Remove today's instance of", and most of the other four
// languages did the same in their own words, so saying what you could see pressed nothing. Each row is a control
// whose name this batch rewrote: [the visible words' key, the spoken name's key, the name's placeholders].

type Row = [visible: string, name: string, params?: Record<string, string | number>];
const title = 'Call the bank';

const HELD_CARD: Row[] = [
  ['actions.makeItTiny', 'today.makeTinyLabel', { title }],
  ['today.moveTo', 'today.moveOneA11y', { title }],
  ['today.markAsALot', 'today.markBigOneA11y', { title }],
  ['today.markAsALot', 'today.unmarkBigOneA11y', { title }], // still shows "Mark as a lot", with a ✓
  ['today.selectMore', 'today.selectMoreA11y'],
  ['repeat.skipToday', 'repeat.skipTodayA11y', { title }],
  ['today.pinnedTick', 'today.unpinA11y'],
  ['today.more', 'today.moreCollapseA11y'],
  ['today.moveUp', 'today.moveUpA11y', { title }],
  ['today.moveDown', 'today.moveDownA11y', { title }],
  ['today.doneOn', 'today.doneOnA11y', { title }],
  // The count beside a stepped title shows "2 / 5" and is said "2 of 5", which is today.stepsOf.
  ['today.stepsOf', 'today.changeStepsA11y', { done: 2, total: 5 }],
  ['leftOff.placeholder', 'leftOff.addA11y'],
  ['breakdown.breakDown', 'breakdown.breakDownTaskLabel', { title }],
  ['reminders.remindMe', 'reminders.remindMeA11y'],
];

const HELD_ROW: Row[] = [['today.holdStrip', 'today.holdStripA11y', { title }]];

const SELECT_BAR: Row[] = [
  ['common.done', 'today.markSelectedDoneA11y'],
  ['today.moveTo', 'today.moveSelectedA11y'],
  ['today.markAsALot', 'today.markBigA11y'],
  ['today.markAsALotMany', 'today.markBigManyA11y'],
  ['today.notALot', 'today.unmarkBigA11y'],
  ['today.notALotMany', 'today.unmarkBigManyA11y'],
  ['common.remove', 'today.removeCountA11yOne'],
  ['common.remove', 'today.removeCountA11yOther', { count: 2 }],
  ['today.selectAll', 'today.selectAllA11y'],
];

const PAYWALL: Row[] = [
  ['premium.goPremium', 'premium.subscribeMonthlyA11y'],
  ['premium.goPremium', 'premium.subscribeAnnualA11y'],
  ['premium.goPremium', 'premium.subscribeMonthlyStoreA11y', { price: '4,99 €' }],
  ['premium.goPremium', 'premium.subscribeAnnualStoreA11y', { price: '49,99 €' }],
  ['premium.goPremiumKeepIt', 'premium.goPremiumKeepItA11y'],
  ['premium.manageSubscription', 'premium.manageSubscriptionA11y'],
  ['premium.paymentAttentionLink', 'premium.paymentAttentionLinkA11y'],
  ['premium.restorePurchases', 'premium.restorePurchasesA11y'],
  ['premium.termsLink', 'premium.termsLinkA11y'],
  // The store block's privacy link and Android's Google Play link (the 2 Nov read, #34): each name used to open
  // with a verb ("Read the privacy policy", "Open your subscriptions..."), so "Tap Privacy policy" pressed nothing.
  ['premium.privacyLink', 'premium.privacyLinkA11y'],
  ['premium.googleSubscriptionsLink', 'premium.googleSubscriptionsLinkA11y'],
  ['premium.billedViaStripe', 'premium.billedViaStripeA11y'],
  ['premium.trialLink', 'premium.trialLinkA11y'],
  ['premium.trialLinkPlain', 'premium.trialLinkPlainA11y'],
];

const WELCOME: Row[] = [['welcome.sortMyself', 'welcome.sortMyselfA11y']];

/**
 * The words as a voice command hears them: lower case, soft hyphens gone, apostrophes and hyphens closed up (both
 * kinds, so "I’m" and "I'm" agree), and every other mark, the arrows, the ellipsis, ✓ and › included, read as a gap.
 */
function heard(s: string): string {
  return s
    .toLowerCase()
    .replace(/­/g, '')
    .replace(/['’-]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const startsWithWords = (name: string, visible: string) => name === visible || name.startsWith(visible + ' ');

const GROUPS: [string, Row[]][] = [
  ['the held card', HELD_CARD],
  ['the held row', HELD_ROW],
  ['the select bar', SELECT_BAR],
  ['the paywall', PAYWALL],
  ['the welcome', WELCOME],
];

describe('label in name: every spoken name starts with the words on its control', () => {
  for (const [group, rows] of GROUPS) {
    for (const loc of SUPPORTED) {
      it(`${group}, ${loc}`, () => {
        const wrong: string[] = [];
        for (const [visibleKey, nameKey, params] of rows) {
          const visible = heard(translate(loc, visibleKey, params));
          const name = heard(translate(loc, nameKey, params));
          if (!visible || !startsWithWords(name, visible)) wrong.push(`${nameKey}: "${name}" does not start with "${visible}"`);
          // An unfilled placeholder would be spoken as braces: the call site must pass every one.
          expect(translate(loc, nameKey, params), `${loc} ${nameKey}`).not.toMatch(/\{\w+\}/);
        }
        expect(wrong).toEqual([]);
      });
    }
  }

  it('hears a name the way a voice command does', () => {
    expect(heard('↑ Move up')).toBe('move up');
    expect(heard('Done on…')).toBe('done on');
    expect(heard('Pinned ✓')).toBe('pinned');
    expect(heard('Billed securely via Stripe. Terms and refunds ›')).toBe('billed securely via stripe terms and refunds');
    expect(heard('I’m holding this one')).toBe(heard("I'm holding this one"));
    expect(heard('Marquer comme gros morceau : x')).toBe('marquer comme gros morceau x');
  });

  it('a name that only shares a first word with its label is not a match', () => {
    expect(startsWithWords(heard('Doneness of the task'), heard('Done'))).toBe(false);
    expect(startsWithWords(heard('Mark this task as a lot'), heard('Mark as a lot'))).toBe(false);
  });
});

// The Monthly grid's chips, in the add panel and the When sheet (the 2 Nov read, #34). Each shows a bare number,
// the same in every language, so the visible words are the number itself, not a key. The name used to be only the
// sentence ("Repeat on the 15th of each month"), so "Tap 15" pressed nothing. Now the number comes first, exactly
// as the chip shows it, and the sentence follows for a screen reader.
describe('label in name: every month-day chip starts with its own number', () => {
  for (const loc of SUPPORTED) {
    it(`days 1 to 31, ${loc}`, () => {
      const wrong: string[] = [];
      for (let d = 1; d <= 31; d++) {
        const said = translate(loc, 'capture.repeatOnMonthDayA11y', { n: d, day: ordinalDay(loc, d) });
        if (!startsWithWords(heard(said), heard(String(d)))) wrong.push(`day ${d}: "${heard(said)}" does not start with "${d}"`);
        // Both placeholders are filled at the call site, so no brace is ever spoken.
        expect(said, `${loc} day ${d}`).not.toMatch(/\{\w+\}/);
      }
      expect(wrong).toEqual([]);
    });
  }

  it('the number is heard as a word of its own, so day 1 is never taken for day 15', () => {
    expect(startsWithWords(heard('15, repeat on the 15th of each month'), heard('1'))).toBe(false);
    expect(startsWithWords(heard('1, repeat on the 1st of each month'), heard('1'))).toBe(true);
  });
});
