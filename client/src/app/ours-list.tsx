import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { CadenceSheet } from '@/components/CadenceSheet';
import { TaskRow } from '@/components/TaskRow';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSessionState } from '@/lib/auth';
import { clockSkewMs } from '@/lib/clock';
import { toISODate } from '@/lib/day';
import { type Recurrence } from '@/lib/recurrence';
import { t } from '@/lib/locale';
import { makeSharedRef, pulledFrom } from '@/lib/ours-bridge';
import { loadMyPairs, type MyPair, syncClock } from '@/lib/ours-api';
import { isSharedDoneOn, setSharedDone, type SharedTask, washedSince } from '@/lib/ours-merge';
import { isUnreadableRepeat, onSharedListOn, POLL_MS, repeatSummaryOf, shouldPoll, syncPairOnce, willTrim } from '@/lib/ours-sync';
import { clearOursMine, loadOursMine, loadOursSeen, loadOursTasks, loadTasks, markOursSeen, noteOursMine, pruneOursCache, saveOursTasks, saveTasks } from '@/lib/storage';
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
//
// Seven days of Recently removed, matching the server's own tombstone sweep, so the fold never
// offers to restore something the sweep has already redacted.
const RECENTLY_REMOVED_MS = 7 * 24 * 60 * 60_000;

/**
 * How long the quiet wash stays before it takes itself away.
 *
 * Melroy, 2026-08-09, having used it: "APPEAR and then DISAPPEAR. Staying is not good." He is right,
 * and the original "gone next open" was worse than it sounded: a mark that sits there for the whole
 * visit stops being information and becomes furniture you are reading around.
 *
 * It vanishes rather than fading. No motion at all, so the law that nothing animates because of the
 * other person stays literally true, and this audience gets no movement it did not cause. Eight
 * seconds is long enough to scan a household list and short enough that nobody sits waiting on it.
 */
const WASH_LINGER_MS = 8_000;

/** Closed, either because you two closed it or because it was disabled. One definition, used by
 *  every write path on this screen rather than only the ones a prop happened to be threaded to. */
function isPairFrozen(pair: MyPair | null): boolean {
  return !!(pair?.closedAt || pair?.disabledAt);
}

