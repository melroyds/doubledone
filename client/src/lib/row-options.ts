// The keys a task row answers on the web, where react-native-web leaves them unanswered.
//
// The Menu key and Shift+F10 (store 1.9, slice 2, K1). A held task's card is the door to half the app, and RN-web
// never fires onLongPress from a keyboard (PressResponder: "Long press is not supported for keyboards"). The
// platform already has a keyboard twin for a long-press, the one every desktop menu answers: the Menu key, and
// Shift+F10, which is the same thing on a laptop with no Menu key.
//
// Space (the 1 Nov bug sweep, #37). RN-web's PressResponder lets Space press only a button (a <button>, or
// role=button), and a task row is role=checkbox, so Space did nothing on it and scrolled the page instead. Enter
// always worked: the press responder takes Enter on any role. Pure, so it is tested; the web wiring is in
// components/row-door.ts.

/** The fields of a keydown this reads. A React synthetic keyboard event satisfies it. */
export type OptionsKeyEvent = {
  key?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

/** The Menu key, or Shift+F10 with no other modifier (Ctrl+Shift+F10 and friends belong to the browser). */
export function isOptionsKey(e: OptionsKeyEvent): boolean {
  if (e.key === 'ContextMenu') return true;
  return e.key === 'F10' && e.shiftKey === true && !e.ctrlKey && !e.altKey && !e.metaKey;
}

/** The fields of a Space keydown this reads, on top of the key. A React synthetic keyboard event satisfies it. */
export type SpaceKeyEvent = OptionsKeyEvent & {
  repeat?: boolean;
  defaultPrevented?: boolean;
  nativeEvent?: { defaultPrevented?: boolean };
  target?: unknown;
  currentTarget?: unknown;
};

/** The fields of a DOM element this reads. */
type KeyTarget = {
  tagName?: unknown;
  isContentEditable?: unknown;
  getAttribute?: (name: string) => string | null;
};

/** Space or, from an older browser, Spacebar. */
export function isSpaceKey(e: { key?: string }): boolean {
  return e.key === ' ' || e.key === 'Spacebar';
}

/**
 * An element that does its own thing with Space: a text field types it, and a button presses itself. A <button>
 * does that natively, and RN-web's press responder presses a role=button on Space, which is also why a Pressable
 * with accessibilityRole="button" renders as a real <button> on the web.
 */
export function ownsSpace(target: unknown): boolean {
  if (target == null || typeof target !== 'object') return false;
  const el = target as KeyTarget;
  const tag = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return true;
  if (el.isContentEditable === true) return true;
  return typeof el.getAttribute === 'function' && el.getAttribute('role') === 'button';
}

/**
 * What Space does on a row. 'toggle' runs the row's own tap. 'swallow' only keeps the page still: a held Space
 * repeats, and the row is ticked once, never on and off. 'pass' leaves the key alone, to whatever owns it.
 *
 * Passed on: anything but Space, Space with Ctrl, Alt or Meta (those belong to the browser and the system), a
 * Space somebody already answered, a row that is a button (it presses itself, so Space must not press it twice),
 * and a Space typed into something inside the row, a text field above all, which keeps its own.
 */
export function rowSpace(e: SpaceKeyEvent): 'toggle' | 'swallow' | 'pass' {
  if (!isSpaceKey(e)) return 'pass';
  if (e.ctrlKey || e.altKey || e.metaKey) return 'pass';
  if (e.defaultPrevented || e.nativeEvent?.defaultPrevented) return 'pass';
  if (ownsSpace(e.target)) return 'pass';
  if (e.currentTarget != null && e.target !== e.currentTarget) return 'pass';
  return e.repeat ? 'swallow' : 'toggle';
}
