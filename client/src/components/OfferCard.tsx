import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, ON_PREMIUM, PREMIUM_GRADIENT, PREMIUM_GRADIENT_LOCATIONS, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { useReducedMotion, useTheme, useThemedStyles } from '@/lib/theme-provider';

import { PrimaryButton } from './PrimaryButton';

const EYEBROW_LINE = 16; // the eyebrow's line height before scaling, which places Not now on its centre line

// "A month on us" (design_handoff_month_on_us §2): the one-time thank-you offer on Today, in What's New's slot.
// Standard wears the Premium gradient, loud through colour only: no shadow, no entrance motion, no countdown.
// Quiet drops the fill for a 3px gradient rule, so the first offer the app makes keeps Quiet's promise. Text sits
// only on the mauve stops (the gold corner stays empty: the button is left-aligned and the sentence ends early).
// Not now is drawn top-right but sits LAST in the tree, so it is read last.
export function OfferCard({ onWrite, onNotNow }: { onWrite: () => void; onNotNow: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const quiet = theme.appearance === 'quiet';
  const [notNowWidth, setNotNowWidth] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [fade] = useState(() => new Animated.Value(1)); // the repo's compiler-safe Animated pattern
  const [height] = useState(() => new Animated.Value(0));
  const measured = useRef(0);
  const done = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );

  function finish() {
    if (done.current) return;
    done.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    onNotNow();
  }

  // Fade out, then fold the space shut so the list rises under the finger instead of jumping. Under reduced
  // motion a 90ms dissolve, then the list takes the space in one step. A timer backs up the animation's own
  // callback, because a throttled frame clock (a background tab) can leave it unfinished. Both run on the JS
  // driver: the opacity and the height share one view, and a native-driven fade would make the height node
  // native too, so the JS-driven fold would throw on a phone (the review, 2026-10-25; the web cannot show it).
  function notNow() {
    if (leaving) return;
    setLeaving(true);
    height.setValue(measured.current);
    const out = Animated.timing(fade, { toValue: 0, duration: reduced ? 90 : 160, easing: Easing.out(Easing.quad), useNativeDriver: false });
    const fold = Animated.timing(height, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: false });
    fallback.current = setTimeout(finish, reduced ? 200 : 520);
    (reduced ? out : Animated.sequence([out, fold])).start(finish);
  }

  const notNowTop = (quiet ? spacing.two + 3 + spacing.three : spacing.four) + (EYEBROW_LINE * theme.scale) / 2 - 22;

  const inner = (
    <>
      {quiet ? (
        <LinearGradient colors={PREMIUM_GRADIENT} locations={PREMIUM_GRADIENT_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
      ) : null}
      <View accessible accessibilityLabel={t('feedbackMonth.cardA11y')}>
        <Text style={[styles.eyebrow, { paddingRight: notNowWidth }]}>{t('feedbackMonth.cardEyebrow')}</Text>
        <Text style={styles.sentence}>{t('feedbackMonth.cardBody')}</Text>
      </View>
      <PrimaryButton
        label={t('feedbackMonth.cardWrite')}
        onPress={onWrite}
        disabled={leaving}
        tone={quiet ? 'accent' : 'inverse'}
        size="compact"
        accessibilityLabel={t('feedbackMonth.cardWriteA11y')}
        style={styles.write}
      />
      <Pressable
        onPress={notNow}
        disabled={leaving}
        onLayout={(e) => setNotNowWidth(e.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityLabel={t('feedbackMonth.cardNotNowA11y')}
        style={({ pressed }) => [styles.notNow, { top: notNowTop }, pressed && styles.pressed]}
      >
        <Text style={styles.notNowText}>{t('feedbackMonth.cardNotNow')}</Text>
      </Pressable>
    </>
  );

  return (
    <Animated.View
      testID="offer-card" // RN-web renders data-testid: scripts/offer-card-height.mjs measures the card by it
      onLayout={(e) => {
        if (!leaving) measured.current = e.nativeEvent.layout.height;
      }}
      style={[styles.wrap, leaving && !reduced ? { height, overflow: 'hidden' } : null, { opacity: fade }]}
    >
      {quiet ? (
        <View style={styles.quiet}>{inner}</View>
      ) : (
        <LinearGradient colors={PREMIUM_GRADIENT} locations={PREMIUM_GRADIENT_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.standard}>
          {inner}
        </LinearGradient>
      )}
    </Animated.View>
  );
}

const makeStyles = (t: Theme) => {
  const quiet = t.appearance === 'quiet';
  return StyleSheet.create({
    wrap: { paddingBottom: spacing.three }, // padding, not margin, so the fold takes the gap with it
    standard: { borderRadius: radius.lg, paddingVertical: spacing.four, paddingHorizontal: spacing.five },
    quiet: { paddingVertical: spacing.two, paddingHorizontal: spacing.half },
    rule: { height: 3, borderRadius: 1.5, marginBottom: spacing.three },
    eyebrow: {
      color: quiet ? t.colors.accentText : ON_PREMIUM,
      fontSize: 11 * t.scale,
      lineHeight: EYEBROW_LINE * t.scale,
      fontFamily: fonts.bodyBold,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    sentence: {
      color: quiet ? t.colors.ink : ON_PREMIUM,
      fontSize: 19 * t.scale,
      lineHeight: 24 * t.scale,
      fontFamily: fonts.sans,
      fontWeight: Platform.OS === 'web' ? '500' : '600', // the board's 500; the phones' heaviest loaded face is 600
      marginTop: spacing.two,
    },
    write: { marginTop: spacing.three },
    notNow: { position: 'absolute', right: quiet ? 0 : spacing.four, height: 44, paddingHorizontal: spacing.two, justifyContent: 'center' },
    notNowText: { color: quiet ? t.colors.inkSoft : ON_PREMIUM, fontSize: 15 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
    pressed: { opacity: PRESSED_OPACITY },
  });
};
