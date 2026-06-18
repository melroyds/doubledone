import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { type Slices } from '@/lib/tasks';

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
}: Props) {
  if (confirming) {
    return (
      <View style={[styles.row, styles.confirmRow]}>
        <Text style={styles.confirmText} numberOfLines={1}>
          {`Remove ${title}?`}
        </Text>
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
    return (
      <View style={[styles.row, styles.rowUnique]}>
        <Pressable
          onPress={onAdvance}
          onLongPress={onLongPress}
          delayLongPress={400}
          style={({ pressed }) => [styles.sliceMain, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ checked: complete }}
          accessibilityLabel={`${title}, ${slices.done} of ${slices.total} done${complete ? ', complete' : ', tap to advance'}`}
        >
          <View style={styles.sliceTop}>
            <View style={[styles.check, complete && styles.checkDone]}>
              {complete && <Text style={styles.tick}>✓</Text>}
            </View>
            <Text style={[styles.text, complete && styles.textDone]}>{title}</Text>
            <Text style={styles.sliceCount}>
              {slices.done} / {slices.total}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={{ flex: slices.done, backgroundColor: colors.done }} />
            <View style={{ flex: rest }} />
          </View>
        </Pressable>
        {slices.done > 0 && (
          <Pressable
            onPress={onRetreat}
            style={({ pressed }) => [styles.minusBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Step ${title} back one`}
            hitSlop={6}
          >
            <Text style={styles.minusText}>−</Text>
          </Pressable>
        )}
      </View>
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
      <Text style={[styles.text, done && styles.textDone]}>{title}</Text>
      {recurring && <Text style={styles.repeatMark}>↻</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.four,
    paddingVertical: spacing.four,
    paddingHorizontal: spacing.four,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowUnique: { borderColor: colors.repeat, borderWidth: 2 },
  pressed: { opacity: 0.7 },
  confirmRow: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  confirmText: { flex: 1, color: colors.ink, fontSize: 15 },
  keep: { color: colors.inkSoft, fontSize: 15, fontWeight: '600', paddingHorizontal: spacing.two },
  remove: { color: colors.accent, fontSize: 15, fontWeight: '700', paddingHorizontal: spacing.two },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: colors.done, borderColor: colors.done },
  tick: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', lineHeight: 17 },
  text: { flex: 1, color: colors.ink, fontSize: 17, lineHeight: 23 },
  textDone: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  repeatMark: { color: colors.repeat, fontSize: 18, fontWeight: '700' },
  sliceMain: { flex: 1, gap: spacing.two },
  sliceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  sliceCount: { color: colors.repeat, fontSize: 14, fontWeight: '700' },
  track: {
    flexDirection: 'row',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.doneSoft,
    overflow: 'hidden',
  },
  minusBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: { color: colors.inkSoft, fontSize: 20, fontWeight: '600', lineHeight: 22 },
});
