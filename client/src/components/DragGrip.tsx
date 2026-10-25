import { useEffect, useRef } from 'react';
import { type GestureResponderEvent, Platform, StyleSheet, View } from 'react-native';

import { type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  /** Asked when a touch lands: false while another drag is still settling, so this touch is left alone. */
  canStart: () => boolean;
  /** The drag took: the finger's page y at that moment. */
  onStart: (y: number) => void;
  onMove: (y: number) => void;
  onEnd: (y: number) => void;
  onCancel: () => void;
  /** Phone browsers only: a touch that moved before it armed is a scroll, by this far since it went down. */
  onScrollBy?: (dy: number, first: boolean) => void;
};

/** How long a finger rests on the grip before the drag takes. Well under the card's hold, and on its own surface. */
export const ARM_MS = 150;
/** Movement before the arm that reads as a scroll, not a drag. Kept well under Android's 8dp touch slop, which is
 *  measured from the same touch-down, so the list's lock lands before the list could take the touch. */
const SLOP = 4;

// The grip on a Today row's right edge (decision log 2026-10-25). A mouse picks the row up at once. A finger rests
// for ARM_MS first, and a finger that moves before then is scrolling, so the grip lets the list have it: the right
// edge of the list is where a thumb scrolls, and it must keep scrolling. The list is locked only once the drag has
// taken, while the finger is still, so no scroll can race the lock. The drag follows the finger that took the grip,
// never a second one. A hold anywhere else on the row still opens its card.
//
// Pointer only, on purpose: a screen reader, a keyboard or an unsteady hand moves a task with the card's Move up /
// Move down, which stay, so the grip is hidden from assistive tech (and in the phone apps not drawn at all while a
// screen reader runs; a browser cannot tell).
export function DragGrip({ canStart, onStart, onMove, onEnd, onCancel, onScrollBy }: Props) {
  const styles = useThemedStyles(makeStyles);
  const g = useRef({ id: '', startY: 0, lastY: 0, armed: false, live: false, scrolling: false, timer: null as ReturnType<typeof setTimeout> | null });
  // A grip unmounted mid-drag (on a phone the touch then never reaches it again) must still end its drag, or the row
  // stays lifted and the list locked. The screen keeps the carried row's grip mounted; this is the backstop.
  const cancelLatest = useRef(onCancel);
  useEffect(() => {
    cancelLatest.current = onCancel;
  });
  useEffect(
    () => () => {
      const s = g.current;
      if (s.timer) clearTimeout(s.timer);
      if (s.live && s.armed) cancelLatest.current();
    },
    [],
  );

  // The page y of the touch that took the grip, or null when this event is about another finger.
  function yOf(e: GestureResponderEvent): number | null {
    const n = e.nativeEvent;
    // Compared as strings: React Native types the identifier as a string, the web hands over a number.
    const t = [...(n.touches ?? []), ...(n.changedTouches ?? [])].find((x) => String(x.identifier) === g.current.id);
    return t ? t.pageY : null;
  }
  function stopTimer() {
    if (g.current.timer) clearTimeout(g.current.timer);
    g.current.timer = null;
  }
  function arm() {
    const s = g.current;
    s.timer = null;
    if (!s.live || s.scrolling || s.armed) return;
    s.armed = true;
    onStart(s.lastY);
  }

  return (
    <View
      // Ask at the start only: a press that began elsewhere never becomes a drag by passing over a grip.
      onStartShouldSetResponder={() => canStart()}
      onResponderGrant={(e) => {
        const s = g.current;
        const n = e.nativeEvent;
        s.id = String(n.identifier);
        s.startY = n.pageY;
        s.lastY = n.pageY;
        s.armed = false;
        s.scrolling = false;
        s.live = true;
        const mouse = Platform.OS === 'web' && String((n as { type?: string }).type ?? '').startsWith('mouse');
        if (mouse) arm();
        else s.timer = setTimeout(arm, ARM_MS);
        return false; // never block the native list here: until the drag takes, a moving finger is the list's
      }}
      onResponderMove={(e) => {
        const s = g.current;
        const y = yOf(e);
        if (!s.live || y == null) return;
        s.lastY = y;
        if (s.armed) {
          onMove(y);
          return;
        }
        if (s.scrolling || Math.abs(y - s.startY) > SLOP) {
          stopTimer();
          onScrollBy?.(y - s.startY, !s.scrolling);
          s.scrolling = true;
        }
      }}
      onResponderRelease={(e) => {
        const s = g.current;
        stopTimer();
        if (s.live && s.armed) onEnd(yOf(e) ?? s.lastY);
        s.live = false;
        s.armed = false;
      }}
      // Before the drag takes, a phone app's list may have the touch (that is how it scrolls); after, it may not. A
      // browser never: the grip's touch-action holds the touch, so yielding would leave it with nobody, and the grip
      // scrolls the list itself (onScrollBy) for the whole swipe.
      onResponderTerminationRequest={() => !(g.current.armed || (Platform.OS === 'web' && g.current.live))}
      onResponderTerminate={() => {
        const s = g.current;
        stopTimer();
        if (s.live && s.armed) onCancel();
        s.live = false;
        s.armed = false;
      }}
      style={[styles.grip, Platform.OS === 'web' ? (WEB_GRIP as object) : null]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      aria-hidden
    >
      <View style={styles.dots}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={styles.dotRow}>
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        ))}
      </View>
    </View>
  );
}

// The browser must not pan the page when a touch starts on the grip (the grip scrolls the list itself until the
// drag takes, see onScrollBy), nor select text while it drags.
const WEB_GRIP = { cursor: 'grab', touchAction: 'none', userSelect: 'none' };

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // A 44-wide target the full height of the row, the dots centred in it.
    grip: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
    dots: { gap: 3 },
    dotRow: { flexDirection: 'row', gap: 3 },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: t.colors.inkSoft },
  });
