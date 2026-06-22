// Bloom.tsx — the whole-task-finish celebration (the "Dusk, evolved" redesign, slice 3).
// When the last piece of a broken-down task is ticked, the pieces gather into one warm
// point of light over a gentle scrim: an eyebrow, the finished task named in Newsreader
// italic, and a warm one-line context, held for the tier's duration or until a tap.
// Scaled by celebrationTier (quick / real / dreaded). Reduced motion keeps the held title
// and the warm colour and drops only the movement. Never a point, a streak, or a number.

import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { motion } from '@/constants/motion';
import type { CelebrationTier } from '@/lib/celebrate';
import { useReducedMotion, useTheme } from '@/lib/theme-provider';

export type BloomData = {
  title: string;
  context: string;
  tier: CelebrationTier;
  durationMs: number;
};

// The celebration palette is fixed (a warm glow over a dimmed room), not theme-driven: the
// moment reads the same in light and dark. The bloom is the handoff's warm-to-mauve radial.
const BLOOM_WARM = '#E9B98C';
const BLOOM_MAUVE = '#9B6A7D';
const SCRIM = 'rgba(26,20,22,0.62)';
const TITLE_INK = '#F6ECE2';
const SOFT_INK = '#CBB6A6';

// The bloom grows with the size of the thing finished (no number ever shown to the user).
const TIER_SIZE: Record<CelebrationTier, number> = { quick: 210, real: 290, dreaded: 360 };

export function Bloom({ data, onDone }: { data: BloomData | null; onDone: () => void }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(0)); // 0 hidden -> 1 fully shown

  const dismiss = useCallback(() => {
    if (reduce) {
      onDone();
      return;
    }
    Animated.timing(anim, {
      toValue: 0,
      duration: motion.standard,
      easing: Easing.in(Easing.ease),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [anim, reduce, onDone]);

  useEffect(() => {
    if (!data) return;
    anim.setValue(reduce ? 1 : 0);
    if (!reduce) {
      Animated.timing(anim, {
        toValue: 1,
        duration: motion.gentle,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
    const timer = setTimeout(dismiss, data.durationMs);
    return () => clearTimeout(timer);
  }, [data, reduce, anim, dismiss]);

  if (!data) return null;

  const size = TIER_SIZE[data.tier];
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: anim }]}>
      <Pressable style={styles.fill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Continue">
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, { transform: [{ scale }] }]} pointerEvents="none">
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="ddBloom" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={BLOOM_WARM} stopOpacity={0.95} />
                <Stop offset="45%" stopColor={BLOOM_MAUVE} stopOpacity={0.5} />
                <Stop offset="100%" stopColor={BLOOM_MAUVE} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width={size} height={size} fill="url(#ddBloom)" />
            <Circle cx={size / 2} cy={size / 2} r={size * 0.3} stroke={BLOOM_WARM} strokeOpacity={0.16} strokeWidth={1} fill="none" />
            <Circle cx={size / 2} cy={size / 2} r={size * 0.42} stroke={BLOOM_WARM} strokeOpacity={0.09} strokeWidth={1} fill="none" />
          </Svg>
        </Animated.View>
        <View style={styles.caption}>
          <Text style={[styles.eyebrow, { fontFamily: t.fonts.body, fontSize: 13 * t.scale }]}>You finished the whole thing</Text>
          <Text style={[styles.title, { fontFamily: t.fonts.sans, fontSize: 30 * t.scale, lineHeight: 38 * t.scale }]}>{data.title}</Text>
          {data.context ? (
            <Text style={[styles.context, { fontFamily: t.fonts.body, fontSize: 15 * t.scale, lineHeight: 22 * t.scale }]}>{data.context}</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: SCRIM, zIndex: 100, elevation: 100 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: { alignItems: 'center', maxWidth: 320 },
  eyebrow: { color: SOFT_INK, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' },
  title: { color: TITLE_INK, fontStyle: 'italic', textAlign: 'center' },
  context: { color: SOFT_INK, textAlign: 'center', marginTop: 12 },
});
