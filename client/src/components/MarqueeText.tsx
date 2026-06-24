import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { useReducedMotion } from '@/lib/theme-provider';

// A calm marquee for a task title that does not fit its row. It scrolls ONLY when
// the text actually overflows, and ONLY when the user has not asked for reduced
// motion (autistic / motion-sensitive users get a gentle wrapped fallback, never
// forced movement). Cross-platform via Animated, no third-party dependency.
//
// Measurement reads the nodes directly in an effect (refs are compiler-safe in an
// effect, unlike onLayout, which proved unreliable in this RN-web build). A wide
// out-of-flow copy gives the text's natural single-line width to compare against
// the row width.
//
// Why these numbers: slow speed and a pause at the top of each loop keep it
// readable and unhurried, in keeping with the never-overwhelm spine. If a row of
// scrolling titles ever feels busy, the calm next step is to animate only the
// pressed/hovered row; today it animates any overflowing title.

const GAP = 48; // gap between the two looping copies (seamless reset)
const SPEED = 35; // px per second, deliberately slow
const PAUSE = 1200; // ms held at the start of each loop so the title reads first

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  // Re-measure when the row's layout changes without the text changing: a reminder bell
  // appearing, or entering select mode where the row re-renders into a different shape.
  // The imperative measure only re-runs when this key (or the text) changes.
  measureKey?: string | number;
};

export function MarqueeText({ text, style, measureKey }: Props) {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const [tx] = useState(() => new Animated.Value(0)); // useState, not useRef: ref reads in render trip the compiler lint
  const reduced = useReducedMotion();
  const containerRef = useRef<View>(null);
  const measureRef = useRef<Text>(null);

  const overflow = containerW > 0 && textW > containerW + 1; // +1 avoids jitter at an exact fit
  const scrolling = overflow && !reduced;

  // Measure now, then retry on a few bounded delays. A native measure() can return 0
  // right after a (re)mount (e.g. a row re-mounting when you leave multi-select), which
  // left the marquee static. measureWidth ignores zero, so the retries only ever SET a
  // real width, and re-setting the same value is a no-op (no re-render, so the running
  // animation is never restarted). Bounded on purpose: a continuous onLayout re-measure
  // thrashed the animation and killed scrolling entirely.
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (cancelled) return;
      measureWidth(containerRef.current, setContainerW);
      measureWidth(measureRef.current, setTextW);
    };
    read();
    const timers = [50, 150, 400, 800].map((ms) => setTimeout(read, ms));
    const stopTimers = () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('resize', read);
      return () => {
        stopTimers();
        window.removeEventListener('resize', read);
      };
    }
    return stopTimers;
  }, [text, measureKey]);

  useEffect(() => {
    if (!scrolling) {
      tx.setValue(0);
      return;
    }
    const distance = textW + GAP;
    const duration = (distance / SPEED) * 1000;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(PAUSE),
        // Native driver runs translateX on the UI thread on device; web has no
        // native animated module, so drive it from JS there (avoids a warning).
        Animated.timing(tx, {
          toValue: -distance,
          duration,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      tx.setValue(0);
    };
  }, [scrolling, textW, tx]);

  return (
    <View ref={containerRef} style={styles.clip}>
      {/* Measuring copy, out of flow: a very wide wrapper lets the text reach its
          natural single-line width (RN-web caps a numberOfLines text at 100%). */}
      <View
        style={styles.measureWrap}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text ref={measureRef} style={[style, styles.noShrink]}>
          {text}
        </Text>
      </View>

      {scrolling ? (
        // The scrolling train is ABSOLUTE so its (deliberately huge) two-copy width never
        // feeds back into the clip's own width. On Android a long in-flow train competing
        // with a sibling (a reminder bell) could collapse the clip to zero, taking the
        // title with it. Out of flow, the clip keeps its flex width. A zero-content spacer
        // gives the clip its line height, since the absolute train contributes none.
        // At -(width+gap) the second copy sits where the first began, a seamless reset.
        <>
          <Text style={[style, styles.sizer]}>{' '}</Text>
          <Animated.View style={[styles.train, { transform: [{ translateX: tx }] }]}>
            <Text style={[style, styles.noShrink]}>{text}</Text>
            <View style={{ width: GAP }} />
            <Text
              style={[style, styles.noShrink]}
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {text}
            </Text>
          </Animated.View>
        </>
      ) : (
        // Fits, or reduced motion: a single line when it fits, a gentle wrap when
        // reduced motion is on and it would otherwise overflow.
        <Text numberOfLines={reduced ? undefined : 1} style={style}>
          {text}
        </Text>
      )}
    </View>
  );
}

// Read a host node's rendered width, cross-platform. On web an RN ref is the DOM
// node (getBoundingClientRect); on native it exposes measure(). Zero widths (not
// yet laid out) are ignored so we never flip to a wrong decision.
function measureWidth(node: unknown, set: (w: number) => void): void {
  if (!node) return;
  const dom = node as { getBoundingClientRect?: () => { width: number } };
  if (typeof dom.getBoundingClientRect === 'function') {
    const w = dom.getBoundingClientRect().width;
    if (w) set(w);
    return;
  }
  const native = node as { measure?: (cb: (x: number, y: number, w: number, h: number) => void) => void };
  native.measure?.((_x, _y, w) => {
    if (w) set(w);
  });
}

const styles = StyleSheet.create({
  // minWidth:0 lets this flex item shrink below the title's natural single-line
  // width; without it a long title forces the whole row (and the page) wider than
  // a narrow viewport, clipping the right edge. With it, the row fits and the
  // overflow is handled by the marquee / wrap instead.
  clip: { flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' },
  // Out-of-flow and very wide so the measured text never wraps or gets capped;
  // clipped by `clip`'s overflow so it adds no page width.
  measureWrap: { position: 'absolute', left: 0, top: 0, opacity: 0, flexDirection: 'row', width: 4000, pointerEvents: 'none' },
  train: { flexDirection: 'row', alignItems: 'center', position: 'absolute', top: 0, left: 0 },
  // A zero-content, invisible in-flow line: gives the clip its height now that the
  // scrolling train is absolute (out of flow) and contributes no height of its own.
  sizer: { opacity: 0 },
  noShrink: { flexShrink: 0 },
});
