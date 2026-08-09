import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { TaskRow } from '@/components/TaskRow';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { loadMyPairs, type MyPair } from '@/lib/ours-api';
import { isSharedDoneOn, setSharedDone, type SharedTask } from '@/lib/ours-merge';
import { isUnreadableRepeat, POLL_MS, repeatSummaryOf, shouldPoll, syncPairOnce } from '@/lib/ours-sync';
import { loadOursTasks, saveOursTasks } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { makeId, nowMs, withMonotonicStamps } from '@/lib/tasks';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

// Ours: THE ROOM. The shared list itself, where the door on Today and the Menu both lead.
//
// Today's grammar, the same rows to the pixel, and deliberately PLAINER than Today: no weight
// gauge, no day tools, no motto. This is a list two people keep, not a day one person is getting
// through, and the calm here comes from it being less rather than more.
//
// The laws that shape every line of this file (docs/shared-lists.md §4):
//   · NOTHING attributes a row to a person. A done row is done, and there is no data to say by whom.
//   · NOTHING counts or compares. No progress across two people, no numbers anywhere.
//   · NOTHING animates because of the other person. No presence, no pulse on a change. You find
//     things different when you look, like a kitchen table.
//
// The relationship itself (rename, archive, leave, resume, delete) lives on /ours. Tapping the
// header line goes there, which is the design's own navigation: this screen is the tasks.

