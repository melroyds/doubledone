// Settle, the breathing room (Claude Design "Settle" handoff, built 2026-08-01). A regulation
// surface for the flooded moment that precedes every other tool: a blob that breathes on the
// 4 / 1.5 / 6.5 cycle and a person who entrains to it. The hard rules, from the handoff and
// non-negotiable: no timer or duration shown, no stats or streaks or history, no "well done",
// no paywall or lock or countdown, never auto-opened, and the exit is never obscured. The room
// has NO TITLE on purpose: a title makes it a place you can fail to use correctly.
//
// Rhythm sources: ONE JS phase clock (a setTimeout chain over the same durations that drive the
// Animated loop) fires the haptics, swaps the guide words, and paces the affirmations, while the
// Animated loop free-runs the blob. Both start together; per-cycle drift is timer jitter only.
// The screen is allowed to dim (no keep-awake): the haptic breath works face-down, by design.

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { fonts, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { settleBreathIn, settleBreathOut } from '@/lib/haptics';
import { t } from '@/lib/locale';
import {
  AFFIRMATION_FADE_IN_MS,
  AFFIRMATION_VISIBLE_MS,
  affirmationIndex,
  BLOB_OPACITY_DELTA,
  BLOB_SCALE_FULL,
  BLOB_SCALE_REST,
  BLOB_SCALE_STILL,
  GLOW_FULL,
  leaveFadeMs,
  nextAffirmationDelay,
  SETTLE_MS,
  STILL_MS,
  SWELL_MS,
  WORD_FADE_MS,
  WORD_FADE_REDUCED_MS,
} from '@/lib/settle';
import { loadSettleGuide, saveSettleGuide } from '@/lib/storage';
import { track } from '@/lib/telemetry';
import { useReducedMotion, useTheme, useThemedStyles } from '@/lib/theme-provider';

// The RSD-safe lines, rotated in order. Never praise: "you're doing great" implies a
// performance, and nothing in this room is performed. Grew from four to seven on the
// founder's device pass ("needs more kind stuff so people can relax", 2026-08-01).
const AFFIRMATION_KEYS = [
  'settle.aff1',
  'settle.aff2',
  'settle.aff3',
  'settle.aff4',
  'settle.aff5',
  'settle.aff6',
  'settle.aff7',
] as const;

const BLOB_SIZE = 300;

type Phase = 'swell' | 'still' | 'settle';
const GUIDE_KEY: Record<Phase, string> = {
  swell: 'settle.guideIn',
  still: 'settle.guideRest',
  settle: 'settle.guideOut',
};

export default function Settle() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = useReducedMotion();

  const [guideOn, setGuideOn] = useState(true); // defaults ON: the first visit teaches
  const [phase, setPhase] = useState<Phase>('swell');
  // An affirmation FREEZES its colour at the moment it appears (an affirmation lives ~12s,
  // exactly one breath, so borrowing the live index flipped it mid-display — caught on the
  // founder's TestFlight pass, 2026-08-01). The guide word keeps riding the live cycle.
  const [affirmation, setAffirmation] = useState<{ key: string; colorIdx: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  // The words wear the Dusk accents in sequence, exactly like Today's rotating inscription
  // (Melroy's device-test ask): a random start, then the next hue with every new breath.
  const [colorIdx, setColorIdx] = useState(() => Math.floor(Math.random() * 5));
  const colorIdxRef = useRef(0);
  useEffect(() => {
    colorIdxRef.current = colorIdx; // mirror for timer callbacks (no re-scheduling on each breath)
  }, [colorIdx]);

  // One breath value drives scale AND warmth from the same clock (0 = rest, 1 = full).
  // useState initializers, not useRef.current: the React Compiler forbids ref reads in
  // render, and this is Bloom's established pattern for Animated values.
  const [breath] = useState(() => new Animated.Value(0));
  const [roomOpacity] = useState(() => new Animated.Value(1));
  const [affirmationOpacity] = useState(() => new Animated.Value(0));
  const [wordOpacity] = useState(() => new Animated.Value(0));
  const openedAtRef = useRef(0);
  const shownCountRef = useRef(0);
  const leavingRef = useRef(false);

  useEffect(() => {
    void loadSettleGuide().then(setGuideOn);
  }, []);

  // The blob's breath: swell 4s up, still 1.5s held, settle 6.5s down, looped. Under
  // reduce-motion the SAME loop runs but only warmth listens (scale stays at rest below).
  useEffect(() => {
    openedAtRef.current = Date.now();
    track('settle.opened');
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: SWELL_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.delay(STILL_MS),
        Animated.timing(breath, { toValue: 0, duration: SETTLE_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  // The phase clock: haptics at the onsets (swell = one light tap, settle = two tiny ones,
  // still = nothing, stillness is the cue), the guide word riding along. A chained timeout,
  // not an interval, so the uneven phases keep their own lengths.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let fadeTimer: ReturnType<typeof setTimeout>;
    const fadeMs = reduced ? WORD_FADE_REDUCED_MS : WORD_FADE_MS;
    // Each phase's word FADES in at the onset and out before the next (the hard swap read as
    // chopping on the first device test). The fade rides the same clock as the haptics.
    const breatheWord = (phaseMs: number) => {
      Animated.timing(wordOpacity, { toValue: 1, duration: fadeMs, useNativeDriver: false }).start();
      fadeTimer = setTimeout(() => {
        Animated.timing(wordOpacity, { toValue: 0, duration: fadeMs, useNativeDriver: false }).start();
      }, Math.max(0, phaseMs - fadeMs));
    };
    const run = (next: Phase) => {
      if (!alive) return;
      setPhase(next);
      if (next === 'swell') {
        setColorIdx((i) => i + 1); // a new breath wears the next accent
        settleBreathIn();
        breatheWord(SWELL_MS);
        timer = setTimeout(() => run('still'), SWELL_MS);
      } else if (next === 'still') {
        breatheWord(STILL_MS);
        timer = setTimeout(() => run('settle'), STILL_MS);
      } else {
        settleBreathOut();
        breatheWord(SETTLE_MS);
        timer = setTimeout(() => run('swell'), SETTLE_MS);
      }
    };
    // The first swell needs no setState (phase initialises to 'swell'): fire its haptic and
    // fades, schedule the first transition, so the effect body never sets state synchronously.
    settleBreathIn();
    breatheWord(SWELL_MS);
    timer = setTimeout(() => run('still'), SWELL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(fadeTimer);
    };
  }, [reduced, wordOpacity]);

  // Affirmations, only while the guide rests: one line every 60 to 90 seconds, 3s fade-in,
  // gone within 12, never stacking. The guide and the affirmations alternate, never coexist.
  useEffect(() => {
    // Guide on (or leaving): affirmations rest. The PREVIOUS run's cleanup already cleared
    // any visible line, so this branch only declines to schedule; no synchronous setState.
    if (guideOn || leaving) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        const key = AFFIRMATION_KEYS[affirmationIndex(shownCountRef.current, AFFIRMATION_KEYS.length)];
        shownCountRef.current += 1;
        setAffirmation({ key, colorIdx: colorIdxRef.current });
        Animated.sequence([
          Animated.timing(affirmationOpacity, { toValue: 1, duration: AFFIRMATION_FADE_IN_MS, useNativeDriver: false }),
          Animated.delay(AFFIRMATION_VISIBLE_MS - AFFIRMATION_FADE_IN_MS - 2000),
          Animated.timing(affirmationOpacity, { toValue: 0, duration: 2000, useNativeDriver: false }),
        ]).start(() => {
          if (alive) setAffirmation(null);
        });
        schedule();
      }, nextAffirmationDelay(Math.random()));
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
      affirmationOpacity.setValue(0);
      setAffirmation(null); // clear any visible line the moment the guide takes over
    };
  }, [guideOn, leaving, affirmationOpacity]);

  function toggleGuide() {
    const next = !guideOn;
    setGuideOn(next);
    void saveSettleGuide(next);
    track('settle.guide', { on: next });
  }

  // The leaving: fade over the remainder of the current settle, 800ms cap, instant under
  // reduce-motion. One faint line rides the fade; then Today, exactly as left. Announced for
  // screen readers, since the visual fade says it silently.
  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    track('settle.left'); // no duration attached: time is not a score here
    AccessibilityInfo.announceForAccessibility?.(t('settle.leavingLine'));
    const fade = reduced ? 1 : leaveFadeMs(Date.now() - openedAtRef.current);
    // The fade is the experience; the TIMER is the guarantee. Navigation must never hang on
    // an animation callback (a throttled or interrupted rAF can freeze Animated mid-flight,
    // proven in the preview), so whichever of the two fires first leaves the room, once.
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      router.replace('/today');
    };
    Animated.timing(roomOpacity, { toValue: 0, duration: fade, useNativeDriver: false }).start(go);
    setTimeout(go, fade + 250);
  }, [reduced, roomOpacity, router]);

  const scale = reduced
    ? BLOB_SCALE_STILL // geometry holds still at neutral; warmth carries the breath
    : breath.interpolate({ inputRange: [0, 1], outputRange: [BLOB_SCALE_REST, BLOB_SCALE_FULL] });
  // The breath brightens as it fills: the body rises from its dimmed rest to full, and the
  // glow disc blooms from nothing near the top of the swell (its curve back-loaded so the
  // brightest moment is the fullest lung).
  const coreOpacity = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [1 - BLOB_OPACITY_DELTA, 1],
  });
  const glowOpacity = breath.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, GLOW_FULL * 0.3, GLOW_FULL],
  });

  const dark = theme.scheme === 'dark';
  const wordColor = theme.colors.accents[colorIdx % theme.colors.accents.length];

  return (
    <Animated.View style={[styles.room, { opacity: roomOpacity, paddingTop: insets.top + spacing.four, paddingBottom: insets.bottom + spacing.five }]}>
      {/* Leave: quiet text, top-left, 44px target, never obscured, always first for a screen reader. */}
      <Pressable
        onPress={leave}
        accessibilityRole="button"
        accessibilityLabel={t('settle.leaveA11y')}
        hitSlop={12}
        style={({ pressed }) => [styles.leaveBtn, pressed && styles.pressed]}
      >
        <Text style={styles.leaveText}>{t('settle.leave')}</Text>
      </Pressable>

      <View style={styles.centre} pointerEvents="none">
        <Animated.View style={{ transform: [{ scale }] }}>
          <Animated.View style={{ opacity: coreOpacity }}>
            <Svg width={BLOB_SIZE} height={BLOB_SIZE}>
              <Defs>
                {/* Two layered radial discs, blur baked into the stops (no runtime blur): mauve
                    core over a periwinkle wash in the dark, mauve over honey in the light. */}
                <RadialGradient id="settleWash" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={dark ? '#6E72A0' : '#C19A4F'} stopOpacity={dark ? 0.28 : 0.2} />
                  <Stop offset="70%" stopColor={dark ? '#6E72A0' : '#C19A4F'} stopOpacity={dark ? 0.1 : 0.08} />
                  <Stop offset="100%" stopColor={dark ? '#6E72A0' : '#C19A4F'} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="settleCore" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={dark ? '#E7B6C6' : '#946475'} stopOpacity={dark ? 0.5 : 0.34} />
                  <Stop offset="55%" stopColor={dark ? '#E7B6C6' : '#946475'} stopOpacity={dark ? 0.22 : 0.16} />
                  <Stop offset="100%" stopColor={dark ? '#E7B6C6' : '#946475'} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={BLOB_SIZE / 2} cy={BLOB_SIZE / 2} r={BLOB_SIZE / 2} fill="url(#settleWash)" />
              <Circle cx={BLOB_SIZE / 2} cy={BLOB_SIZE / 2} r={BLOB_SIZE * 0.36} fill="url(#settleCore)" />
            </Svg>
          </Animated.View>
          {/* The glow, its own layer so its bloom does not multiply into the body's opacity:
              invisible at rest, brightest at the fullest lung. Pale pink light in the dark;
              in the light scheme "brighter" means DEEPER (white on white would vanish), so the
              same mauve intensifies instead. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glowOpacity }]}>
            <Svg width={BLOB_SIZE} height={BLOB_SIZE}>
              <Defs>
                <RadialGradient id="settleGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={dark ? '#F2CFDC' : '#946475'} stopOpacity={dark ? 0.65 : 0.4} />
                  <Stop offset="45%" stopColor={dark ? '#F2CFDC' : '#946475'} stopOpacity={dark ? 0.26 : 0.18} />
                  <Stop offset="100%" stopColor={dark ? '#F2CFDC' : '#946475'} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={BLOB_SIZE / 2} cy={BLOB_SIZE / 2} r={BLOB_SIZE * 0.3} fill="url(#settleGlow)" />
            </Svg>
          </Animated.View>
        </Animated.View>

        {/* The words: the guide's literal three, or (guide off) a rare affirmation. Never both.
            All of them fade, and all of them wear the inscription's accent cycle. */}
        <View style={styles.wordSlot}>
          {leaving ? (
            <Text style={styles.leavingLine}>{t('settle.leavingLine')}</Text>
          ) : guideOn ? (
            <Animated.Text style={[styles.guideWord, { color: wordColor, opacity: wordOpacity }]}>
              {t(GUIDE_KEY[phase])}
            </Animated.Text>
          ) : affirmation ? (
            <Animated.Text
              style={[
                styles.affirmation,
                { color: theme.colors.accents[affirmation.colorIdx % theme.colors.accents.length], opacity: affirmationOpacity },
              ]}
            >
              {t(affirmation.key)}
            </Animated.Text>
          ) : null}
        </View>
      </View>

      {/* The one toggle, remembered, never a settings screen. */}
      <Pressable
        onPress={toggleGuide}
        accessibilityRole="button"
        accessibilityState={{ selected: guideOn }}
        accessibilityLabel={guideOn ? t('settle.guidePillOnA11y') : t('settle.guidePillOffA11y')}
        hitSlop={10}
        style={({ pressed }) => [styles.guidePill, pressed && styles.pressed]}
      >
        <Text style={styles.guidePillText}>{guideOn ? t('settle.guidePillOn') : t('settle.guidePillOff')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    room: { flex: 1, backgroundColor: th.colors.bg, paddingHorizontal: spacing.five },
    leaveBtn: { alignSelf: 'flex-start', minHeight: 44, minWidth: 44, justifyContent: 'center', zIndex: 1 },
    leaveText: { color: th.colors.inkSoft, fontSize: 16 * th.scale, fontFamily: fonts.body },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // A fixed slot below the blob so words never move the layout when they come and go.
    wordSlot: { minHeight: 56, alignItems: 'center', justifyContent: 'flex-start', marginTop: spacing.five },
    // The inscription's own voice (RotatingPhrase): serif italic, accent-coloured at render.
    guideWord: { fontSize: 17 * th.scale, fontFamily: fonts.sans, fontStyle: 'italic', textAlign: 'center', letterSpacing: 0.2 },
    affirmation: { fontSize: 16 * th.scale, fontFamily: fonts.sans, fontStyle: 'italic', textAlign: 'center', letterSpacing: 0.2, maxWidth: 280 },
    leavingLine: { color: th.colors.inkFaint, fontSize: 15 * th.scale, fontFamily: fonts.body, fontStyle: 'italic', textAlign: 'center' },
    guidePill: {
      alignSelf: 'center',
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.two,
      borderRadius: radius.pill,
      minHeight: 36,
      justifyContent: 'center',
    },
    guidePillText: { color: th.colors.inkFaint, fontSize: 13 * th.scale, fontFamily: fonts.body, letterSpacing: 0.4 },
    pressed: { opacity: PRESSED_OPACITY },
  });
