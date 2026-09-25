import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, fonts, PRESSED_OPACITY, radius, rgba, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  /** Which page you are on. The underline sits under it. */
  current: 'today' | 'ours';
  /**
   * The shared list's word, or null when there is no LIVE shared list, in which case there is no
   * Ours word at all (the old door's rule: nothing on the working surface advertises a feature to
   * somebody who does not use it). A household's own name for its list wins over "Ours" and wraps
   * rather than truncating, because that word is not ours to cut.
   */
  oursLabel: string | null;
  /** How many rows the room would wash if you opened it now (0 on the room itself, which clears it). */
  changed?: number;
  /** The shrunk heading while the composer is open, so the list stays in view above the keyboard. */
  compact?: boolean;
  /** Compact Today only: the weight line, on the right, and its thin gauge underneath. */
  weightLabel?: string;
  weightFill?: number;
  onToday: () => void;
  onOurs: () => void;
};

/**
 * "Today · Ours": two serif words side by side with a 2pt underline under the page you are on (the
 * Today v3 handoff). One tap switches; each page keeps its own capture. It replaces the Ours door row
 * that used to sit in Today's list.
 *
 * The "!" beside Ours says something there changed since you last looked. It is the same quantity the
 * room washes (`changedSinceLooked`), so the mark and the washed rows agree; it is a tinted mark, never
 * a solid badge, never a number, never animated, and opening the room is what clears it. A screen
 * reader hears the count in words ("Ours. 2 since you looked"), the string the door used.
 */
export function DayHeading({ current, oursLabel, changed = 0, compact = false, weightLabel, weightFill, onToday, onOurs }: Props) {
  const styles = useThemedStyles(makeStyles);
  const showMark = current === 'today' && changed > 0;
  const oursA11y = [oursLabel ?? t('ours.defaultName'), showMark ? t('ours.sinceYouLooked', { count: changed }) : null].filter(Boolean).join('. ');

  const word = (which: 'today' | 'ours', label: string, a11y: string, onPress: () => void) => {
    const on = current === which;
    return (
      <Pressable
        key={which}
        onPress={on ? undefined : onPress}
        accessibilityRole="tab"
        aria-selected={on}
        accessibilityLabel={a11y}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={({ pressed }) => [compact ? styles.wordCompactWrap : styles.wordWrap, pressed && !on && styles.pressed]}
      >
        <View style={styles.wordRow}>
          <Text style={[compact ? styles.wordCompact : styles.word, !on && styles.wordOff]}>{label}</Text>
          {which === 'ours' && showMark && (
            <View style={compact ? styles.markCompact : styles.mark} accessible={false} importantForAccessibility="no-hide-descendants">
              <Text style={compact ? styles.markTextCompact : styles.markText}>!</Text>
            </View>
          )}
        </View>
        <View style={[compact ? styles.underlineCompact : styles.underline, on && styles.underlineOn]} />
      </Pressable>
    );
  };

  const words = (
    <View style={compact ? styles.wordsCompact : styles.words} accessibilityRole="tablist">
      {word('today', t('common.today'), t('common.today'), onToday)}
      {oursLabel !== null && word('ours', oursLabel, oursA11y, onOurs)}
    </View>
  );

  if (!compact) return words;
  return (
    <View style={styles.compactBar}>
      <View style={styles.compactRow}>
        {words}
        {weightLabel ? <Text style={styles.compactWeight}>{weightLabel}</Text> : null}
      </View>
      {weightFill != null && (
        <View style={styles.compactTrack}>
          <View style={[styles.compactFill, { flex: weightFill }]} />
          <View style={{ flex: 1 - weightFill }} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    words: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 26, rowGap: spacing.two, marginTop: spacing.three },
    wordWrap: { gap: 7, flexShrink: 1 },
    wordRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, flexShrink: 1 },
    word: { color: t.colors.ink, fontSize: 38 * t.scale, lineHeight: 42 * t.scale, fontFamily: fonts.sans, fontWeight: '500', letterSpacing: -0.4, flexShrink: 1 },
    wordOff: { color: t.colors.inkSoft },
    underline: { height: 2, borderRadius: 2, backgroundColor: 'transparent' },
    underlineOn: { backgroundColor: t.colors.accent },
    // The "!" is a TINT with a soft edge (accentSoft, a quarter-strength accent ring), so it reads as
    // "something new", never "something wrong".
    mark: {
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      marginTop: 2,
      backgroundColor: t.colors.accentSoft,
      borderWidth: border.hair,
      borderColor: rgba(t.colors.accent, 0.28),
      alignItems: 'center',
      justifyContent: 'center',
    },
    markText: { color: t.colors.accent, fontSize: 13 * t.scale, lineHeight: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    // The shrunk bar while the composer is open: the words at 21pt, the weight line on the right, a 3pt
    // gauge beneath, and one hairline to separate it from the list.
    compactBar: { gap: 9, paddingBottom: spacing.three, borderBottomWidth: border.hair, borderBottomColor: t.colors.line },
    compactRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.two },
    wordsCompact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 18, flexShrink: 1 },
    wordCompactWrap: { flexShrink: 1, paddingTop: spacing.three },
    wordCompact: { color: t.colors.ink, fontSize: 21 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.sans, fontWeight: '500', flexShrink: 1 },
    underlineCompact: { height: 2, marginTop: 5, borderRadius: 2, backgroundColor: 'transparent' },
    markCompact: {
      width: 16,
      height: 16,
      borderRadius: radius.pill,
      backgroundColor: t.colors.accentSoft,
      borderWidth: border.hair,
      borderColor: rgba(t.colors.accent, 0.28),
      alignItems: 'center',
      justifyContent: 'center',
    },
    markTextCompact: { color: t.colors.accent, fontSize: 11 * t.scale, lineHeight: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    compactWeight: { color: t.colors.inkSoft, fontSize: 12.5 * t.scale, fontFamily: fonts.body, paddingBottom: 6 },
    compactTrack: { flexDirection: 'row', height: 3, borderRadius: radius.pill, backgroundColor: t.colors.line, overflow: 'hidden' },
    compactFill: { backgroundColor: t.colors.accent }, // the same fill as Today's full gauge: one gauge, two sizes
    pressed: { opacity: PRESSED_OPACITY },
  });
