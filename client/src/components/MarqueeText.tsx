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
};

export function MarqueeText({ text, style }: Props) {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const [tx] = useState(() => new Animated.Value(0)); // useState, not useRef: ref reads in render trip the compiler lint
  const reduced = useReducedMotion();
  const containerRef = useRef<View>(null);
  const measureRef = useRef<Text>(null);

  const overflow = containerW > 0 && textW > containerW + 1; // +1 avoids jitter at an exact fit
  const scrolling = overflow && !reduced;

  // Measure after layout, and again on a web resize. Reading refs here (not during
  // render) keeps the React Compiler happy.
  useEffect(() => {
    const read = () => {
      measureWidth(containerRef.current, setContainerW);
      measureWidth(measureRef.current, setTextW);
    };
    read();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
  }, [text]);

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
        // Two copies that keep their natural width (no numberOfLines cap) so the
        // train can scroll; at -(width+gap) the second copy sits where the first
        // began, making the reset seamless.
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
  train: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  noShrink: { flexShrink: 0 },
});
