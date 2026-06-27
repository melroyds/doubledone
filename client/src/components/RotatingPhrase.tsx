import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';

import { fonts, motion, type Theme } from '@/constants/theme';
import { useReducedMotion, useTheme, useThemedStyles } from '@/lib/theme-provider';

// A calm, original (uncopyrighted) line at the foot of Today, in place of a single
// fixed ethos. Each carries one of the desaturated Dusk accent hues, set in the
// Newsreader serif italic so it reads like a quiet inscription, distinct from the
// Atkinson body around it. It cross-fades slowly; with reduced motion it simply
// shows one and stays still. Phrases are gentle and never instructive-shaming.
const PHRASES = [
  'today is finite and achievable',
  'one thing, then the next',
  'small steps still move you',
  'rest is part of the work',
  "you're allowed to go slowly",
  'a quiet day still counts',
  'what you finish, you keep',
  'gentle is still forward',
];

export function RotatingPhrase() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = useReducedMotion();
  // A varying start so each open opens on a different line; rotation continues
  // from there when motion is allowed.
  const [i, setI] = useState(() => Math.floor(Math.random() * PHRASES.length));
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduced) return; // no movement for motion-sensitive users
    const id = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: motion.crossfade,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        setI((prev) => (prev + 1) % PHRASES.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.crossfade,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      });
    }, 7000);
    return () => clearInterval(id);
  }, [reduced, opacity]);

  const color = theme.colors.accents[i % theme.colors.accents.length];

  return (
    <Animated.Text style={[styles.phrase, { color, opacity }]} accessibilityRole="text">
      {PHRASES[i]}
    </Animated.Text>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    phrase: {
      fontFamily: fonts.sans,
      fontStyle: 'italic',
      fontSize: 15 * t.scale,
      lineHeight: 22 * t.scale,
      textAlign: 'center',
      alignSelf: 'stretch',
      letterSpacing: 0.2,
    },
  });
