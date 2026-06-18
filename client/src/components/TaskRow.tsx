import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  title: string;
  done: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  confirming?: boolean;
  onRemove?: () => void;
  onKeep?: () => void;
  recurring?: boolean;
};

// A single row. Tap to complete (a soft sage check, gentle fade, never a shaming
// strike). Long-press to remove, behind a calm Keep / Remove confirm so nothing
// vanishes by accident. Removing is neutral, never punishing the task.
export function TaskRow({ title, done, onToggle, onLongPress, confirming, onRemove, onKeep, recurring }: Props) {
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

  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={title}
    >
      <View style={[styles.check, recurring && !done && styles.checkRepeat, done && styles.checkDone]}>
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
  checkRepeat: { borderColor: colors.repeat },
  tick: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', lineHeight: 17 },
  text: { flex: 1, color: colors.ink, fontSize: 17, lineHeight: 23 },
  textDone: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  repeatMark: { color: colors.repeat, fontSize: 17, fontWeight: '700' },
});
