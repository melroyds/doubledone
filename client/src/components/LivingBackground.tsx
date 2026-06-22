// LivingBackground (the "Dusk, evolved" redesign, slice 2): a calm time-of-day gradient
// with two slowly drifting light pools, rendered behind the whole app. The phase is
// STATE, the colour applies even under reduced motion; only the drift stops. The
// legibility rule is sacred: this only ever shows in the margins, the cards sit on
// near-opaque surfaces over it. The pure phase logic lives in lib/phase.ts.

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { motion } from '@/constants/motion';
import { dayPhase, PHASE_GRADIENT, PHASE_POOLS } from '@/lib/phase';
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
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** The whole-app background: a phase gradient with two drifting light pools behind it. */
export function LivingBackground() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  // Resolve the phase once on mount; re-resolving on app foreground is a later refinement.
  const phase = useMemo(() => dayPhase(new Date()), []);
  const stops = PHASE_GRADIENT[phase][theme.scheme];
  const pools = PHASE_POOLS[theme.scheme];
  const poolSize = Math.min(width, 420) * 0.9;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={stops} style={StyleSheet.absoluteFill} />
      <Pool
        id="ddPool1"
        color={pools[0]}
        size={poolSize}
        start={{ x: -poolSize * 0.2, y: height * 0.08 }}
        drift={{ x: width * 0.18, y: height * 0.06 }}
        reduceMotion={reduceMotion}
      />
      <Pool
        id="ddPool2"
        color={pools[1]}
        size={poolSize}
        start={{ x: width - poolSize * 0.8, y: height * 0.42 }}
        drift={{ x: -width * 0.14, y: -height * 0.05 }}
        reduceMotion={reduceMotion}
      />
    </View>
  );
}