export default function OursListScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const session = useSession();
  const today = toISODate(new Date());

  const [pair, setPair] = useState<MyPair | null>(null);
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // Newest-issued-wins, the same guard the pairing screen needed: several call sites, a network
  // round trip in each, and whichever reply lands last would otherwise win regardless of age.
  const pass = useRef(0);
  const lastTouch = useRef(nowMs());

  /** Cache first, then reconcile. The list is on screen before the network is asked anything, which
   *  is the whole point of the local copy and the difference between opening a list and waiting. */
  const sync = useCallback(
    async (local?: SharedTask[]) => {
      const mine = ++pass.current;
      // Signed out (or no Supabase at all) is a FINISHED load, not a pending one. Returning without
      // saying so left this screen on a bare title forever, because the redirect below waits on
      // `loaded` and nothing else was ever going to set it.
      if (!supabase || !session) return setLoaded(true);
      const client = supabase;
      const res = await loadMyPairs(client, session.user.id);
      if (mine !== pass.current) return;
      const live = res.ok ? res.value.live : null;
      setPair(live);
      if (!live) return setLoaded(true);

      const cached = local ?? (await loadOursTasks(live.pairId));
      if (mine !== pass.current) return;
      setTasks(cached);
      setLoaded(true);

      try {
        const { merged } = await syncPairOnce(client, live.pairId, cached);
        if (mine !== pass.current) return;
        setTasks(merged);
        setOffline(false);
        void saveOursTasks(live.pairId, merged);
      } catch {
        // A failed READ keeps whatever is on screen. This list is somebody's household, and showing
        // it stale beats showing it empty; the line below says so rather than pretending.
        if (mine === pass.current) setOffline(true);
      }
    },
    [session],
  );

  useFocusEffect(
    useCallback(() => {
      void sync();
    }, [sync]),
  );

  // No live list, so there is no room to be in: /ours is where you belong, and it already knows how
  // to say every version of why (signed out, never paired, closed, partner gone). Deliberately NOT a
  // second empty state here, because two screens explaining the same absence is how they drift apart
  // and start contradicting each other. `replace`, so Back still leaves rather than bouncing.
  useEffect(() => {
    if (loaded && !pair) router.replace('/ours');
  }, [loaded, pair]);

  // Two people write this list, so the gap between their change and your screen is the window in
  // which you are looking at something untrue. Fifteen seconds while you are actually here, and the
  // rule is pure and tested in ours-sync: focused AND foregrounded AND not idle ten minutes.
  useEffect(() => {
    if (!pair) return;
    const timer = setInterval(() => {
      if (!shouldPoll(true, AppState.currentState === 'active', nowMs() - lastTouch.current)) return;
      void sync();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pair, sync]);

  /** Every write reconciles immediately rather than waiting for the poll: on a shared surface a
   *  fifteen-second lag reads as the other person having done something. */
  const commit = useCallback(
    async (next: SharedTask[]) => {
      lastTouch.current = nowMs();
      const stamped = withMonotonicStamps(next, tasks);
      setTasks(stamped);
      if (pair) void saveOursTasks(pair.pairId, stamped);
      await sync(stamped);
    },
    [pair, tasks, sync],
  );

  function add() {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    const now = nowMs();
    void commit([...tasks, { id: makeId(), title, done: false, createdAt: now, updatedAt: now }]);
  }

  function toggle(id: string) {
    const now = nowMs();
    void commit(tasks.map((task) => (task.id === id ? setSharedDone(task, today, !isSharedDoneOn(task, today), now) : task)));
  }

  /** Removal is a tombstone, never a delete: it is how the removal reaches the other person at all,
   *  and it is what Recently removed restores from. */
  function remove(id: string) {
    setConfirmingId(null);
    const now = nowMs();
    void commit(tasks.map((task) => (task.id === id ? { ...task, deletedAt: now, updatedAt: now } : task)));
  }

  function rename(id: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now = nowMs();
    void commit(tasks.map((task) => (task.id === id ? { ...task, title: trimmed, updatedAt: now } : task)));
  }

  const visible = tasks.filter((task) => !task.deletedAt);
  const listName = pair?.name?.trim() || t('ours.defaultName');

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.four }]}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => {
          lastTouch.current = nowMs();
        }}
      >
        <BackLink label={t('common.today')} />

        <Text style={styles.title}>{listName}</Text>
        {/* The header line is the door to the relationship: rename yourself, the archive, leaving.
            One line, and it names your person rather than counting anything. */}
        {pair?.partnerLabel ? (
          <Pressable
            onPress={() => router.push('/ours')}
            accessibilityRole="button"
            accessibilityLabel={t('ours.keptWith', { name: pair.partnerLabel })}
            hitSlop={6}
          >
            <Text style={styles.keptWith}>{t('ours.keptWith', { name: pair.partnerLabel })} ›</Text>
          </Pressable>
        ) : null}

        {offline ? <Text style={styles.offline}>{t('ours.errOffline')}</Text> : null}

        {loaded && visible.length === 0 ? <Text style={styles.empty}>{t('ours.listEmpty')}</Text> : null}

        {visible.map((task) => (
          <View key={task.id} style={styles.row}>
            <TaskRow
              title={task.title}
              done={isSharedDoneOn(task, today)}
              onToggle={() => toggle(task.id)}
              onLongPress={() => setConfirmingId(task.id)}
              confirming={confirmingId === task.id}
              onRemove={() => remove(task.id)}
              onKeep={() => setConfirmingId(null)}
              recurring={task.recurrence !== undefined && task.recurrence.kind !== 'none'}
              onRename={(next) => rename(task.id, next)}
            />
            {/* A cadence this build cannot read: SHOWN, never hidden, because hiding it means one
                person sees the task and the other does not and each concludes the other deleted it.
                Inert, with whatever plain-English line the writing app left. */}
            {isUnreadableRepeat(task) ? (
              <Text style={styles.cadenceNote}>{repeatSummaryOf(task) ?? t('ours.repeatUnknown')}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* The capture bar speaks the list's name, so it is obvious which room you are typing into. */}
      <View style={[styles.capture, { paddingBottom: insets.bottom + spacing.three }]}>
        <TextInput
          value={draft}
          onChangeText={(v) => {
            lastTouch.current = nowMs();
            setDraft(v);
          }}
          onSubmitEditing={add}
          placeholder={t('ours.addTo', { name: listName })}
          placeholderTextColor={theme.colors.inkFaint}
          style={styles.input}
          accessibilityLabel={t('ours.addTo', { name: listName })}
          returnKeyType="done"
          blurOnSubmit={false}
        />
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: spacing.five,
      paddingBottom: spacing.six,
      maxWidth: layout.maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
    title: { ...t.type.title, color: t.colors.ink, marginTop: spacing.three },
    keptWith: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, marginTop: spacing.one },
    offline: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.three },
    empty: {
      color: t.colors.inkSoft,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 24 * t.scale,
      marginTop: spacing.six,
    },
    row: { marginTop: spacing.two },
    cadenceNote: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 19 * t.scale,
      marginTop: spacing.one,
      marginLeft: spacing.five,
    },
    capture: {
      paddingHorizontal: spacing.five,
      paddingTop: spacing.three,
      borderTopWidth: border.hair,
      borderTopColor: t.colors.line,
      backgroundColor: t.colors.bg,
    },
    input: {
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      maxWidth: layout.maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
  });
