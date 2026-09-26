// Repeating, as a room (the Rise and Rooms handoff, 2026-09-26). It used to be a drawer that slid in over
// Today, living on Today's own state, and the Menu had to hand it back to Today to open it. Now it is a
// route like Routines: the same top, the same entry, the same back. What moved in, moved in as it was:
// the tick, the title, the cadence line, Edit (CadenceSheet, the one cadence surface in the app) and
// Remove with its undo. Removal stays here, never in the sheet.
//
// This is where the SERIES is managed. Today manages days (its Remove only skips today's instance).
//
// There is deliberately no "+ New" here. Repeating tasks are made from capture's When, and a second way to
// make the same thing would drift from the first.

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import bandArt from '../../assets/images/rooms/band-repeating.webp';
import { CadenceSheet } from '@/components/CadenceSheet';
import { CheckCircle } from '@/components/CheckCircle';
import { RoomBackRow, RoomHead, RoomIntro, useRoomEntrance, useRoomOrigin } from '@/components/RoomTop';
import { border, cardShadow, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { mirrorTickToShared } from '@/lib/ours-tick';
import { describeRecurrence, type Recurrence } from '@/lib/recurrence';
import { groupRepeating } from '@/lib/repeating';
import { loadTasks } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { editSeriesIn, removeSeriesIn, restoreSeriesIn, toggleIn, updateStoredTasks } from '@/lib/task-writes';
import { type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useThemedStyles } from '@/lib/theme-provider';
import { isDoneOn } from '@/lib/today';

// The circle is a TASK's tick (routine steps keep their squares), at the size the drawer had.
const TICK = 24;

export default function RepeatingScreen() {
  const insets = useSafeAreaInsets();
  const origin = useRoomOrigin();
  const entrance = useRoomEntrance();
  const styles = useThemedStyles(makeStyles);
  // null until the first read lands, so the empty line never flashes over a list that is on its way.
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [today, setToday] = useState(() => new Date());
  // The edit sheet is CadenceSheet, shared with the shared list, so a cadence set here and one set there
  // can never drift apart. The room keeps only which task is being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Removing a series is recoverable, not a confirmation gauntlet: a brief undo line (the same shape as
  // Routines') instead of a heavy "are you sure?".
  const [undoId, setUndoId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-read on every focus, not only on mount: Today, a sync or an agent may have changed the list
  // since this room last looked, and a remount is not guaranteed on native.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setToday((prev) => (toISODate(prev) === toISODate(new Date()) ? prev : new Date()));
      void loadTasks().then((stored) => {
        if (active) setTasks(stored);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // Never leave the undo timer running past unmount.
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // Every change goes through the one write path Today uses (lib/task-writes), applied to the list as it
  // is stored NOW, so this room can never write differently from Today or over something Today wrote.
  async function write(change: (list: Task[]) => Task[]): Promise<Task[] | null> {
    const next = await updateStoredTasks(change, tasks ?? []).catch(() => null);
    if (next) setTasks(next);
    return next;
  }

  async function toggle(id: string) {
    const next = await write((list) => toggleIn(list, id, today));
    if (!next) return;
    const task = next.find((x) => x.id === id);
    const done = task ? isDoneOn(task, today) : false;
    // Your tick closes both, and un-ticking re-opens both, exactly as it does from Today.
    if (task?.sharedRef) void mirrorTickToShared(supabase, task.sharedRef, today, done);
    // The moat starts at the call site: log the outcome, not just "done".
    track('task.toggled', { done });
  }

  function editSeries(id: string, title: string, recurrence: Recurrence) {
    void write((list) => editSeriesIn(list, id, title, recurrence));
    track('repeat.series_edited');
  }

  function removeSeries(task: Task) {
    void write((list) => removeSeriesIn(list, task.id));
    track('repeat.series_removed');
    setUndoId(task.id);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoId(null), 6000);
  }

  function undoRemove() {
    const id = undoId;
    if (!id) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoId(null);
    void write((list) => restoreSeriesIn(list, id));
    track('repeat.remove.undone');
  }

  const groups = groupRepeating(tasks ?? []);
  const editing = tasks?.find((task) => task.id === editingId) ?? null;

  return (
    <Animated.View style={[styles.screen, entrance]}>
      {/* The room top: the back row stays put, the band and title scroll away with the list. */}
      <View style={{ paddingTop: insets.top + spacing.two }}>
        <RoomBackRow origin={origin} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: spacing.one, paddingBottom: insets.bottom + spacing.seven }]}>
        <RoomHead art={bandArt} title={t('repeat.title')} hint={t('rooms.repeatingHint')} />

        {undoId != null && (
          <View style={styles.undoBar}>
            <Text style={styles.undoText}>{t('repeat.removed')}</Text>
            <Pressable onPress={undoRemove} accessibilityRole="button" accessibilityLabel={t('repeat.undoRemoveA11y')} hitSlop={8}>
              <Text style={styles.undoAction}>{t('common.undo')}</Text>
            </Pressable>
          </View>
        )}

        {tasks != null && groups.length === 0 && <RoomIntro style={styles.empty}>{t('repeat.empty')}</RoomIntro>}

        {groups.map((group) => (
          <View key={group.kind} style={styles.group}>
            <Text style={styles.groupHeading} accessibilityRole="header">
              {t(group.labelKey)}
            </Text>
            <View style={styles.card}>
              {group.items.map((task, i) => {
                const done = isDoneOn(task, today);
                return (
                  <View key={task.id} style={[styles.row, i > 0 && styles.rowRule]}>
                    <Pressable
                      onPress={() => void toggle(task.id)}
                      style={styles.rowTick}
                      accessibilityRole="checkbox"
                      aria-checked={done}
                      accessibilityLabel={task.title}
                    >
                      <CheckCircle done={done} size={TICK} />
                      <Text style={[styles.rowTitle, done && styles.rowTitleDone]}>{task.title}</Text>
                    </Pressable>
                    {/* The quiet series actions, siblings of the tick (never nested Pressables), on the
                        cadence line. Remove here means the WHOLE series, hence the undo; Today's
                        remove only skips a day. */}
                    <View style={styles.meta}>
                      <Text style={styles.cadence}>{task.recurrence ? describeRecurrence(task.recurrence, today) : ''}</Text>
                      <Pressable
                        onPress={() => setEditingId(task.id)}
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
              })}
            </View>
          </View>
        ))}

        {/* The naming fix, now at the foot. A repeating TASK and a NOTIFICATION are two different
            things, and the app calls both a kind of "reminder", so someone who sets a task to repeat
            can reasonably expect to be told when it is due, and then is not. Said once, where the
            expectation forms, and pointing at the two real ways to be told. Web has no Remind me on the
            held card, so there the sentence must not point at it. */}
        {tasks != null && <Text style={styles.note}>{Platform.OS === 'web' ? t('repeat.notANotificationWeb') : t('repeat.notANotification')}</Text>}
      </ScrollView>

      {/* THE cadence surface (components/CadenceSheet), with the drawer's props. Keyed on the task so
          each opening mounts fresh from that task's own cadence, rather than an effect resyncing fields
          behind the user. `allowNone` stays off: an entry here IS a rhythm, and "no rhythm" would mean
          the entry should not exist, which is removal, which lives in this room and not in the sheet. */}
      {editing && (
        <CadenceSheet
          key={editing.id}
          visible
          onClose={() => setEditingId(null)}
          today={today}
          sheetTitle={t('repeat.editSheetTitle')}
          title={editing.title}
          recurrence={editing.recurrence}
          onSave={(title, answer) => editSeries(editing.id, title, answer.recurrence)}
        />
      )}
    </Animated.View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, gap: spacing.three, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    // The brief undo line after removing a series, one shape with Routines'.
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
    empty: { marginTop: spacing.three },
    group: { gap: 10, marginTop: spacing.three },
    groupHeading: { color: t.colors.inkSoft, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    // One card per group, its rows split by hairlines: the Routines card, holding rows instead of steps.
    card: {
      backgroundColor: t.colors.surfaceCard,
      borderRadius: radius.lg,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.half,
      boxShadow: cardShadow(t),
    },
    row: { paddingVertical: spacing.three },
    rowRule: { borderTopWidth: border.hair, borderTopColor: t.colors.line },
    rowTick: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.three },
    rowTitle: { flex: 1, color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 22 * t.scale, fontFamily: fonts.body, paddingTop: 1 },
    // The one done sign: soft ink, never struck through (the tick carries the accent).
    rowTitleDone: { color: t.colors.inkSoft },
    // The cadence line and the two quiet actions, under the title and indented to it. It wraps at large
    // text rather than squeezing the cadence.
    meta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: spacing.four,
      rowGap: spacing.half,
      marginTop: spacing.half,
      paddingLeft: TICK + spacing.three,
    },
    cadence: { flexGrow: 1, flexShrink: 1, color: t.colors.inkSoft, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body },
    editAction: { color: t.colors.accent, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body },
    removeAction: { color: t.colors.danger, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body },
    // Fainter than the list and set apart from it: a clarification, not a warning, and nothing here is wrong.
    note: { color: t.colors.inkSoft, fontSize: 13.5 * t.scale, lineHeight: 13.5 * 1.55 * t.scale, fontFamily: fonts.body, marginTop: spacing.three, paddingHorizontal: spacing.half },
  });
