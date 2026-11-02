import { Platform } from 'react-native';

// Relative, not '@/lib/…': vitest does not read tsconfig's paths, and radio-door.test.ts loads this file.
import { radioKey, type RadioKeyEvent } from '../lib/radio-group';
import { isSpaceKey, ownsSpace } from '../lib/row-options';

// A radio group's keyboard on the web (the 1 Nov bug sweep, #37), for Today's Energy pills and the welcome's
// finished-tasks choice.
//
// They were already a radiogroup of radios to a screen reader, on every platform. On the web they were also
// separate tab stops that ignored Space and the arrows, because RN-web's press responder lets Space press
// only a button. The keys themselves are decided in lib/radio-group.ts. Web only: native has no Tab order to
// rove, and its roles and announcements stay exactly as they were.

type RadioEvent = RadioKeyEvent & {
  repeat?: boolean;
  defaultPrevented?: boolean;
  nativeEvent?: { defaultPrevented?: boolean };
  target?: unknown;
  currentTarget?: unknown;
  preventDefault: () => void;
};

type RadioNode = { focus?: () => void };
type GroupNode = { querySelectorAll?: (selector: string) => ArrayLike<RadioNode | undefined> };
type FromNode = { closest?: (selector: string) => GroupNode | null };

// The radios of the group the key was pressed in, in the order they are drawn, which is the order of `index`.
// The roles are the contract here, the same ones a screen reader reads.
function focusRadio(from: unknown, index: number) {
  const group = (from as FromNode | null | undefined)?.closest?.('[role="radiogroup"]');
  group?.querySelectorAll?.('[role="radio"]')[index]?.focus?.();
}

/**
 * Spread onto each radio of a group, in order: `{...radioDoor(i, count, checked, pick)}`. `pick(i)` must do
 * exactly what a tap on radio i does.
 *
 * The web gets one tab stop for the whole group, the checked radio (a roving tabindex), so Tab lands on the
 * choice and the next Tab leaves the group. Inside it, Space picks the focused radio, and the arrows, Home and
 * End move the choice and the focus together. Enter is left to the press responder, which presses any role on
 * Enter, so nothing is ever picked twice. A held Space picks once: its repeats only keep the page still, since a
 * pick can do more than choose (the welcome's records the choice). A held arrow keeps moving, as it should.
 *
 * Only the checked radio is a tab stop, so a group must always have one checked, or Tab could never reach it.
 */
export function radioDoor(index: number, count: number, checked: boolean, pick: (i: number) => void): object {
  if (Platform.OS !== 'web') return {};
  return {
    tabIndex: checked ? 0 : -1,
    onKeyDown: (e: RadioEvent) => {
      const next = radioKey(e, index, count);
      if (next == null) return;
      // Already answered, a key typed into something inside the radio, or a radio that presses itself on Space
      // (a button would): each is left alone, so one key never picks twice.
      if (e.defaultPrevented || e.nativeEvent?.defaultPrevented) return;
      if (e.currentTarget != null && e.target !== e.currentTarget) return;
      if (isSpaceKey(e) && ownsSpace(e.target)) return;
      e.preventDefault(); // Space and the arrows would otherwise scroll the page
      if (e.repeat === true && isSpaceKey(e)) return;
      pick(next);
      if (next !== index) focusRadio(e.currentTarget, next);
    },
  };
}
