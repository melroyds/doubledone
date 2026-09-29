// LivingBackground (the "Dusk, evolved" redesign, slice 2): a calm time-of-day gradient
// with two slowly drifting light pools, rendered behind the whole app. The phase is
// STATE, the colour applies even under reduced motion; only the drift stops. The
// legibility rule is sacred: this only ever shows in the margins, the cards sit on
// near-opaque surfaces over it. The pure phase logic lives in lib/phase.ts.

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, AppState, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { motion } from '@/constants/motion';
import { dayPhase, driftAt, PHASE_GRADIENT, PHASE_POOLS, poolLayout, type Phase } from '@/lib/phase';
import { useReducedMotion, useTheme } from '@/lib/theme-provider';

// The ease-in-out the drift always had, sampled so it can ride an interpolation: the loop itself now runs
// LINEARLY off the wall clock (driftAt), which is what lets a fresh instance pick up exactly where every
// other one is, and the curve is applied here instead. A sampled curve, not an `easing` on interpolate,
// because the native driver takes plain input and output ranges only.
const EASE_IN = Array.from({ length: 11 }, (_, i) => i / 10);
const EASE_OUT = EASE_IN.map(Easing.inOut(Easing.ease));

// A single soft light pool: an SVG radial gradient (colour at the centre fading to fully
// transparent at the edge), in an absolutely-positioned box that drifts on a slow loop.
function Pool({
  id,
  color,
  size,
  start,
  drift,
  reduceMotion,
}: {
  id: string;
  color: string;
  size: number;
  start: { x: number; y: number };
  drift: { x: number; y: number };
  reduceMotion: boolean;
}) {
  // Reduced motion rests every pool at 0, so two screens still agree (a still sky, not a clock).
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 0 : driftAt(Date.now(), motion.ambient).value));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(0);
      return;
    }
    const leg = (toValue: number, duration: number) =>
      Animated.timing(progress, { toValue, duration, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' });
    // Join the shared clock: finish the leg every other instance is on, then loop in step with them.
    const at = driftAt(Date.now(), motion.ambient);
    progress.setValue(at.value);
    let stopped = false;
    let current: Animated.CompositeAnimation = leg(at.rising ? 1 : 0, at.remainingMs);
    current.start(({ finished }) => {
      if (!finished || stopped) return;
      current = Animated.loop(
        Animated.sequence(at.rising ? [leg(0, motion.ambient), leg(1, motion.ambient)] : [leg(1, motion.ambient), leg(0, motion.ambient)]),
      );
      current.start();
    });
    return () => {
      stopped = true;
      current.stop();
    };
  }, [progress, reduceMotion]);

  const translateX = progress.interpolate({ inputRange: EASE_IN, outputRange: EASE_OUT.map((e) => e * drift.x) });
  const translateY = progress.interpolate({ inputRange: EASE_IN, outputRange: EASE_OUT.map((e) => e * drift.y) });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: start.x,
        top: start.y,
        width: size,
        height: size,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx={size / 2} cy={size / 2} r={size / 2} gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={color} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

// Re-resolve the time-of-day phase whenever the app returns to the foreground (a tab becoming
// visible on web, or AppState going active on native), so an app left open across a boundary
// (day -> dusk) catches up on the next glance, not only on a cold start.
function useForegroundPhase(): Phase {
  const [phase, setPhase] = useState(() => dayPhase(new Date()));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setPhase(dayPhase(new Date()));
    });
    return () => sub.remove();
  }, []);
  return phase;
}

/** The whole-app background: a phase gradient with two drifting light pools behind it. */
export function LivingBackground() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const phase = useForegroundPhase();
  const stops = PHASE_GRADIENT[phase][theme.scheme];
  const pools = PHASE_POOLS[theme.scheme];
  const { glow, pool } = poolLayout(width, height);

  // overflow:hidden clips the oversized pools to the screen. A plain RN View defaults to
  // overflow:visible, so on web the pools (larger than the viewport, anchored partly off it)
  // make the page pannable past its edge. Native clips regardless; this matches it.
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <LinearGradient colors={stops} style={StyleSheet.absoluteFill} />
      {/* The SVG light pools are disabled on Android. react-native-svg (15.x) mis-rasterises
          a LARGE RadialGradient (the pools run ~400-700px) into a vertical band there:
          imperceptible over the bright background, but exposed as a "pillar" under the bloom's
          dark scrim. Bloom.tsx's own gradients (<=360px) render fine, and switching the pools
          to absolute coords + gradientUnits="userSpaceOnUse" did NOT help, because it is
          size-driven, not a coordinate-units issue. Web (and iOS) render correctly, so keep
          them there. Lift this guard if react-native-svg fixes large-radius radials, or once
          the pools move to a non-SVG glow. */}
      {Platform.OS !== 'android' && (
        <>
          <Pool
            id="ddPool1"
            color={pools[0]}
            size={glow.size}
            start={{ x: glow.x, y: glow.y }}
            drift={{ x: glow.driftX, y: glow.driftY }}
            reduceMotion={reduceMotion}
          />
          <Pool
            id="ddPool2"
            color={pools[1]}
            size={pool.size}
            start={{ x: pool.x, y: pool.y }}
            drift={{ x: pool.driftX, y: pool.driftY }}
            reduceMotion={reduceMotion}
          />
        </>
      )}
    </View>
  );
}
