import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { CadenceSheet } from '@/components/CadenceSheet';
import { TaskRow } from '@/components/TaskRow';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { toISODate } from '@/lib/day';
import { type Recurrence } from '@/lib/recurrence';
import { t } from '@/lib/locale';
import { makeSharedRef, pulledFrom } from '@/lib/ours-bridge';
import { loadMyPairs, type MyPair } from '@/lib/ours-api';
import { isSharedDoneOn, setSharedDone, type SharedTask, washedSince } from '@/lib/ours-merge';
import { isUnreadableRepeat, POLL_MS, repeatSummaryOf, shouldPoll, syncPairOnce, willTrim } from '@/lib/ours-sync';
import { clearOursMine, loadOursMine, loadOursSeen, loadOursTasks, loadTasks, markOursSeen, saveOursTasks, saveTasks } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { makeId, nowMs, type Task, withMonotonicStamps } from '@/lib/tasks';
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
  const [notice, setNotice] = useState<string | null>(null); // one calm line, for things worth saying once
  // Newest-issued-wins, the same guard the pairing screen needed: several call sites, a network
  // round trip in each, and whichever reply lands last would otherwise win regardless of age.
  const pass = useRef(0);
  const lastTouch = useRef(nowMs());
  // The quiet wash. `seenAt` is frozen for the whole visit (read once, on the first load) so that
  // marking the list as looked-at does not instantly clear the very tint it was meant to show. `mine`
  // is every row I write while I am here, subtracted so my own edits never wash.
  // Whether the membership read has ever SUCCEEDED. The redirect waits on this, so a dropped signal
  // can never be mistaken for "this list is not yours".
  const readOk = useRef(false);
  const focused = useRef(false); // real focus, fed to shouldPoll, which is what its first argument is for
  const seenAt = useRef(0);
  const mine = useRef<Set<string>>(new Set());
  const [washed, setWashed] = useState<ReadonlySet<string>>(new Set());
  // Which rows are already on my own Today, so "Bring to my Today" can say so rather than quietly
  // making a second copy. My tasks, read here only to answer that one question.
  const [pulled, setPulled] = useState<Map<string, string>>(new Map());
  const [cadenceId, setCadenceId] = useState<string | null>(null); // the row whose rhythm is being set

  /** Cache first, then reconcile. The list is on screen before the network is asked anything, which
   *  is the whole point of the local copy and the difference between opening a list and waiting. */
  const sync = useCallback(
    async (local?: SharedTask[]) => {
      const call = ++pass.current;
      // Signed out (or no Supabase at all) is a FINISHED load, not a pending one. Returning without
      // saying so left this screen on a bare title forever, because the redirect below waits on
      // `loaded` and nothing else was ever going to set it.
      if (!supabase || !session) return setLoaded(true);
      const client = supabase;
      const res = await loadMyPairs(client, session.user.id);
      if (call !== pass.current) return;
      // A FAILED read is not "you have no shared list". Treating it as one nulled the pair, which
      // fired the redirect below and threw the user out of the room onto the pairing screen, on a
      // dropped signal. Keep whatever is on screen, say so quietly, and try again on the next poll:
      // exactly how the task read below already behaves.
      if (!res.ok) {
        setOffline(true);
        return setLoaded(true);
      }
      readOk.current = true;
      const live = res.value.live;
      setPair(live);
      if (!live) return setLoaded(true);

      if (seenAt.current === 0) {
        seenAt.current = (await loadOursSeen())[live.pairId] ?? 0;
        // Rows I changed from Today since I was last here. Without these, my own tick on a brought
        // copy comes back tinted as my person's change, which is the room inventing an event.
        for (const id of await loadOursMine(live.pairId)) mine.current.add(id);
      }
      setPulled(pulledFrom(await loadTasks(), live.pairId));

      const cached = local ?? (await loadOursTasks(live.pairId));
      if (call !== pass.current) return;
      setTasks(cached);
      setWashed(washedSince(cached, seenAt.current, mine.current));
      setLoaded(true);

      try {
        const { merged } = await syncPairOnce(client, live.pairId, cached);
        if (call !== pass.current) return;
        setTasks(merged);
        setWashed(washedSince(merged, seenAt.current, mine.current));
        setOffline(false);
        void saveOursTasks(live.pairId, merged);
        // Looked at, now. Written on every reconcile rather than on the way out, because the way out
        // of a screen on a phone is often the app being killed, and a wash that never clears is a
        // permanent "something happened" badge, which is the anxiety this was built to bound.
        void markOursSeen(live.pairId, nowMs());
        void clearOursMine(live.pairId); // from here the last-look covers those writes
      } catch {
        // A failed READ keeps whatever is on screen. This list is somebody's household, and showing
        // it stale beats showing it empty; the line below says so rather than pretending.
        if (call === pass.current) setOffline(true);
      }
    },
    [session],
  );

  useFocusEffect(
    useCallback(() => {
      // A fresh look. Dropping both makes "gone next open" literally true rather than true only when
      // the OS happened to unmount the screen: arriving re-reads the stored last-look (which the
      // reconcile below then moves forward), so yesterday's wash cannot still be sitting there.
      seenAt.current = 0;
      mine.current = new Set();
      focused.current = true;
      void sync();
      return () => {
        focused.current = false;
      };
    }, [sync]),
  );

  // No live list, so there is no room to be in: /ours is where you belong, and it already knows how
  // to say every version of why (signed out, never paired, closed, partner gone). Deliberately NOT a
  // second empty state here, because two screens explaining the same absence is how they drift apart
  // and start contradicting each other. `replace`, so Back still leaves rather than bouncing.
  useEffect(() => {
    if (loaded && readOk.current && !pair) router.replace('/ours');
  }, [loaded, pair]);

  // Two people write this list, so the gap between their change and your screen is the window in
  // which you are looking at something untrue. Fifteen seconds while you are actually here, and the
  // rule is pure and tested in ours-sync: focused AND foregrounded AND not idle ten minutes.
  useEffect(() => {
    if (!pair) return;
    const timer = setInterval(() => {
      if (!shouldPoll(focused.current, AppState.currentState === 'active', nowMs() - lastTouch.current)) return;
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
      for (const task of stamped) {
        const before = tasks.find((prev) => prev.id === task.id);
        if (!before || before.updatedAt !== task.updatedAt) mine.current.add(task.id);
      }
      setWashed(washedSince(stamped, seenAt.current, mine.current));
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
    if (willTrim(title)) setNotice(t('ours.shareTrim')); // said BEFORE, never discovered after
    const now = nowMs();
    void commit([...tasks, { id: makeId(), title, done: false, createdAt: now, updatedAt: now }]);
  }

  function toggle(id: string) {
    const found = tasks.find((task) => task.id === id);
    // A cadence this build cannot read has NO recurrence object, so every done-helper treats it as a
    // one-off: one tap would mark it finished forever, for both of you, on a task that was supposed
    // to come back. Inert is the only honest state, and the line under the row says why.
    if (!found || isUnreadableRepeat(found)) return;
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
    if (willTrim(trimmed)) setNotice(t('ours.shareTrim'));
    const now = nowMs();
    void commit(tasks.map((task) => (task.id === id ? { ...task, title: trimmed, updatedAt: now } : task)));
  }

  /**
   * Bring a copy over. A COPY, and the word is load-bearing: the shared row is untouched and stays
   * exactly as it was for both of you. Nothing crosses without a person choosing it, and choosing it
   * must not quietly change the thing you chose.
   *
   * The shared row gets NO marker. "Somebody pulled this" is one inference away from "somebody", and
   * attribution through the side door is still attribution.
   */
  async function bring(task: SharedTask) {
    if (!pair || pulled.has(task.id)) return;
    const now = nowMs();
    const mineNow = await loadTasks();
    // Re-checked against fresh storage rather than the state above: two taps land inside one render.
    if (pulledFrom(mineNow, pair.pairId).has(task.id)) return setPulled(pulledFrom(mineNow, pair.pairId));
    const copy: Task = {
      id: makeId(),
      title: task.title,
      done: false,
      due: today,
      createdAt: now,
      updatedAt: now,
      sharedRef: makeSharedRef(pair.pairId, task.id),
    };
    const next = [...mineNow, copy];
    await saveTasks(next);
    setPulled(pulledFrom(next, pair.pairId));
    setConfirmingId(null);
  }

  /** Set a rhythm. THE cadence sheet, the same one the personal Repeating drawer opens, so a repeat
   *  made here, made there, made by the REST API or made by an agent over MCP is one shape. */
  function setCadence(id: string, title: string, recurrence: Recurrence) {
    const now = nowMs();
    setCadenceId(null);
    // A dated one-off and a repeat are mutually exclusive everywhere else in this app (the API
    // enforces it, MCP enforces it), so setting a rhythm clears any raw cadence a newer build left.
    void commit(tasks.map((task) => (task.id === id ? { ...task, title, recurrence, rawRecurrence: undefined, updatedAt: now } : task)));
  }

  const cadenceTask = tasks.find((task) => task.id === cadenceId) ?? null;
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
        {notice ? (
          <Pressable onPress={() => setNotice(null)} accessibilityRole="button" accessibilityLabel={t('common.gotIt')} hitSlop={6}>
            <Text style={styles.offline}>{notice}</Text>
          </Pressable>
        ) : null}

        {loaded && visible.length === 0 ? <Text style={styles.empty}>{t('ours.listEmpty')}</Text> : null}

        {visible.map((task) => (
          <View key={task.id} style={[styles.row, washed.has(task.id) && styles.washed]}>
            <TaskRow
              title={task.title}
              done={isSharedDoneOn(task, today)}
              /* The wash in WORDS as well as colour. It says a thing happened and never who did
                 it, which is the same line the tint draws. */
              note={washed.has(task.id) ? t('ours.changedSince') : undefined}
              onToggle={() => toggle(task.id)}
              onLongPress={() => setConfirmingId(task.id)}
              confirming={confirmingId === task.id}
              onRemove={() => remove(task.id)}
              onKeep={() => setConfirmingId(null)}
              recurring={task.recurrence !== undefined && task.recurrence.kind !== 'none'}
              onRename={(next) => rename(task.id, next)}
              onBring={() => void bring(task)}
              brought={pulled.has(task.id)}
              /* A cadence this build cannot read stays INERT: re-cadencing it would overwrite
                 whatever a newer build meant, on a list somebody else also keeps. */
              onRepeat={isUnreadableRepeat(task) ? undefined : () => setCadenceId(task.id)}
              inert={isUnreadableRepeat(task) ? t('ours.repeatUnknown') : undefined}
              /* The shared list has no per-day skip, so Remove must not borrow "Skip today": it ends
                 the repeat, for both of you. The label says what the button does. */
              removesWholeSeries
            />
            {/* A cadence this build cannot read: SHOWN, never hidden, because hiding it means one
                person sees the task and the other does not and each concludes the other deleted it.
                Inert, with whatever plain-English line the writing app left. */}
            {isUnreadableRepeat(task) ? (
              <Text style={styles.cadenceNote}>
                {repeatSummaryOf(task) ? `${repeatSummaryOf(task)}  ·  ` : ''}
                {t('ours.repeatUnknown')}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {cadenceTask && (
        <CadenceSheet
          key={cadenceTask.id}
          visible
          onClose={() => setCadenceId(null)}
          today={new Date()}
          sheetTitle={t('repeat.editSheetTitle')}
          title={cadenceTask.title}
          recurrence={cadenceTask.recurrence}
          /* The one line that is true here and nowhere else. Not a warning, and never a count: it
             says what will happen, which is the whole of what anyone needs before committing. */
          note={t('ours.repeatNote')}
          onSave={(title, recurrence) => setCadence(cadenceTask.id, title, recurrence)}
        />
      )}

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
    row: {
      marginTop: spacing.two,
      borderRadius: radius.md,
      borderWidth: border.hair,
      borderColor: 'transparent',
      // Padding, so a washed row's tint shows as a band AROUND the card rather than hiding behind
      // the card's own opaque background, where it rendered as nothing at all.
      paddingHorizontal: spacing.one,
      paddingVertical: spacing.one,
    },
    // Changed since you last looked. A tint and a slightly firmer edge, and nothing else: it is
    // static by design, because nothing in this room may ever animate because of the other person.
    washed: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
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
