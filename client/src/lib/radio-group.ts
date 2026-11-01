// The keys of a radio group, the WAI-ARIA way (the 1 Nov bug sweep, #37).
//
// Today's Energy pills were radios to a screen reader and three loose tab stops to a keyboard: Space did nothing
// (RN-web's press responder lets Space press only a button), and the arrows did nothing either. A radio group is
// ONE tab stop, the checked radio, and inside it Space picks the focused radio, the arrow keys move the choice,
// picking as they go and wrapping at either end, and Home and End go to the first and the last. Enter stays the
// press responder's, which takes it on any role, so this never answers it. Pure, so it is tested; the web wiring
// is in components/radio-door.ts.

/** The fields of a keydown this reads. A React synthetic keyboard event satisfies it. */
export type RadioKeyEvent = {
  key?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

/**
 * Which radio a key picks, as an index, or null when the key is not the group's. `focused` is the radio the key
 * was pressed on and `count` how many the group holds. Space answers the focused one. Right and Down answer the
 * next, Left and Up the previous, wrapping round. Home answers the first and End the last. A key held with Ctrl,
 * Alt or Meta is the browser's or the system's (Alt+Left is Back), so it is never the group's. Picking moves the
 * focus too, so the radio this returns is also the one to focus.
 */
export function radioKey(e: RadioKeyEvent, focused: number, count: number): number | null {
  if (!Number.isInteger(count) || !Number.isInteger(focused) || count < 1 || focused < 0 || focused >= count) return null;
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case ' ':
    case 'Spacebar':
      return focused;
    case 'ArrowRight':
    case 'ArrowDown':
      return (focused + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (focused - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
