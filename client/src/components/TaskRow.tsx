import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { type Slices } from '@/lib/tasks';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { MarqueeText } from './MarqueeText';

type Props = {
  title: string;
  done: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  confirming?: boolean;
  onRemove?: () => void;
  onKeep?: () => void;
  recurring?: boolean;
  slices?: Slices | null;
  onAdvance?: () => void;
  onRetreat?: () => void;
  onBreakdown?: () => void;
};

// A single row. Tap to complete (a soft sage check, gentle fade, never a shaming
// strike). Long-press to remove, behind a calm Keep / Remove confirm. One-off
// (unique) tasks get a solid coloured border; repeating tasks stay plain but carry
// the repeat mark. Same denim colour either way.
//
// A sliced task (a thing done in parts) renders its own way: tap to advance one
// slice, a slim sage bar fills toward done, a quiet "n / N" count, and a small −
// to step back a mistaken tap. Finishing the last slice completes it exactly like
// any task (the caller stamps it), so the celebration is unchanged.
export function TaskRow({
  title,
  done,
  onToggle,
  onLongPress,
  confirming,
  onRemove,
  onKeep,
  recurring,
  slices,
  onAdvance,
  onRetreat,
  onBreakdown,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  if (confirming) {
    // A sliced task's hold reveals its quiet controls: step a slice back (the only
    // place the "minus" lives now), or remove. The count updates live as you step.
    if (slices) {
      return (
        <View style={[styles.row, styles.confirmRow]}>
          <Text style={styles.confirmText} numberOfLines={1}>
            {`${title}  ·  ${slices.done} / ${slices.total}`}
          </Text>
          <Pressable
            onPress={onRetreat}
            disabled={slices.done <= 0}
            accessibilityRole="button"
            accessibilityLabel={`Step ${title} back one`}
          >
            <Text style={[styles.keep, slices.done <= 0 && styles.controlOff]}>Step back</Text>
          </Pressable>
          <Pressable onPress={onKeep} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.keep}>Close</Text>
          </Pressable>
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${title}`}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={[styles.row, styles.confirmRow]}>
        <Text style={styles.confirmText} numberOfLines={1}>
          {title}
        </Text>
        {onBreakdown && !recurring && (
          <Pressable onPress={onBreakdown} accessibilityRole="button" accessibilityLabel={`Break down ${title}`}>
            <Text style={styles.keep}>Break down</Text>
          </Pressable>
        )}
        <Pressable onPress={onKeep} accessibilityRole="button" accessibilityLabel="Keep">
          <Text style={styles.keep}>Keep</Text>
        </Pressable>
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${title}`}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
    );
  }

  if (slices) {
    const complete = slices.total > 0 && slices.done >= slices.total;
    const rest = Math.max(0, slices.total - slices.done);
    // Calm by default: tap to advance a slice, hold to reveal the step-back / remove
    // controls. No always-on minus cluttering the row.
    return (
      <Pressable
        onPress={onAdvance}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [styles.row, styles.rowUnique, styles.sliceColumn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ checked: complete }}
        accessibilityLabel={`${title}, ${slices.done} of ${slices.total} done${complete ? ', complete' : ', tap to advance, hold to adjust'}`}
      >
        <View style={styles.sliceTop}>
          <View style={[styles.check, complete && styles.checkDone]}>
            {complete && <Text style={styles.tick}>✓</Text>}
          </View>
          <MarqueeText text={title} style={[styles.text, complete && styles.textDone]} />
          <Text style={styles.sliceCount}>
            {slices.done} / {slices.total}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={{ flex: slices.done, backgroundColor: theme.colors.done }} />
          <View style={{ flex: rest }} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, !recurring && styles.rowUnique, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={title}
    >
      <View style={[styles.check, done && styles.checkDone]}>
        {done && <Text style={styles.tick}>✓</Text>}
      </View>
      <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
      {recurring && <Text style={styles.repeatMark}>↻</Text>}
    </Pressable>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.four,
    paddingVertical: spacing.four,
    paddingHorizontal: spacing.four,
    backgroundColor: t.colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.line,
  },
  rowUnique: { borderColor: t.colors.repeat, borderWidth: 2 },
  pressed: { opacity: 0.7 },
  confirmRow: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accentSoft },
  confirmText: { flex: 1, color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body },
  keep: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '600', paddingHorizontal: spacing.two },
  controlOff: { color: t.colors.inkFaint },
  remove: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '700', paddingHorizontal: spacing.two },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: t.colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: t.colors.done, borderColor: t.colors.done },
  tick: { color: '#FFFFFF', fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '700', lineHeight: 17 },
  text: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.body, lineHeight: 23 },
  textDone: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  repeatMark: { color: t.colors.repeat, fontSize: 18 * t.scale, fontFamily: fonts.body, fontWeight: '700' },
  sliceColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.two },
  sliceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  sliceCount: { color: t.colors.repeat, fontSize: 14 * t.scale, fontFamily: fonts.body, fontWeight: '700' },
  track: {
    flexDirection: 'row',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.colors.doneSoft,
    overflow: 'hidden',
  },
});
