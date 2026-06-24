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
import { dayPhase, PHASE_GRADIENT, PHASE_POOLS, poolLayout, type Phase } from '@/lib/phase';
import { useReducedMotion, useTheme } from '@/lib/theme-provider';

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
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: motion.ambient,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: motion.ambient,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift.x] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift.y] });

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
