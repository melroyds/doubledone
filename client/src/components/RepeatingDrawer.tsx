import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { describeRecurrence } from '@/lib/recurrence';
import { type Task } from '@/lib/tasks';
import { useThemedStyles } from '@/lib/theme-provider';
import { isDoneOn, isRecurring } from '@/lib/today';

type Props = {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  today: Date;
  onToggle: (id: string) => void;
};

// The repeating-tasks home: a panel that slides in from the right. Daily and
// repeating tasks get their own respected space here; today's due ones still
// appear on Today so habits don't fall out of sight. Calm, no streaks or grids.
// Always mounted (off-screen when closed) so the slide animates both ways without
// a ref or a mount-time setState, both of which the render rules forbid.
export function RepeatingDrawer({ open, onClose, tasks, today, onToggle }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [anim] = useState(() => new Animated.Value(open ? 1 : 0));
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, width * 0.86);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 200,
      useNativeDriver: false,
    }).start();
  }, [open, anim]);

  const recurring = tasks.filter((t) => !t.deletedAt && isRecurring(t));
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: open ? 'auto' : 'none' }]}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close repeating tasks" />
      </Animated.View>
      <Animated.View style={[styles.panel, { width: panelWidth, transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Repeating</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>Your daily and repeating tasks. Today&apos;s due ones also show on Today.</Text>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {recurring.length === 0 ? (
            <Text style={styles.empty}>
              No repeating tasks yet. Add one with the Daily or Weekly chip when you capture.
            </Text>
          ) : (
            recurring.map((t) => {
              const done = isDoneOn(t, today);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => onToggle(t.id)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={t.title}
                >
                  <View style={[styles.box, done && styles.boxDone]}>
                    {done && <Text style={styles.tick}>✓</Text>}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, done && styles.rowTitleDone]}>{t.title}</Text>
                    <Text style={styles.cadence}>{t.recurrence ? describeRecurrence(t.recurrence) : ''}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(43,39,34,0.45)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: t.colors.bg,
    paddingHorizontal: spacing.five,
    paddingTop: spacing.seven,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    gap: spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: t.colors.ink, fontSize: 26 * t.scale, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.3 },
  done: { color: t.colors.accent, fontSize: 16 * t.scale, fontWeight: '600', fontFamily: fonts.body },
  sub: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 20, fontFamily: fonts.body },
  list: { marginTop: spacing.two },
  listContent: { gap: spacing.three, paddingBottom: spacing.six },
  empty: { color: t.colors.inkFaint, fontSize: 15 * t.scale, lineHeight: 22, marginTop: spacing.three, fontFamily: fonts.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: t.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDone: { backgroundColor: t.colors.doneSoft, borderColor: t.colors.done },
  tick: { color: t.colors.done, fontSize: 14 * t.scale, fontWeight: '700', fontFamily: fonts.body },
  rowText: { flexShrink: 1 },
  rowTitle: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body },
  rowTitleDone: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  cadence: { color: t.colors.inkSoft, fontSize: 13 * t.scale, marginTop: 1, fontFamily: fonts.body },
});
