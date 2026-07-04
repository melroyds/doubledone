import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { border, fonts, motion, radius, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { describeRecurrence } from '@/lib/recurrence';
import { type Task } from '@/lib/tasks';
import { useReducedMotion, useThemedStyles } from '@/lib/theme-provider';
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
  const reduced = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(open ? 1 : 0));
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, width * 0.86);

  // Reduced motion shows the drawer (and its backdrop) snap to the open/closed end
  // state instantly, never sliding or fading, mirroring how index.tsx settles its
  // close-the-day card for users who opt out of motion.
  useEffect(() => {
    if (reduced) {
      anim.setValue(open ? 1 : 0);
      return;
    }
    const animation = Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : motion.standard,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [open, reduced, anim]);

  const recurring = tasks.filter((task) => !task.deletedAt && isRecurring(task));
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', pointerEvents: open ? 'auto' : 'none' }]}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('repeat.closeDrawerA11y')} />
      </Animated.View>
      <Animated.View style={[styles.panel, { width: panelWidth, transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('repeat.title')}</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.done}>{t('common.close')}</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>{t('repeat.subtitle')}</Text>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {recurring.length === 0 ? (
            <Text style={styles.empty}>
              {t('repeat.empty')}
            </Text>
          ) : (
            recurring.map((task) => {
              const done = isDoneOn(task, today);
              return (
                <Pressable
                  key={task.id}
                  onPress={() => onToggle(task.id)}
                  style={styles.row}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={task.title}
                >
                  <View style={[styles.box, done && styles.boxDone]}>
                    {done && <Text style={styles.tick}>{t('common.tick')}</Text>}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, done && styles.rowTitleDone]}>{task.title}</Text>
                    <Text style={styles.cadence}>{task.recurrence ? describeRecurrence(task.recurrence, today) : ''}</Text>
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
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.scrim },
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
  title: { ...t.type.heading, color: t.colors.ink, letterSpacing: -0.3 },
  done: { color: t.colors.accent, fontSize: 16 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
  sub: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
  list: { marginTop: spacing.two },
  listContent: { gap: spacing.three, paddingBottom: spacing.six },
  empty: { color: t.colors.inkFaint, fontSize: 15 * t.scale, lineHeight: 22 * t.scale, marginTop: spacing.three, fontFamily: fonts.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDone: { backgroundColor: t.colors.doneSoft, borderColor: t.colors.done },
  tick: { color: t.colors.doneText, fontSize: 14 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
  rowText: { flexShrink: 1 },
  rowTitle: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body },
  rowTitleDone: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  cadence: { color: t.colors.inkSoft, fontSize: 13 * t.scale, marginTop: 1, fontFamily: fonts.body },
});