export default function OursListScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { session, known: sessionKnown } = useSessionState();
  // One Date for the whole render, so the ISO day and the cadence placement can never disagree
  // across a midnight tick mid-render.
  const now = useMemo(() => new Date(), []);
  const today = toISODate(now);
  // The archive opens a CLOSED list here by id. Without it the room only ever shows the live one,
  // and "you can still read everything" would have been a promise with nowhere to keep it.
  const { pair: wantedId } = useLocalSearchParams<{ pair?: string }>();

  const [pair, setPair] = useState<MyPair | null>(null);
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // The push failed while the pull worked: my change is on this device and NOT on theirs.
  // `syncPairOnce` has always returned this and nothing has ever read it, which is precisely why a
  // tick could sit looking finished on one phone and never arrive on the other, with no signal to
  // the user OR to me. Silence was the bug underneath several of tonight's bugs.
  const [unpushed, setUnpushed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); // one calm line, for things worth saying once
  // The keyboard lift. NOTHING on this stack raises a bottom-anchored input above the keyboard on
  // its own: SDK 5x Android is edge-to-edge and ignores softwareKeyboardLayoutMode, and there is no
  // KeyboardAvoidingView here. Today already carries this exact listener for the same reason (see
  // CLAUDE.md's keyboard gotcha, which cost a whole tester round), and the room's capture bar is a
  // new bottom-anchored surface that can hold focus, so it needs the same plan.
  const [kbHeight, setKbHeight] = useState(0);
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
  const clockSynced = useRef(false); // the server-time read, once per visit
  // The list this visit is actually looking at, so a change in its liveness cannot silently swap it.
  const openId = useRef<string | null>(null);
  const focused = useRef(false); // real focus, fed to shouldPoll, which is what its first argument is for
  const seenAt = useRef(0);
  const mine = useRef<Set<string>>(new Set());
  const [washed, setWashed] = useState<ReadonlySet<string>>(new Set());
  // Rows that have ALREADY had their eight seconds this visit, and must never light up again.
  //
  // Without this the wash STROBES. `seenAt` is deliberately frozen for the visit, so every poll
  // recomputes the same "changed since you last looked" set, and once the linger clears it the next
  // poll lights the identical row again: on, off, on, off, every fifteen seconds. Melroy watching it
  // said "every time it's polling, it's just randomly highlighting that task", which is exactly what
  // a fifteen-second strobe looks like from the outside. Flashing at somebody is the worst possible
  // failure on a screen built for people who cannot filter movement out.
  //
  // Keyed by STAMP, not merely by id. Excluding an id outright killed the strobe and the signal with
  // it: a row that changed a second time in the same visit stayed dark, so a partner ticking and
  // then un-ticking showed once and then went silent. Remembering the `updatedAt` it was last shown
  // at draws the line exactly where it belongs: the SAME change never lights twice, a NEW change
  // always does.
  const washedAlready = useRef<Map<string, number>>(new Map());
  // The current rows, for the linger timer, which must not depend on `tasks` or it restarts on
  // every sync and never fires.
  const tasksRef = useRef<SharedTask[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  });

  // Shown, then gone, then never again this visit.
  useEffect(() => {
    if (washed.size === 0) return;
    const timer = setTimeout(() => {
      for (const id of washed) {
        washedAlready.current.set(id, tasksRef.current.find((task) => task.id === id)?.updatedAt ?? nowMs());
      }
      setWashed(new Set());
    }, WASH_LINGER_MS);
    return () => clearTimeout(timer);
  }, [washed]);

  /** The wash for a freshly merged list, minus anything already shown. One helper, because getting
   *  this subtraction right in one of the two call sites and not the other is how a strobe returns. */
  const washFor = useCallback((rows: SharedTask[]) => {
    const next = new Set(washedSince(rows, seenAt.current, mine.current));
    // Every input to the decision, in one line. Tonight cost hours because a wash that did not
    // happen looked identical to a wash that was excluded, a stale last-look, and a clock skew.
    console.debug('[ours] wash', { seenAt: seenAt.current, skewMs: clockSkewMs(), rows: rows.length, mine: mine.current.size, shown: washedAlready.current.size, lit: next.size });
    for (const row of rows) {
      const shownAt = washedAlready.current.get(row.id);
      if (shownAt !== undefined && row.updatedAt <= shownAt) next.delete(row.id);
    }
    return next;
  }, []);
  // Which rows are already on my own Today, so "Bring to my Today" can say so rather than quietly
  // making a second copy. My tasks, read here only to answer that one question.
  const [pulled, setPulled] = useState<Map<string, string>>(new Map());
  const [cadenceId, setCadenceId] = useState<string | null>(null); // the row whose rhythm is being set
  // Capture-time repeating. Today's capture bar has a WHEN · REPEATING · STEPS door; this one had
  // nothing, so the only way to make a repeating shared task was to add it and then know to
  // long-press it. Melroy hit exactly that and reported "there is no way to add Repeating Tasks",
  // which is true of the only path anybody would look for.
  const [captureRepeat, setCaptureRepeat] = useState(false);

  /** Cache first, then reconcile. The list is on screen before the network is asked anything, which
   *  is the whole point of the local copy and the difference between opening a list and waiting. */
  const sync = useCallback(
    async (local?: SharedTask[]) => {
      const call = ++pass.current;
      // NOT YET KNOWN is not the same as signed out, and conflating them made opening your own list
      // a loop: `useSession` returns null while it hydrates, this branch called that signed-out, and
      // the redirect below sent you back to the pairing screen before the session ever arrived.
      // Wait instead. The callback re-runs the moment the answer lands, because `known` is a dep.
      if (!sessionKnown) return;

      // NOW it is definitive. Signed out is a FINISHED load, and `readOk` too, because there is no
      // read to fail: a signed-out visitor belongs on /ours, which explains why.
      if (!supabase || !session) {
        readOk.current = true;
        return setLoaded(true);
      }
      const client = supabase;
      const res = await loadMyPairs(client, session.user.id);
      if (call !== pass.current) return;
      // A FAILED read is not "you have no shared list". Treating it as one nulled the pair, which
      // fired the redirect below and threw the user out of the room onto the pairing screen, on a
      // dropped signal. Keep whatever is on screen, say so quietly, and try again on the next poll:
      // exactly how the task read below already behaves.
      if (!res.ok) {
        setOffline(true);
        // NOT `loaded` unless something is already on screen. An unresolved list rendering as an
        // empty writable one invited somebody to type into a room that does not exist, and every
        // word of it went nowhere: `commit` needs a pairId to save against and silently had none.
        return setLoaded(pair !== null);
      }
      readOk.current = true;
      // ONE clock for both devices, once per visit. Every stamp this screen writes or compares
      // (the completion log, the last-look, last-write-wins) is a number from a device clock, and
      // two people means two clocks. Once per visit rather than per poll: skew does not move fast,
      // and this is a round trip on a screen somebody opened to tick the milk.
      if (!clockSynced.current) {
        clockSynced.current = true;
        await syncClock(client);
        if (call !== pass.current) return;
      }
      const { live, frozen } = res.value;
      const all = [live, ...frozen];
      // A named list wins, live or closed: that is the archive asking for a specific one. Otherwise
      // the list you are ALREADY looking at, then the live one, then nothing.
      //
      // Holding onto the open list is what stops your person leaving mid-visit from yanking the
      // screen out from under you: the list is no longer `live`, so a plain `live` would go null,
      // fire the redirect, and throw you to the pairing screen in the middle of reading. It closes
      // in place instead, which is exactly what "reads stay, writes stop" was supposed to mean.
      const held = openId.current ? (all.find((p) => p?.pairId === openId.current) ?? null) : null;
      const chosen = wantedId ? (all.find((p) => p?.pairId === wantedId) ?? null) : (held ?? live);
      openId.current = chosen?.pairId ?? null;
      setPair(chosen);
      if (!chosen) return setLoaded(true);
      const live_ = chosen;

      if (seenAt.current === 0) {
        seenAt.current = (await loadOursSeen())[live_.pairId] ?? 0;
        // Rows I changed from Today since I was last here. Without these, my own tick on a brought
        // copy comes back tinted as my person's change, which is the room inventing an event.
        for (const id of await loadOursMine(live_.pairId)) mine.current.add(id);
        // NOTHING is seeded from `pulledFrom` here, and the removal is the fix for the worst wash
        // bug of the dogfood: Device A never highlighted anything, ever, while Device B worked.
        //
        // The old line excluded every shared row that has a copy on my Today, reasoning that a
        // brought copy proves the row is mine. It proves nothing of the sort. BRINGING A ROW OVER IS
        // A READ. On the device where somebody actually uses the bridge, that is most of the list,
        // so most of the list could never wash again on the one device most likely to want it.
        //
        // `oursMine` (rows I genuinely WROTE from Today) stays, and it is the honest mechanism. The
        // gap it leaves is that a tick I made on my other device may wash here once. That is a tint
        // too many for eight seconds, against never highlighting at all.
      }
      setPulled(pulledFrom(await loadTasks(), live_.pairId));

      const cached = local ?? (await loadOursTasks(live_.pairId));
      if (call !== pass.current) return;
      setTasks(cached);
      setWashed(washFor(cached));
      setLoaded(true);

      try {
        const { merged, pushError } = await syncPairOnce(client, live_.pairId, cached);
        if (call !== pass.current) return;
        if (pushError) console.warn('[ours] push failed, changes are local only', pushError);
        setUnpushed(Boolean(pushError));
        setTasks(merged);
        setWashed(washFor(merged));
        setOffline(false);
        void saveOursTasks(live_.pairId, merged);
        // Looked at, now. Written on every reconcile rather than on the way out, because the way out
        // of a screen on a phone is often the app being killed, and a wash that never clears is a
        // permanent "something happened" badge, which is the anxiety this was built to bound.
        //
        // Plain corrected NOW, and nothing clever. This used to take the later of my clock and the
        // newest row present, which was a patch over two devices disagreeing about the time. With
        // `syncClock` above there is one clock, so the patch is not merely unnecessary: it is
        // actively harmful, because it swallows any legacy row still carrying a future stamp from
        // before the correction and, since the last-look can never move backwards, pins this device
        // permanently in the future. Both devices stopped washing the moment the clock landed.
        void markOursSeen(live_.pairId, nowMs());
        void clearOursMine(live_.pairId); // from here the last-look covers those writes
        // Cached rows for lists this account no longer belongs to are ANOTHER PERSON'S WORDS on
        // this device, with nothing left pointing at them. `pruneOursCache` existed for exactly
        // this and had no caller anywhere, so leaving or deleting a list left its contents behind.
        void pruneOursCache(all.filter((p): p is MyPair => p != null).map((p) => p.pairId));
      } catch {
        // A failed READ keeps whatever is on screen. This list is somebody's household, and showing
        // it stale beats showing it empty; the line below says so rather than pretending.
        if (call === pass.current) setOffline(true);
      }
    },
    [session, sessionKnown, wantedId, pair, washFor],
  );

  // iOS uses the will-events; the did-events land after the animation and read as lag.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKbHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // The live sync, held in a ref so the two effects below can depend on NOTHING that changes.
  //
  // This is the whole bug: `sync` calls `setPair` with a fresh object every run, so `pair` changed
  // identity every time, so `sync` did, so the interval below was cleared and recreated before it
  // could ever reach fifteen seconds. The poll never fired ONCE. Changes only ever arrived when you
  // re-entered the screen, which is exactly what it looked like from the outside: type on one phone,
  // nothing on the other, leave and come back and there it is.
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  useFocusEffect(
    // Empty deps, deliberately: this must run once per VISIT. With `sync` in here it re-ran every
    // time the callback was rebuilt, which was every sync, which re-triggered a sync.
    useCallback(() => {
      // A fresh look. Dropping both makes "gone next open" literally true rather than true only when
      // the OS happened to unmount the screen: arriving re-reads the stored last-look (which the
      // reconcile below then moves forward), so yesterday's wash cannot still be sitting there.
      seenAt.current = 0;
      mine.current = new Set();
      washedAlready.current = new Map();
      clockSynced.current = false;
      focused.current = true;
      void syncRef.current();
      return () => {
        focused.current = false;
      };
    }, []),
  );

  // AND AGAIN once the session is actually known.
  //
  // This is the other half of the empty-deps focus effect above, and without it the screen is a
  // COIN FLIP. The session hydrates asynchronously; the focus effect fires once, on mount. If mount
  // wins the race, that single call hits `if (!sessionKnown) return` and gives up, the poll effect
  // is keyed on a pairId that is still null so no interval is ever armed, and nothing else ever
  // asks again. The list sits empty forever, on a list that has rows. If the session wins the race
  // instead, everything works, which is exactly why it looked intermittent rather than broken.
  //
  // `session` is in the deps too, so signing in or out reloads rather than showing the last
  // account's list.
  useEffect(() => {
    if (sessionKnown) void syncRef.current();
  }, [sessionKnown, session]);

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
  // Keyed on the pair's ID, a STRING, never the pair object. The object is rebuilt by every read,
  // so depending on it restarted the timer forever and the interval was never allowed to tick.
  const pairId = pair?.pairId ?? null;
  useEffect(() => {
    if (!pairId) return;
    const timer = setInterval(() => {
      if (!shouldPoll(focused.current, AppState.currentState === 'active', nowMs() - lastTouch.current)) return;
      void syncRef.current();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pairId]);

  /** Every write reconciles immediately rather than waiting for the poll: on a shared surface a
   *  fifteen-second lag reads as the other person having done something. */
  const commit = useCallback(
    async (next: SharedTask[]) => {
      if (!pair) return; // nowhere to save it, so do not pretend to
      lastTouch.current = nowMs();
      const stamped = withMonotonicStamps(next, tasks);
      for (const task of stamped) {
        const before = tasks.find((prev) => prev.id === task.id);
        if (!before || before.updatedAt !== task.updatedAt) mine.current.add(task.id);
      }
      setWashed(washFor(stamped));
      setTasks(stamped);
      void saveOursTasks(pair.pairId, stamped);
      // Persisted, not merely held in the ref: if the reconcile below fails, this visit ends
      // without the last-look moving forward, and the next one would tint my own writes as theirs.
      void noteOursMine(pair.pairId, [...mine.current]);
      await sync(stamped);
    },
    [pair, tasks, sync, washFor],
  );

  /** Add it. `recurrence` present means it was captured through the repeat door rather than typed
   *  and entered, which is the one difference between the two paths. */
  function add(recurrence?: Recurrence) {
    const title = draft.trim();
    if (!title || !pair || isPairFrozen(pair)) return;
    setDraft('');
    setCaptureRepeat(false);
    if (willTrim(title)) setNotice(t('ours.shareTrim')); // said BEFORE, never discovered after
    const now = nowMs();
    const made: SharedTask = { id: makeId(), title, done: false, createdAt: now, updatedAt: now };
    if (recurrence) made.recurrence = recurrence;
    void commit([...tasks, made]);
  }

  function toggle(id: string) {
    const found = tasks.find((task) => task.id === id);
    // A cadence this build cannot read has NO recurrence object, so every done-helper treats it as a
    // one-off: one tap would mark it finished forever, for both of you, on a task that was supposed
    // to come back. Inert is the only honest state, and the line under the row says why.
    if (!found || isUnreadableRepeat(found) || isPairFrozen(pair)) return;
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

  /** Put a removed row back. Seven days, and it is the whole reason removal is a tombstone. */
  function restore(id: string) {
    const now = nowMs();
    void commit(tasks.map((task) => (task.id === id ? { ...task, deletedAt: null, updatedAt: now } : task)));
  }

  const cadenceTask = tasks.find((task) => task.id === cadenceId) ?? null;
  // A CLOSED list is readable and nothing else: no capture bar, no ticking, no editing, and one
  // action per row, which is taking a copy for yourself. Not a wall, and not a lie about what is
  // still possible. `ours_is_open` and the RLS both refuse writes anyway; this is the screen
  // agreeing with the server rather than letting somebody tap into a refusal.
  const frozen = isPairFrozen(pair);
  // A CLOSED list shows everything it ever held, because the copy promises "you can still read
  // everything here" and a day-boundary drop would quietly make that false the morning after.
  // A live one is placed by cadence and lets go of yesterday's finished work.
  const visible = frozen ? tasks.filter((task) => !task.deletedAt) : tasks.filter((task) => onSharedListOn(task, today, now));
  // Recently removed, folded at the foot. Seven days, dimmed, and it names nobody: it says a thing
  // was taken off the list, never which of you took it off.
  const removed = tasks
    .filter((task) => task.deletedAt != null && nowMs() - task.deletedAt < RECENTLY_REMOVED_MS)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
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
        {/* Saved here, not there. A fact, and a promise that it keeps trying, because the honest
            alternative to silence is not alarm. */}
        {unpushed && !offline ? <Text style={styles.offline}>{t('ours.errUnpushed')}</Text> : null}
        {notice ? (
          <Pressable onPress={() => setNotice(null)} accessibilityRole="button" accessibilityLabel={t('common.gotIt')} hitSlop={6}>
            <Text style={styles.offline}>{notice}</Text>
          </Pressable>
        ) : null}

        {loaded && visible.length === 0 ? <Text style={styles.empty}>{t('ours.listEmpty')}</Text> : null}

        {visible.map((task) => (
          <View key={task.id} style={styles.row}>
            <TaskRow
              title={task.title}
              done={isSharedDoneOn(task, today)}
              /* The wash, on the row's own surface, and in WORDS as well as colour. It says a
                 thing happened and never who did it, which is the same line the tint draws. */
              /* No one-off border here. It exists on Today to separate one-offs from repeats, and a
                 shared list is almost entirely one-offs, so it lands on every row and separates
                 nothing: chrome on everything, on the screen briefed to be plainer than Today. */
              plain
              washed={washed.has(task.id)}
              note={washed.has(task.id) ? t('ours.changedSince') : undefined}
              onToggle={() => toggle(task.id)}
              onLongPress={() => setConfirmingId(task.id)}
              confirming={confirmingId === task.id}
              onRemove={frozen ? undefined : () => remove(task.id)}
              onKeep={() => setConfirmingId(null)}
              recurring={task.recurrence !== undefined && task.recurrence.kind !== 'none'}
              onRename={frozen ? undefined : (next) => rename(task.id, next)}
              onBring={() => void bring(task)}
              brought={pulled.has(task.id)}
              /* A cadence this build cannot read stays INERT: re-cadencing it would overwrite
                 whatever a newer build meant, on a list somebody else also keeps. */
              onRepeat={frozen || isUnreadableRepeat(task) ? undefined : () => setCadenceId(task.id)}
              inert={frozen ? t('ours.frozenRow') : isUnreadableRepeat(task) ? t('ours.repeatUnknown') : undefined}
              /* The shared list has no per-day skip, so Remove must not borrow "Skip today": it ends
                 the repeat, for both of you. The label says what the button does. */
              removesWholeSeries
            />
            {/* A cadence this build cannot read: SHOWN, never hidden, because hiding it means one
                person sees the task and the other does not and each concludes the other deleted it.
                Inert, with whatever plain-English line the writing app left. */}
            {/* Why this row does not respond, in words, on screen. It used to reach a screen reader
                through the row's label and nobody else, so a sighted user on a closed list simply
                tapped a row that did nothing. */}
            {isUnreadableRepeat(task) ? (
              <Text style={styles.cadenceNote}>
                {repeatSummaryOf(task) ? `${repeatSummaryOf(task)}  ·  ` : ''}
                {t('ours.repeatUnknown')}
              </Text>
            ) : frozen && confirmingId === task.id ? (
              <Text style={styles.cadenceNote}>{t('ours.frozenRow')}</Text>
            ) : null}
          </View>
        ))}

        {removed.length > 0 && !frozen ? (
          <View style={styles.removedFold}>
            <Text style={styles.removedHeading}>{t('ours.recentlyRemoved')}</Text>
            {removed.map((task) => (
              <View key={task.id} style={styles.removedRow}>
                <Text style={styles.removedTitle} numberOfLines={2}>
                  {task.title}
                </Text>
                <Pressable
                  onPress={() => restore(task.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('ours.restoreA11y', { title: task.title })}
                  hitSlop={8}
                >
                  <Text style={styles.restore}>{t('ours.restore')}</Text>
                </Pressable>
              </View>
            ))}
            <Text style={styles.removedHint}>{t('ours.recentlyRemovedHint')}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Captured through the door: the sheet commits the task itself, cadence and all, so the
          button that names the rhythm is also the button that adds it. */}
      {captureRepeat && (
        <CadenceSheet
          visible
          onClose={() => setCaptureRepeat(false)}
          today={now}
          sheetTitle={t('ours.addTo', { name: listName })}
          title={draft}
          note={t('ours.repeatNote')}
          onSave={(title, recurrence) => {
            setDraft(title);
            add(recurrence);
          }}
        />
      )}

      {cadenceTask && (
        <CadenceSheet
          key={cadenceTask.id}
          visible
          onClose={() => setCadenceId(null)}
          today={now}
          sheetTitle={t('repeat.editSheetTitle')}
          title={cadenceTask.title}
          recurrence={cadenceTask.recurrence}
          /* The one line that is true here and nowhere else. Not a warning, and never a count: it
             says what will happen, which is the whole of what anyone needs before committing. */
          note={t('ours.repeatNote')}
          onSave={(title, recurrence) => setCadence(cadenceTask.id, title, recurrence)}
        />
      )}

      {/* The capture bar speaks the list's name, so it is obvious which room you are typing into.
          Gone entirely on a closed list: a field you can tap into and then not use is crueller than
          no field, and the server would refuse the write in any case. */}
      {!frozen && (
        <View style={[styles.capture, { paddingBottom: insets.bottom + spacing.three + Math.max(0, kbHeight - (Platform.OS === 'ios' ? insets.bottom : 0)) }]}>
        {/* The repeat door. Today's capture carries WHEN · REPEATING · STEPS; a shared list has no
            "when" (it is not a day) and no steps (they are a personal shaping tool), so what carries
            across is the one that belongs here. Same sheet, same wording, same commit button. */}
        <Pressable
          onPress={() => setCaptureRepeat(true)}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('ours.repeat')}
          hitSlop={6}
          style={styles.captureDoor}
        >
          <Text style={[styles.captureDoorText, !draft.trim() && styles.captureDoorOff]}>{t('ours.repeat')}</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={(v) => {
            lastTouch.current = nowMs();
            setDraft(v);
          }}
          onSubmitEditing={() => add()}
          placeholder={t('ours.addTo', { name: listName })}
          placeholderTextColor={theme.colors.inkFaint}
          style={styles.input}
          accessibilityLabel={t('ours.addTo', { name: listName })}
          returnKeyType="done"
            blurOnSubmit={false}
          />
        </View>
      )}
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
    // Recently removed: dimmed, at the foot, folded away from the working list. It never says who.
    removedFold: { marginTop: spacing.six, borderTopWidth: border.hair, borderTopColor: t.colors.line, paddingTop: spacing.four },
    removedHeading: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    removedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, marginTop: spacing.three },
    removedTitle: { flex: 1, color: t.colors.inkFaint, fontSize: 15 * t.scale, fontFamily: fonts.body },
    restore: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    removedHint: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.three },
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
    // Above the input, quiet until there is something to make repeat.
    captureDoor: { alignSelf: 'flex-start', paddingVertical: spacing.one },
    captureDoorText: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    captureDoorOff: { color: t.colors.inkFaint, fontWeight: '400', fontFamily: fonts.body },
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
