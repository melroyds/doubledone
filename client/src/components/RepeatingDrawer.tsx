import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { border, fonts, motion, radius, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { describeRecurrence, type Recurrence } from '@/lib/recurrence';
import { type Task } from '@/lib/tasks';
import { useReducedMotion, useThemedStyles } from '@/lib/theme-provider';
import { isDoneOn, isRecurring } from '@/lib/today';

import { CadenceSheet } from './CadenceSheet';

type Props = {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  today: Date;
  onToggle: (id: string) => void;
  // The drawer manages the series (Today manages days): the parent owns the commit.
  onEditSeries: (id: string, title: string, recurrence: Recurrence) => void;
  onRemoveSeries: (id: string) => void; // tombstones the whole series
  onRestoreSeries: (id: string) => void; // the undo: clears the tombstone
};

// The repeating-tasks home: a panel that slides in from the right. Daily and
// repeating tasks get their own respected space here; today's due ones still
// appear on Today so habits don't fall out of sight. Calm, no streaks or grids.
// This is where the SERIES is managed (edit its title and cadence, or remove it
// whole, with an undo); removing from Today only skips a day. Always mounted
// (off-screen when closed) so the slide animates both ways without a ref or a
// mount-time setState, both of which the render rules forbid.
export function RepeatingDrawer({ open, onClose, tasks, today, onToggle, onEditSeries, onRemoveSeries, onRestoreSeries }: Props) {
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(open ? 1 : 0));
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, width * 0.86);

  // Removing a series is recoverable, not a confirmation gauntlet: a brief undo bar
  // (matching routines.tsx) instead of a heavy "are you sure?".
  const [undoId, setUndoId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The edit sheet is CadenceSheet, shared with the shared list, so a cadence set here and a cadence
  // set there can never drift apart. The drawer keeps only which task is being edited.
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Never leave the undo timer running past unmount.
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const editing = tasks.find((task) => task.id === editingId) ?? null;

  function startEdit(task: Task) {
    setEditingId(task.id);
  }

  function closeEdit() {
    setEditingId(null);
  }

  function removeSeries(task: Task) {
    onRemoveSeries(task.id);
    setUndoId(task.id);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoId(null), 6000);
  }

  function undoRemove() {
    const id = undoId;
    if (!id) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoId(null);
    onRestoreSeries(id);
  }

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
        {/* The naming fix. A repeating TASK and a NOTIFICATION are two different things, and the app
            calls both of them a kind of "reminder", so a person who sets a task to repeat can
            reasonably expect to be told when it is due, and then is not. That confusion is ours to
            fix, not theirs to work out. Said once here, where the expectation is actually formed,
            rather than renaming anything: "Repeating" is the right word, it just needed its limit
            stated, and it points at the two real ways to be notified. */}
        <Text style={styles.notNotify}>{t('repeat.notANotification')}</Text>
        {undoId != null && (
          <View style={styles.undoBar}>
            <Text style={styles.undoText}>{t('repeat.removed')}</Text>
            <Pressable onPress={undoRemove} accessibilityRole="button" accessibilityLabel={t('repeat.undoRemoveA11y')} hitSlop={8}>
              <Text style={styles.undoAction}>{t('common.undo')}</Text>
            </Pressable>
          </View>
        )}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {recurring.length === 0 ? (
            <Text style={styles.empty}>
              {t('repeat.empty')}
            </Text>
          ) : (
            recurring.map((task) => {
              const done = isDoneOn(task, today);
              return (
                <View key={task.id} style={styles.item}>
                  <Pressable
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
                  {/* Quiet series actions, siblings of the checkbox row (never nested Pressables).
                      Remove here means the WHOLE series, hence the undo; Today's remove only skips a day. */}
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => startEdit(task)}
                      accessibilityRole="button"
                      accessibilityLabel={t('repeat.editA11y', { title: task.title })}
                      hitSlop={6}
                    >
                      <Text style={styles.editAction}>{t('routines.edit')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeSeries(task)}
                      accessibilityRole="button"
                      accessibilityLabel={t('repeat.removeSeriesA11y', { title: task.title })}
                      hitSlop={6}
                    >
                      <Text style={styles.removeAction}>{t('common.remove')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>

      {/* THE cadence surface, shared with the room (components/CadenceSheet). Keyed on the task so
          each opening mounts fresh from that task's own cadence, rather than an effect resyncing
          fields behind the user. */}
      {editing && (
        <CadenceSheet
          key={editing.id}
          visible
          onClose={closeEdit}
          today={today}
          sheetTitle={t('repeat.editSheetTitle')}
          title={editing.title}
          recurrence={editing.recurrence}
          onSave={(title, recurrence) => onEditSeries(editing.id, title, recurrence)}
        />
      )}
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
  // Fainter than the subtitle: it is a clarification, not a warning, and nothing here is wrong.
  notNotify: { color: t.colors.inkFaint, fontSize: 13 * t.scale, lineHeight: 19 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
  // The brief undo bar after removing a series, one shape with routines.tsx's.
  undoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: t.colors.surface,
    borderRadius: radius.md,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
  },
  undoText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
  undoAction: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold },
  list: { marginTop: spacing.two },
  listContent: { gap: spacing.four, paddingBottom: spacing.six },
  empty: { color: t.colors.inkFaint, fontSize: 15 * t.scale, lineHeight: 22 * t.scale, marginTop: spacing.three, fontFamily: fonts.body },
  item: { gap: spacing.one },
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
  // The quiet per-series actions, indented under the row text (24 box + the row gap).
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.five, paddingLeft: 24 + spacing.three },
  editAction: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
  removeAction: { color: t.colors.danger, fontSize: 13 * t.scale, fontFamily: fonts.body },
  // The edit sheet (a ModalCard, since the drawer itself is too cramped to edit in).
});
