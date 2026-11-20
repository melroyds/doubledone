import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { CaptureSheet, type CaptureSheetHandle, pillClearance, restingListPad, restingPanelHeight } from '@/components/CaptureSheet';
import { CameraCapture } from '@/components/CameraCapture';
import { DayHeading } from '@/components/DayHeading';
import { LivingBackground } from '@/components/LivingBackground';
import { MenuPill } from '@/components/MenuPill';
import { DebugPanel } from '@/components/DebugPanel';
import { CadenceSheet } from '@/components/CadenceSheet';
import { TaskRow } from '@/components/TaskRow';
import { border, fonts, layout, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { useSessionState } from '@/lib/auth';
import { clockSkewMs } from '@/lib/clock';
import { debugLog } from '@/lib/debug-log';
import { formatTodayLabel, friendlyDate, toISODate } from '@/lib/day';
import { type CaptureWhen } from '@/lib/capture-door';
import { type CaptureSchedule, scheduleFields } from '@/lib/recurrence';
import { fmt, t } from '@/lib/locale';
import { makeSharedRef, pulledFrom } from '@/lib/ours-bridge';
import { loadMyPairs, type MyPair, syncClock } from '@/lib/ours-api';
import { knownOursName, rememberOursName } from '@/lib/ours-name';
import { isSharedDoneOn, releaseCompletions, setSharedDone, type SharedTask, washedSince } from '@/lib/ours-merge';
import { decideFold, finishMark, isUnreadableRepeat, noteShown, onSharedListOn, POLL_MS, cadenceLine, sameMarks, seedShown, shouldPoll, splitFinished, syncPairOnce, tickableInRoom, willTrim } from '@/lib/ours-sync';
import { whenValue, type WhenAnswer } from '@/lib/when';
import { clearOursMine, loadOursMine, loadOursSeen, loadOursShown, loadOursTasks, loadTasks, markOursSeen, noteOursMine, pruneOursCache, pruneOursShown, saveOursShown, saveOursTasks, saveTasks } from '@/lib/storage';
import { usePremium } from '@/lib/premium-provider';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';
import { makeId, nowMs, parseDump, type Task, withMonotonicStamps } from '@/lib/tasks';
import { useReducedMotion, useThemedStyles } from '@/lib/theme-provider';

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
  const { session, known: sessionKnown } = useSessionState();
  // One Date for the whole render, so the ISO day and the cadence placement can never disagree
  // across a midnight tick mid-render. STATE, not a useMemo, because it must be allowed to CHANGE.
  //
  // Frozen at mount this was the room's version of a bug Today had already fixed, and it was worse
  // here because the wrong day travels to another person. Leave the room open on the counter
  // overnight, or open it at 23:58 and tick at 00:02, and `toggle` writes the completion log under
  // YESTERDAY's key. Your partner's phone computes the real date, asks whether the row is done
  // today, and gets false. Permanently: the merge is per-date, and the date is wrong. A Tuesday
  // repeat also keeps rendering on Wednesday, and anything captured as "Tomorrow" lands on today.
  //
  // Re-derived on focus and on every poll tick, and ONLY when the ISO day actually differs, so the
  // identity stays stable and nothing re-renders for nothing.
  const [now, setNow] = useState(() => new Date());
  const today = toISODate(now);
  // The archive opens a CLOSED list here by id. Without it the room only ever shows the live one,
  // and "you can still read everything" would have been a promise with nowhere to keep it.
  const { pair: wantedId, debug, from } = useLocalSearchParams<{ pair?: string; debug?: string; from?: string }>();
  const debugOn = debug === '1';

  const [pair, setPair] = useState<MyPair | null>(null);
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /**
   * MULTI-SELECT, which a shared list wants more than a personal day does. A household list is
   * where six things get bought in one trip and then need ticking off in one go, and where a
   * finished shopping list needs clearing. Doing that one row at a time on a list two people keep
   * is the kind of small tax that stops people keeping it.
   *
   * Deliberately NARROWER than Today's version. Tick and Remove only: no Combine (an AI action that
   * would author rows onto a list another person reads), no "mark as a lot" (a personal weighting
   * concept the shared rows have no field for), and no bulk Move-to (dating several shared rows at
   * once is a bigger promise than it looks, and one row at a time is honest here).
   */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [offline, setOffline] = useState(false);
  // The push failed while the pull worked: my change is on this device and NOT on theirs.
  // `syncPairOnce` has always returned this and nothing has ever read it, which is precisely why a
  // tick could sit looking finished on one phone and never arrive on the other, with no signal to
  // the user OR to me. Silence was the bug underneath several of tonight's bugs.
  const [unpushed, setUnpushed] = useState(false);
  // A push refused BECAUSE THE LIST IS CLOSED, which is not the same as one the network dropped.
  // "Saved here, not there" promises it keeps trying; on a closed list the write can never succeed,
  // and that promise sits on the one screen a separated or bereaved person may keep for years.
  // `isPairReadOnly` existed for exactly this and had no call site at all until the audit found it.
  const [readOnly, setReadOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); // one calm line, for things worth saying once
  // Newest-issued-wins, the same guard the pairing screen needed: several call sites, a network
  // round trip in each, and whichever reply lands last would otherwise win regardless of age.
  const pass = useRef(0);
  // Minted at FIRST RENDER, which is before `syncClock` has measured anything, so this baseline is
  // raw `Date.now()` while every later reading of `nowMs()` is corrected. On a phone eleven minutes
  // behind the server that mismatch alone reads as eleven minutes of idleness, and `shouldPoll`'s
  // ten-minute rule then stops polling for the whole visit while the person sits looking at the
  // screen. Re-baselined the moment the skew is known (see `syncClock` below), which is the only
  // point at which a correct value can exist.
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
  // Rows I wrote, and the STAMP I wrote them at.
  //
  // This was a plain Set, which meant "I touched this row once, so never highlight it again for the
  // rest of this visit". Melroy found the repro in one move: B ticks a row, A un-ticks it, and B
  // stays dark because B still believes that row is its own edit. My own write must not wash; their
  // LATER change to the same row must. Only a stamp can tell those apart.
  const mine = useRef<Map<string, number>>(new Map());
  // Ids I wrote in an earlier session (from Today), waiting for a stamp. They get one the first time
  // this visit sees the row, which is the honest reading of "already mine as of when I got here".
  const minePending = useRef<Set<string>>(new Set());
  const [washed, setWashed] = useState<ReadonlySet<string>>(new Set());
  // THE VISIT'S FOLD (lib/ours-sync `decideFold`): which finished rows sit under "Finished" for this
  // whole visit, each with the finish it folded with. Decided once as the visit begins and then held,
  // so nothing changes side while you are looking. Mirrored in a ref for the callbacks below.
  const [fold, setFold] = useState<ReadonlyMap<string, string>>(new Map());
  const foldRef = useRef<ReadonlyMap<string, string>>(new Map());
  const foldDecided = useRef(false);
  // What THIS phone has drawn finished in the working list, for the open list (lib/storage
  // `loadOursShown`). The next visit folds only these. Seen means drawn here, never the other
  // phone's stamp, which a tick made with no signal carries from hours before it arrived. `fresh`
  // marks a record this phone never kept, seeded once from the last look.
  const shownRecord = useRef<{ pairId: string; marks: Record<string, string>; fresh: boolean } | null>(null);
  // Rows that rose out of the fold this visit (un-ticked by either of you). They stay at the foot of
  // the working list for the rest of the visit even if the same finish comes back, so the only
  // movement in a visit is upward.
  const [risen, setRisen] = useState<ReadonlySet<string>>(new Set());
  const risenRef = useRef<ReadonlySet<string>>(new Set());
  // The Finished line: closed at the start of every visit, which is its point.
  const [finishedOpen, setFinishedOpen] = useState(false);
  // The rows a card or a selection is open on, for a new visit, which must not re-place them.
  const heldRef = useRef<ReadonlySet<string>>(new Set());
  // The stored last look, kept across visits so a visit begun at focus can tell news without waiting
  // on storage.
  const lastLook = useRef<{ pairId: string; at: number } | null>(null);
  // The day this visit's fold was decided on, so a return to the app on a new day starts a new visit.
  const visitDay = useRef('');
  // The line, and where it sits in the scroll content, so an Add with the fold open brings the end of
  // the working list into view rather than the end of the fold.
  const lineRef = useRef<View>(null);
  const lineY = useRef<number | null>(null);
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
    // An earlier session's ids learn their stamp the first time we see the row.
    for (const row of rows) {
      if (minePending.current.delete(row.id)) mine.current.set(row.id, row.updatedAt);
    }
    // Mine ONLY while the row has not moved since I wrote it. The moment their change lands, the
    // stamp rises above mine and it stops being my edit.
    const stillMine = new Set<string>();
    for (const row of rows) {
      const wroteAt = mine.current.get(row.id);
      if (wroteAt !== undefined && row.updatedAt <= wroteAt) stillMine.add(row.id);
    }
    const next = new Set(washedSince(rows, seenAt.current, stillMine));
    // Every input to the decision, in one line. Tonight cost hours because a wash that did not
    // happen looked identical to a wash that was excluded, a stale last-look, and a clock skew.
    const newest = rows.reduce((max, row) => (row.updatedAt > max ? row.updatedAt : max), 0);
    const short = (id: string) => id.slice(-4);
    debugLog('wash', {
      lit: next.size,
      // WHICH rows, not just how many. `lit=1` with nothing visible on screen is unreadable without
      // this: it could be one row lit forever, a different row each time, or a row that is simply
      // scrolled out of sight, and those are three different bugs.
      litIds: [...next].map(short).join(',') || '-',
      shownIds: [...washedAlready.current.keys()].map(short).join(',') || '-',
      mineIds: [...stillMine].map(short).join(',') || '-',
      rows: rows.length,
      // The four things that can suppress a highlight, so a zero is never ambiguous again.
      seenAgo: seenAt.current ? `${Math.round((nowMs() - seenAt.current) / 1000)}s` : 'never',
      newestAgo: newest ? `${Math.round((nowMs() - newest) / 1000)}s` : '-',
      mine: mine.current.size,
      shown: washedAlready.current.size,
      skew: `${Math.round(clockSkewMs() / 1000)}s`,
    });
    for (const row of rows) {
      const shownAt = washedAlready.current.get(row.id);
      if (shownAt !== undefined && row.updatedAt <= shownAt) next.delete(row.id);
    }
    return next;
  }, []);

  /**
   * Bring this phone's record of drawn finishes up to date, for the NEXT visit's fold. Only while you
   * are actually here: a sync that runs with the room under another screen, or with the app in the
   * background, has shown nobody anything. Written only when it changed.
   */
  const noteShownNow = useCallback((rows: SharedTask[]) => {
    const record = shownRecord.current;
    if (!record || record.fresh || !foldDecided.current || !focused.current || AppState.currentState !== 'active') return;
    const onList = rows.filter((task) => !task.deletedAt);
    const next = noteShown(record.marks, onList, splitFinished(onList, foldRef.current).working, foldRef.current);
    if (sameMarks(next, record.marks)) return;
    record.marks = next;
    void saveOursShown(record.pairId, next);
  }, []);

  /**
   * The visit's fold, from the rows about to be drawn: this phone's record decides, and a row changed
   * since the last look stays in place too, because Today's "!" counted it and the room must show what
   * that mark counted. Every row starts the visit un-risen.
   */
  const placeFold = useCallback((rows: SharedTask[], lookedAt: number, mineIds: ReadonlySet<string>) => {
    const record = shownRecord.current;
    if (!record) return;
    const onList = rows.filter((task) => !task.deletedAt);
    const day = toISODate(new Date());
    foldRef.current = decideFold(onList, day, record.marks, washedSince(onList, lookedAt, mineIds));
    setFold(foldRef.current);
    risenRef.current = new Set();
    setRisen(risenRef.current);
    visitDay.current = day;
    foldDecided.current = true;
  }, []);

  /**
   * Remember the rows that have risen out of the fold, at the moment the rows change (a sync, or a
   * write of mine), which are the only moments a row can rise. A row whose card or selection is open
   * under the line is not risen yet: it stays where it was drawn until that is done.
   */
  const noteRisen = useCallback((rows: SharedTask[]) => {
    const fold = foldRef.current;
    if (fold.size === 0) return;
    const inFold = new Set([...heldRef.current].filter((id) => fold.has(id) && !risenRef.current.has(id)));
    const { risen: up } = splitFinished(rows.filter((task) => !task.deletedAt), fold, { inFold, risen: risenRef.current });
    if (up.every((task) => risenRef.current.has(task.id))) return;
    risenRef.current = new Set([...risenRef.current, ...up.map((task) => task.id)]);
    setRisen(risenRef.current);
  }, []);
  // Which rows are already on my own Today, so "Bring to my Today" can say so rather than quietly
  // making a second copy. My tasks, read here only to answer that one question.
  const [pulled, setPulled] = useState<Map<string, string>>(new Map());
  const [cadenceId, setCadenceId] = useState<string | null>(null); // the row whose rhythm is being set
  // CAPTURE IS TODAY'S CAPTURE. Not a lookalike: the same `CaptureSheet` (pill and panel), so the input, the
  // Speak button, the door, the iOS keyboard bar and the Add button that names its own consequence
  // are the same objects in both rooms and can never drift apart. Melroy asked for exactly this
  // ("I want consistent UI between Today and Ours"), and the reason it is worth the wiring is that
  // this audience runs on muscle memory: a second, similar-but-different capture is a second thing
  // to learn, and learning it twice is the friction the app exists to remove.
  //
  // STEPS are switched off rather than reimplemented: a shared row has no `slices` field to put them
  // in, and slicing is a personal shaping tool. How you break a thing down is yours, not a
  // household's. WHEN and REPEATING both belong here, and WHEN rests on Anytime, because most of a
  // household list has no day and choosing one means the row appears on BOTH your Todays.
  // The capture panel is up (the pill's sheet): the list leaves room above it, exactly as on Today.
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<CaptureSheetHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { height: winH } = useWindowDimensions();
  const reduced = useReducedMotion();
  // SCAN (premium), on the shared list because this is where it most belongs. The single most
  // photographed list in anybody's life is the one on the fridge, and that list is shared by
  // definition: a handwritten shopping list, a recipe's ingredients, the school's bring-these-things
  // note. Melroy asked for it here, and it is a better fit here than on a personal day.
  const [cameraOpen, setCameraOpen] = useState(false);
  const { premium, loading: premiumLoading } = usePremium();


  /** Cache first, then reconcile. The list is on screen before the network is asked anything, which
   *  is the whole point of the local copy and the difference between opening a list and waiting. */
  const sync = useCallback(
    async (local?: SharedTask[]) => {
      const call = ++pass.current;
      // Traced at EVERY exit, because "no wash line" turned out to be indistinguishable from a dozen
      // different early returns. A diagnostic that can itself be skipped is not a diagnostic.
      debugLog('sync', { call, known: sessionKnown, session: Boolean(session), local: local ? local.length : '-' });
      // NOT YET KNOWN is not the same as signed out, and conflating them made opening your own list
      // a loop: `useSession` returns null while it hydrates, this branch called that signed-out, and
      // the redirect below sent you back to the pairing screen before the session ever arrived.
      // Wait instead. The callback re-runs the moment the answer lands, because `known` is a dep.
      if (!sessionKnown) return debugLog('sync', { call, stop: 'session-unknown' });

      // NOW it is definitive. Signed out is a FINISHED load, and `readOk` too, because there is no
      // read to fail: a signed-out visitor belongs on /ours, which explains why.
      if (!supabase || !session) {
        readOk.current = true;
        debugLog('sync', { call, stop: 'signed-out' });
        return setLoaded(true);
      }
      const client = supabase;
      const res = await loadMyPairs(client, session.user.id);
      if (call !== pass.current) return debugLog('sync', { call, stop: 'overtaken-at-pairs', by: pass.current });
      // A FAILED read is not "you have no shared list". Treating it as one nulled the pair, which
      // fired the redirect below and threw the user out of the room onto the pairing screen, on a
      // dropped signal. Keep whatever is on screen, say so quietly, and try again on the next poll:
      // exactly how the task read below already behaves.
      if (!res.ok) {
        debugLog('sync', { call, stop: 'pairs-failed' });
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
        // The skew is known only now, so re-take the idle baseline against the corrected clock.
        // Without this the first reading is off by the whole skew and a lagging phone stops polling
        // immediately, for the entire visit.
        lastTouch.current = nowMs();
        if (call !== pass.current) return debugLog('sync', { call, stop: 'overtaken-at-clock', by: pass.current });
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
      if (chosen && !wantedId) rememberOursName(chosen.name?.trim() ?? '');
      if (!chosen) {
        debugLog('sync', { call, stop: 'no-pair', live: Boolean(live), frozen: frozen.length });
        return setLoaded(true);
      }
      const live_ = chosen;
      const noteLook = (pairId: string, at: number) => {
        const prev = lastLook.current;
        lastLook.current = { pairId, at: prev && prev.pairId === pairId ? Math.max(prev.at, at) : at };
      };

      if (seenAt.current === 0) {
        seenAt.current = (await loadOursSeen())[live_.pairId] ?? 0;
        noteLook(live_.pairId, seenAt.current);
        // Rows I changed from Today since I was last here. Without these, my own tick on a brought
        // copy comes back tinted as my person's change, which is the room inventing an event.
        for (const id of await loadOursMine(live_.pairId)) minePending.current.add(id);
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
      // This phone's record of drawn finishes (the Finished fold), once per list per mount. Missing is
      // not empty: a phone meeting the fold for the first time seeds it once from the last look, below.
      if (shownRecord.current?.pairId !== live_.pairId) {
        const stored = await loadOursShown(live_.pairId);
        shownRecord.current = { pairId: live_.pairId, marks: stored ?? {}, fresh: stored === null };
        foldDecided.current = false;
      }

      const cached = local ?? (await loadOursTasks(live_.pairId));
      if (call !== pass.current) return debugLog('sync', { call, stop: 'overtaken-at-cache', by: pass.current });
      // THE VISIT'S FOLD, here when the focus could not decide it (a fresh mount has no rows on screen):
      // once, from the FIRST rows this visit draws, in the same render as them, then held. That is the
      // cache when it has rows, else the merged set, never an empty cache, which would fold nothing for
      // the whole visit. A record this phone never kept is seeded from those same rows and the last look.
      const placeVisit = (rows: SharedTask[]) => {
        const record = shownRecord.current;
        if (!record || foldDecided.current) return;
        if (record.fresh) {
          record.marks = seedShown(rows, seenAt.current);
          record.fresh = false;
          void saveOursShown(record.pairId, record.marks);
        }
        placeFold(rows, seenAt.current, minePending.current);
      };
      if (cached.length > 0) placeVisit(cached);
      noteRisen(cached);
      setTasks(cached);
      setWashed(washFor(cached));
      setLoaded(true);
      noteShownNow(cached);

      try {
        const { merged, pushError, readOnly: refused } = await syncPairOnce(client, live_.pairId, cached);
        if (call !== pass.current) return;
        if (pushError) console.warn('[ours] push failed, changes are local only', pushError);
        setUnpushed(Boolean(pushError));
        setReadOnly(Boolean(refused));
        placeVisit(merged);
        noteRisen(merged);
        setTasks(merged);
        setWashed(washFor(merged));
        noteShownNow(merged);
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
        const lookedAt = nowMs();
        void markOursSeen(live_.pairId, lookedAt);
        noteLook(live_.pairId, lookedAt);
        void clearOursMine(live_.pairId); // from here the last-look covers those writes
        // Cached rows for lists this account no longer belongs to are ANOTHER PERSON'S WORDS on
        // this device, with nothing left pointing at them. `pruneOursCache` existed for exactly
        // this and had no caller anywhere, so leaving or deleting a list left its contents behind.
        const kept = all.filter((p): p is MyPair => p != null).map((p) => p.pairId);
        void pruneOursCache(kept);
        void pruneOursShown(kept);
      } catch {
        // A failed READ keeps whatever is on screen. This list is somebody's household, and showing
        // it stale beats showing it empty; the line below says so rather than pretending.
        if (call === pass.current) setOffline(true);
      }
    },
    [session, sessionKnown, wantedId, pair, washFor, noteShownNow, placeFold, noteRisen],
  );

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

  /**
   * A new visit: a fresh look for the wash, and the fold decided again from the rows already on screen
   * when the room stayed mounted underneath (the Menu, Kept with, Back), so the visit's first frame is
   * already placed rather than shuffling a beat later when the network answers. A fresh mount has no
   * rows yet, and the sync decides then. Never while a card or a selection is open: the visit carries
   * on around what you are in the middle of, fold and all.
   */
  const startVisit = useCallback(() => {
    // A fresh look. Dropping both makes "gone next open" literally true rather than true only when
    // the OS happened to unmount the screen: arriving re-reads the stored last-look (which the
    // reconcile below then moves forward), so yesterday's wash cannot still be sitting there.
    seenAt.current = 0;
    mine.current = new Map();
    minePending.current = new Set();
    washedAlready.current = new Map();
    clockSynced.current = false;
    if (heldRef.current.size === 0) {
      foldDecided.current = false;
      const record = shownRecord.current;
      const look = lastLook.current;
      if (record && !record.fresh && record.pairId === openId.current && tasksRef.current.length > 0) {
        placeFold(tasksRef.current, look && look.pairId === record.pairId ? look.at : 0, new Set());
      }
      setFinishedOpen(false);
    }
    setNow((prev) => (toISODate(prev) === toISODate(new Date()) ? prev : new Date()));
    void syncRef.current();
  }, [placeFold]);

  useFocusEffect(
    // Once per VISIT: `startVisit` never changes. With `sync` in here it re-ran every time the
    // callback was rebuilt, which was every sync, which re-triggered a sync.
    useCallback(() => {
      focused.current = true;
      startVisit();
      return () => {
        focused.current = false;
      };
    }, [startVisit]),
  );

  // Back to the app on a NEW day with the room still on screen. No focus event fires, so without this
  // last night's finishes would sit in the working list all morning. That is a new visit. The same day
  // is the same visit.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused.current && visitDay.current !== '' && visitDay.current !== toISODate(new Date())) startVisit();
    });
    return () => sub.remove();
  }, [startVisit]);

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
    if (!(loaded && readOk.current && !pair)) return;
    // Opened from the pairing screen: go back to it, rather than stacking a second one under a back label
    // that no longer matches the system back.
    if (from === 'room' && router.canGoBack()) router.back();
    else router.replace('/ours');
  }, [loaded, pair, from]);

  // Two people write this list, so the gap between their change and your screen is the window in
  // which you are looking at something untrue. Fifteen seconds while you are actually here, and the
  // rule is pure and tested in ours-sync: focused AND foregrounded AND not idle ten minutes.
  // Keyed on the pair's ID, a STRING, never the pair object. The object is rebuilt by every read,
  // so depending on it restarted the timer forever and the interval was never allowed to tick.

  const pairId = pair?.pairId ?? null;
  useEffect(() => {
    if (!pairId) return;
    const timer = setInterval(() => {
      // BEFORE the shouldPoll gate: the day must roll over even on a screen nobody is touching,
      // because the harm is a tick written into yesterday, not a stale list.
      setNow((prev) => (toISODate(prev) === toISODate(new Date()) ? prev : new Date()));
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
        if (!before || before.updatedAt !== task.updatedAt) mine.current.set(task.id, task.updatedAt);
      }
      setWashed(washFor(stamped));
      noteRisen(stamped);
      setTasks(stamped);
      noteShownNow(stamped);
      void saveOursTasks(pair.pairId, stamped);
      // Persisted, not merely held in the ref: if the reconcile below fails, this visit ends
      // without the last-look moving forward, and the next one would tint my own writes as theirs.
      void noteOursMine(pair.pairId, [...mine.current.keys()]);
      await sync(stamped);
    },
    [pair, tasks, sync, washFor, noteShownNow, noteRisen],
  );

  /**
   * Add what was captured. One line or many: a dump becomes one row per line, and the door's
   * cadence applies to every one of them, which is the same rule Today follows.
   *
   * A DATE and a RHYTHM are mutually exclusive here, and the guard is belt-and-braces: the door
   * cannot produce both, and if it ever did the repeat would win, because a rhythm is the more
   * specific promise. This mirrors the rule the public API already enforces on personal tasks
   * (never both dated and recurring), so a row made here, by an agent, or over REST is the same
   * shape.
   */
  function capture(text: string, schedule: CaptureSchedule) {
    const titles = parseDump(text);
    if (titles.length === 0 || !pair || isPairFrozen(pair)) return;
    // Typing is activity. `lastTouch` is the ten-minute idle gate on polling, and it used to be fed
    // by the old bar's onChangeText; the capture panel owns its own text, so the two moments that still
    // prove a person is here (opening the panel, and this) feed it instead.
    lastTouch.current = nowMs();
    if (titles.some(willTrim)) setNotice(t('ours.shareTrim')); // said BEFORE, never discovered after
    const { recurrence, due } = scheduleFields(schedule, now);
    const stamp = nowMs();
    // `stamp + i` rather than one stamp for all: identical `createdAt`s across a dump would make
    // the row order arbitrary, and on a list two people read, an order that shuffles is a list
    // nobody trusts.
    const made: SharedTask[] = titles.map((title, i) => ({
      id: makeId(),
      title,
      done: false,
      createdAt: stamp + i,
      updatedAt: stamp + i,
      ...(recurrence ? { recurrence } : {}),
      // A DAY, when one was chosen: this row will appear on both your Todays from that day onward.
      // Never both a date and a rhythm; the door cannot produce both, and a repeat wins if it ever
      // somehow did, because a rhythm is the more specific promise.
      ...(!recurrence && due ? { due } : {}),
    }));
    void commit([...tasks, ...made]);
  }

  function toggle(id: string) {
    const found = tasks.find((task) => task.id === id);
    // A cadence this build cannot read has NO recurrence object, so every done-helper treats it as a
    // one-off: one tap would mark it finished forever, for both of you, on a task that was supposed
    // to come back. Inert is the only honest state, and the line under the row says why.
    // Not due today is a refusal too, and a quiet one: a tick on a wrong day writes a completion for
    // THAT date into the shared log, which then reads as un-ticked on the day it was really for.
    if (!found || isPairFrozen(pair) || !tickableInRoom(found, today, now)) return;
    // `stamp`, not `now`: the outer `now` is the render's Date and the guard above reads it. A local
    // `const now` here shadowed it into the temporal dead zone.
    const stamp = nowMs();
    void commit(tasks.map((task) => (task.id === id ? setSharedDone(task, today, !isSharedDoneOn(task, today), stamp) : task)));
  }

  /** Removal is a tombstone, never a delete: it is how the removal reaches the other person at all,
   *  and it is what Recently removed restores from. */
  function remove(id: string) {
    setConfirmingId(null);
    const now = nowMs();
    void commit(tasks.map((task) => (task.id === id ? { ...task, deletedAt: now, updatedAt: now } : task)));
  }

  /**
   * The one line under a row's title, and the ONE place that decides it.
   *
   * It used to be drawn as a sibling BELOW the card, which is how "Gio" ended up floating between
   * two rows belonging to neither. Melroy: "Does the Thursday apply to the row above or below? It's
   * not clear." He is right, and no amount of better wording fixes a line the eye cannot bind to a
   * row. It now goes through TaskRow's own note slot, indented under the title, inside the card.
   *
   * The irony worth recording: that slot was added this morning for exactly this, and the room was
   * never moved onto it.
   *
   * Order matters and each step earns its place:
   *   1. CLOSED beats everything. Nothing else about the row can be acted on anyway.
   *   2. A CHANGE you have not seen is news, and news outranks a standing fact.
   *   3. An UNREADABLE cadence keeps both halves: the other build's words AND that we cannot read
   *      them, because either alone is misleading.
   *   4. The RHYTHM, so a row that will turn up on both Todays says so here, in the room where it
   *      was made, rather than being a surprise on somebody's morning.
   *   5. A chosen DAY, for the same reason.
   */
  function rowNote(task: SharedTask): string | undefined {
    if (frozen) return t('ours.frozenRow');
    if (washed.has(task.id)) return t('ours.changedSince');
    if (isUnreadableRepeat(task)) {
      const words = cadenceLine(task, now);
      return words ? `${words}  ·  ${t('ours.repeatUnknown')}` : t('ours.repeatUnknown');
    }
    // A row due today says "Today", as the When sheet does (friendlyDate already says "Tomorrow"); until
    // 2026-11-01 it showed a short date there, which the screenshot QA read as a different day.
    if (!cadenceLine(task, now) && task.due === toISODate(now)) return t('common.today');
    return cadenceLine(task, now) ?? (task.due ? friendlyDate(task.due, now) : undefined);
  }

  function enterSelectWith(id: string) {
    setConfirmingId(null);
    setSelected([id]);
    setSelectMode(true);
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected([]);
  }
  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  /** Tick every selected row that is not already done today. Never UN-ticks: a bulk action that
   *  toggles would silently undo somebody's finished work on a mixed selection. */
  function bulkTick() {
    if (selected.length === 0 || isPairFrozen(pair)) return;
    const set = new Set(selected);
    const stamp = nowMs();
    void commit(
      tasks.map((task) =>
        set.has(task.id) && tickableInRoom(task, today, now) && !isSharedDoneOn(task, today)
          ? setSharedDone(task, today, true, stamp)
          : task,
      ),
    );
    exitSelect();
  }

  /** Remove every selected row. A tombstone, never a delete, so it reaches the other person and
   *  Recently removed can put it back. On a REPEAT this ends the series for both of you, which is
   *  why the shelf says so before the tap rather than after. */
  function bulkRemove() {
    if (selected.length === 0 || isPairFrozen(pair)) return;
    const set = new Set(selected);
    const stamp = nowMs();
    void commit(tasks.map((task) => (set.has(task.id) ? { ...task, deletedAt: stamp, updatedAt: stamp } : task)));
    exitSelect();
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
  function setCadence(id: string, title: string, answer: WhenAnswer) {
    const now = nowMs();
    setCadenceId(null);
    // The 500-character cap, said BEFORE the save. `rename` has always warned; this path did not,
    // so editing a long title inside the cadence sheet let the server clamp it silently and the
    // words vanished from the person's own screen a second later. Same rule, both doors.
    if (willTrim(title)) setNotice(t('ours.shareTrim'));
    // A dated one-off and a repeat are mutually exclusive everywhere else in this app (the API
    // enforces it, MCP enforces it), so setting a rhythm clears any raw cadence a newer build left
    // AND any date the row was carrying. Leaving `due` in place gave the row two contradictory
    // schedules: `sharedDueOn` answers on the recurrence, but the room drew the stale date, and the
    // never-both invariant this app states everywhere quietly stopped being true on the one surface
    // two people read.
    void commit(
      tasks.map((task) => {
        if (task.id !== id) return task;
        // A rhythm ENDING has to let go of its ticks, and this is the only place that can know.
        // A repeat's completions live per date and the row's own `done` stays false; the moment the
        // recurrence goes, `reconcile` reads that same log as a one-off's tick and the row comes
        // back DONE, for both people, carrying a doneAt from whenever it was last ticked. All three
        // forms of stopping do it, including the dated one, which is the easy one to miss because
        // setting a date does not feel like an ending.
        const wasRepeating = task.recurrence !== undefined && task.recurrence.kind !== 'none';
        const stops = wasRepeating && answer.recurrence.kind === 'none';
        return {
          ...task,
          title,
          recurrence: answer.recurrence,
          rawRecurrence: undefined,
          due: answer.due,
          ...(stops ? { completions: releaseCompletions(task.completions, now), done: false, doneAt: null } : {}),
          updatedAt: now,
        };
      }),
    );
  }

  /** Put a removed row back. Seven days, and it is the whole reason removal is a tombstone. */
  function restore(id: string) {
    // Removed from inside the fold earlier this visit, it goes back where it came from, so the fold opens
    // to show it rather than letting Put back look like it did nothing. Only when it really lands there:
    // a row that rose this visit, or is no longer that finish, comes back into the list instead.
    const row = tasks.find((task) => task.id === id);
    if (row && !risen.has(id) && fold.get(id) === finishMark({ ...row, deletedAt: null })) setFinishedOpen(true);
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
  // A live one shows every row nobody has removed (`onSharedListOn`), finished ones included.
  const visible = frozen ? tasks.filter((task) => !task.deletedAt) : tasks.filter((task) => onSharedListOn(task, today, now));
  // FINISHED, folded at the foot: the rows this visit's fold holds (`decideFold`: their day has passed
  // and this phone has already shown them finished). Still ON the list, so they keep the empty line
  // away, and a closed list's promise holds, because everything is still there to read. A row whose
  // card or selection is open stays where it was drawn, and a fold holding one stays open, so nothing
  // you are in the middle of can be folded out of reach.
  const held = new Set(selected);
  if (confirmingId) held.add(confirmingId);
  // A held row drawn under the line stays there while held: one of this visit's fold not yet risen.
  const heldInFold = new Set([...held].filter((id) => fold.has(id) && !risen.has(id)));
  const { working, finished } = splitFinished(visible, fold, { inFold: heldInFold, risen });
  const finishedHeld = finished.some((task) => held.has(task.id));
  const finishedShown = finished.length > 0 && (finishedOpen || finishedHeld);
  // The rows on screen right now, which is what Select all means and what a held card can be on.
  const shown = finishedShown ? [...working, ...finished] : working;
  useEffect(() => {
    heldRef.current = held;
  });
  // Recently removed, folded at the foot. Seven days, dimmed, and it names nobody: it says a thing
  // was taken off the list, never which of you took it off.
  const removed = tasks
    .filter((task) => task.deletedAt != null && nowMs() - task.deletedAt < RECENTLY_REMOVED_MS)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  // Before the pair has loaded, the name Today already knew. Falling back to the default here showed
  // "La nostra lista" for a beat and then flipped to the household's own name, which read as the app
  // switching language (Melroy, on Italian, 2026-09-26). The default is only for a list with no name.
  const [handedName] = useState(knownOursName);
  const listName = pair ? pair.name?.trim() || t('ours.defaultName') : handedName || t('ours.defaultName');
  // The Today · Ours heading is for the LIVE list, the one Today's heading switches to. A closed list
  // opened from the archive (?pair=) keeps its own title and back link: the Ours word means the live list.
  const tabbed = !frozen && !wantedId;

  // Today, by the heading's word: all the way back to Today, past the Menu's contents page if that is
  // how you got here (the room's own back still returns to wherever you came from).
  function goToday() {
    if (router.canGoBack()) router.dismissTo('/today');
    else router.replace('/today');
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (open) lastTouch.current = nowMs(); // composing is a person being here: the poll must not idle out
  }

  // Added from the panel: the new rows land at the end of the working list, so bring that up above it.
  // With Finished open the content's end is the fold, so the line's place stands in for the list's end
  // (Today's revealListEnd, the same shape). Measured when it scrolls: the web fires onLayout only when
  // a size changes (RN-web's ResizeObserver), never when the line moves down under a new row, so there
  // the line's offsetTop is read instead, as Today's measureSlotNode does. A phone fires onLayout on a
  // move, given the 120 ms Today's own reveal waits for its measure.
  function captureFromSheet(text: string, schedule: CaptureSchedule) {
    capture(text, schedule);
    const foldOpen = finishedShown;
    setTimeout(
      () => {
        const webTop = Platform.OS === 'web' ? (lineRef.current as unknown as { offsetTop?: number } | null)?.offsetTop : undefined;
        const top = typeof webTop === 'number' ? webTop : lineY.current;
        if (foldOpen && top !== null) {
          const panelTop = winH - restingPanelHeight(winH);
          scrollRef.current?.scrollTo({ y: Math.max(0, top + 12 - panelTop), animated: !reduced });
        } else {
          scrollRef.current?.scrollToEnd({ animated: !reduced });
        }
      },
      foldOpen ? 120 : 80,
    );
  }

  // The line beside When, before you add: what a day on the shared list means (the When v2 wording).
  function whenNote({ when, repeating }: { when: CaptureWhen; repeating: boolean }): string {
    if (repeating) return t('ours.whenRhythm');
    if (when === 'anytime') return t('ours.whenPlain');
    if (when === 'today') return t('ours.whenToday');
    return t('ours.whenDay');
  }

  /** One row of the room: the SAME object in the working list and in the Finished fold, so a row folded away
   *  keeps every door it had. A tick brings it back up (un-ticked, it is no longer finished), and a hold
   *  opens its card as it always did. */
  function rowFor(task: SharedTask) {
    return (
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
          note={rowNote(task)}
          onToggle={() => toggle(task.id)}
          onLongPress={() => setConfirmingId(task.id)}
          confirming={confirmingId === task.id}
          selecting={selectMode}
          selected={selected.includes(task.id)}
          onSelect={() => toggleSelect(task.id)}
          onSelectMore={frozen ? undefined : () => enterSelectWith(task.id)}
          onRemove={frozen ? undefined : () => remove(task.id)}
          onKeep={() => setConfirmingId(null)}
          recurring={task.recurrence !== undefined && task.recurrence.kind !== 'none'}
          onRename={frozen ? undefined : (next) => rename(task.id, next)}
          /* Offered ONLY on a row that will not arrive by itself. Anything dated or repeating
             now reaches both Todays through `sharedDueOn`, so keeping Bring on those rows gave
             one row two routes onto your day that landed in two different places: a copy in your
             list, or the shared row in the From Just Us strip. Melroy hit exactly that and said
             the obvious thing, "explain the logic here because to me, this is weird". One row,
             one home. On a dated or repeating row the equivalent action lives on Today, where it
             reads as taking the thing on rather than fetching it. */
          onBring={
            (task.recurrence === undefined || task.recurrence.kind === 'none') && !task.due
              ? () => void bring(task)
              : undefined
          }
          brought={pulled.has(task.id)}
          /* A cadence this build cannot read stays INERT: re-cadencing it would overwrite
             whatever a newer build meant, on a list somebody else also keeps. */
          /* "Repeat…" named HALF the field, and that is the label that let dates ship without
             an editor at all: a door named after one of two possible answers cannot be the way
             you reach the other. "When…" asks the question both answers answer, and the value
             rides beside it so the row's current answer is readable without opening anything. */
          onRepeat={frozen || isUnreadableRepeat(task) ? undefined : () => setCadenceId(task.id)}
          repeatLabel={t('ours.when')}
          repeatValue={whenValue(task, now)}
          inert={
            frozen
              ? t('ours.frozenRow')
              : isUnreadableRepeat(task)
                ? t('ours.repeatUnknown')
                : tickableInRoom(task, today, now)
                  ? undefined
                  : t('ours.tickOnItsDay')
          }
          /* The shared list has no per-day skip, so Remove must not borrow "Skip today": it ends
             the repeat, for both of you. The label says what the button does. */
          removesWholeSeries
        />
        {/* A cadence this build cannot read: SHOWN, never hidden, because hiding it means one
            person sees the task and the other does not and each concludes the other deleted it.
            Inert, with whatever plain-English line the writing app left. */}
      </View>
    );
  }

  // FINISHED: one quiet line at the foot, the same line Today uses for its own finished tasks. It never
  // counts (a shared list shows no numbers), never says who, and opens in place. While a card or a
  // selection inside it is open it cannot close: it is announced as unavailable and takes the quiet
  // unavailable look every other unavailable action here has (on the web, an unavailable button also
  // leaves the tab order, as any disabled button does).
  const finishedLine = (
    <Pressable
      key="ours-finished-line"
      ref={lineRef}
      onPress={() => {
        if (finishedHeld) return;
        setFinishedOpen((open) => !open);
      }}
      onLayout={(e) => {
        lineY.current = e.nativeEvent.layout.y;
      }}
      accessibilityRole="button"
      aria-expanded={finishedShown}
      // `disabled`, not aria-disabled: RN-web's Pressable writes its own aria-disabled from this prop
      // over any passed in, and on the phones it sets the accessibility state the same way.
      disabled={finishedHeld}
      accessibilityLabel={finishedShown ? t('ours.finishedHideA11y') : t('ours.finishedShowA11y')}
      hitSlop={4}
      style={({ pressed }) => [styles.finishedLine, finishedHeld && styles.selectOff, pressed && !finishedHeld && styles.pressed]}
    >
      <Text style={styles.finishedLineText}>{t('ours.finishedLine')}</Text>
      <Text style={styles.finishedCaret} accessible={false} importantForAccessibility="no">
        {finishedShown ? '˄' : '˅'}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      {/* The live list is Today's other half (the heading flips between them, with a fade), so it sits on
          Today's own sky. An archived list keeps the plain room background, like the other rooms. */}
      {tabbed ? <LivingBackground /> : null}
      <ScrollView
        ref={scrollRef}
        // The web gets the pill's band as scroll padding, as on Today (P2): a focused row stops above the pill.
        style={[styles.scroll, Platform.OS === 'web' ? ({ scrollPaddingBottom: pillClearance(insets.bottom) } as object) : null]}
        // While the panel is up the list behind it is out of reach: the panel is a modal region.
        accessibilityElementsHidden={sheetOpen}
        importantForAccessibility={sheetOpen ? 'no-hide-descendants' : 'auto'}
        aria-hidden={sheetOpen}
        {...(Platform.OS === 'web' ? ({ inert: sheetOpen } as object) : null)}
        // The list ends with the pill's home (one row of empty space it sits in), or room for the panel.
        contentContainerStyle={[
          styles.content,
          {
            // Tabbed, the heading must sit exactly where Today's does, or the words jump as you flip
            // between them (Melroy, 2026-09-30). Today uses spacing.seven; an archived list is a room.
            paddingTop: insets.top + (tabbed ? spacing.seven : spacing.four),
            paddingBottom: frozen ? spacing.six : sheetOpen ? restingPanelHeight(winH) + 8 : restingListPad(insets.bottom),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => {
          lastTouch.current = nowMs();
        }}
      >
        {tabbed ? (
          <>
            {/* The same status row as Today: the date, and the Menu pill in its place. */}
            <View style={styles.topBar}>
              <Text style={styles.date}>{formatTodayLabel(now)}</Text>
              <MenuPill onPress={() => router.push({ pathname: '/rooms', params: { ours: 'list', from: 'ours' } })} />
            </View>
            <DayHeading current="ours" oursLabel={listName} onToday={goToday} onOurs={() => undefined} />
            {/* The weight, Energy and the tools belong to Today, so they step aside here. What is here
                instead is the one rule of the room, said once. */}
            <Text style={styles.sharedLine}>{t('ours.sharedLine')}</Text>
          </>
        ) : (
          <>
            <BackLink label={t('common.today')} />
            <Text style={styles.title}>{listName}</Text>
          </>
        )}
        {/* The header line is the door to the relationship: rename yourself, the archive, leaving.
            One line, and it names your person rather than counting anything. */}
        {pair?.partnerLabel ? (
          <Pressable
            onPress={() => router.push({ pathname: '/ours', params: { from: 'ours' } })}
            accessibilityRole="button"
            accessibilityLabel={t('ours.keptWith', { name: pair.partnerLabel })}
            hitSlop={6}
          >
            <Text style={styles.keptWith}>{t('ours.keptWith', { name: pair.partnerLabel })} ›</Text>
          </Pressable>
        ) : pair && !pair.hasPartner && !isPairFrozen(pair) ? (
          // The pair exists but nobody has joined yet. This line is the bridge Melroy's C6 check
          // (2026-09-20) and the 2026-09-13 field report both hit the absence of: the Menu lands
          // on this LIST (usable solo while waiting), and without this line it was a dead end
          // with the waiting screen and its re-mint unreachable. Same seat and shape as the
          // kept-with line above, existing strings only.
          // The hairline pill, the repo's proven "reads as tappable without shouting" treatment
          // (Melroy's device verdict on Focus's fit entry; he made the same call here 2026-09-20:
          // plain text hid the tap). The action half carries the accent.
          <Pressable
            onPress={() => router.push({ pathname: '/ours', params: { from: 'ours' } })}
            accessibilityRole="button"
            accessibilityLabel={t('ours.newCode')}
            hitSlop={6}
            style={styles.waitBridge}
          >
            <Text style={styles.keptWith}>
              {t('ours.waitingTitle')} · <Text style={styles.waitBridgeAction}>{t('ours.newCode')} ›</Text>
            </Text>
          </Pressable>
        ) : null}

        {offline ? <Text style={styles.offline}>{t('ours.errOffline')}</Text> : null}
        {/* Saved here, not there. A fact, and a promise that it keeps trying, because the honest
            alternative to silence is not alarm. */}
        {unpushed && !offline ? (
          <Text style={styles.offline}>{readOnly ? t('ours.errClosedList') : t('ours.errUnpushed')}</Text>
        ) : null}
        {notice ? (
          <Pressable onPress={() => setNotice(null)} accessibilityRole="button" accessibilityLabel={t('common.gotIt')} hitSlop={6}>
            <Text style={styles.offline}>{notice}</Text>
          </Pressable>
        ) : null}

        {loaded && visible.length === 0 ? <Text style={styles.empty}>{t('ours.listEmpty')}</Text> : null}

        {/* The rows, the Finished line and the folded rows as ONE keyed list, so a row crossing the line
            (un-ticked inside the fold, it rises to the foot of the list, just above the line) is moved
            rather than remounted: its element, its open card and a keyboard or screen-reader focus on it
            survive the move. */}
        {[...working.map(rowFor), ...(finished.length > 0 ? [finishedLine] : []), ...(finishedShown ? finished.map(rowFor) : [])]}

        {debugOn ? <DebugPanel /> : null}

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

      {/* The scanned words land in the capture box, never straight on the list. Reviewing what a
          camera thought it read is not friction here, it is the whole safeguard: this is a list two
          people keep, and a misread line is a thing your person has to puzzle over. */}
      <CameraCapture
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onTasks={(scanned) => {
          setCameraOpen(false);
          sheetRef.current?.seed(scanned.join('\n'), false);
        }}
      />

      {cadenceTask && (
        <CadenceSheet
          key={cadenceTask.id}
          visible
          onClose={() => setCadenceId(null)}
          today={now}
          /* "Edit repeating task" was true when this sheet only did rhythms, and is wrong on a
             row that may be plain or dated. Both callers used to pass the same key; the drawer
             keeps it, because there the sheet genuinely IS editing a repeating task, and that word
             is the only thing telling you a change lands on the whole series. */
          sheetTitle={t('ours.when').replace('…', '')}
          title={cadenceTask.title}
          recurrence={cadenceTask.recurrence}
          /* The row's current day, so the sheet can see the value the door beside it already names.
             Without it the seeded chip has nothing to fill it from. */
          due={cadenceTask.due}
          /* The whole of the When editor: this surface can answer with NO rhythm. The drawer cannot,
             because there "no rhythm" means the entry should not exist. */
          allowNone
          /* `note` retires here. It said "You'll both see it on its day", which was accurate on
             every save the old sheet could make and becomes a lie the moment Anytime is possible.
             The state-aware summary says it per state instead, and says what ENDS as well. */
          onSave={(title, answer) => setCadence(cadenceTask.id, title, answer)}
        />
      )}

      {/* CAPTURE, the same panel Today uses. The launcher speaks the list's name, so it is obvious
          which room you are typing into, and the whole surface is gone on a closed list: a field you
          can tap into and then not use is crueller than no field, and the server would refuse the
          write in any case.

          The keyboard lift is scoped to the panel being OPEN, exactly as Today scopes it, because
          that is the only time this screen holds focus at the bottom of the window. Nothing on this
          stack raises a bottom-anchored input above an Android keyboard on its own (CLAUDE.md's
          keyboard gotcha, which cost a whole tester round), so it is done by hand here or not at
          all. */}
      {/* THE SELECT SHELF. It takes the capture bar's seat rather than stacking above it: two
          bottom-anchored surfaces competing for the thumb is how a calm screen stops being one, and
          you are not adding things while you are clearing things.

          Narrower than Today's shelf on purpose. Tick and Remove are the two verbs a household list
          actually wants (six things bought in one trip, a finished list cleared), and everything
          else Today offers either authors with a model onto somebody else's screen or leans on a
          field shared rows do not have. */}
      {!frozen && selectMode && (
        <View style={[styles.capture, { paddingBottom: insets.bottom + spacing.three }]}>
          <View style={styles.selectTop}>
            <Text style={selected.length === 0 ? styles.selectHint : styles.selectCount}>
              {selected.length === 0 ? t('today.selectHint') : fmt.plural(selected.length, { one: t('today.selectedCountOne'), other: t('today.selectedCountOther') })}
            </Text>
            <Pressable
              onPress={() => setSelected(shown.map((task) => task.id))}
              disabled={selected.length === shown.length}
              accessibilityRole="button"
              aria-disabled={selected.length === shown.length}
              accessibilityLabel={t('today.selectAllA11y')}
              hitSlop={6}
              style={selected.length === shown.length ? styles.selectOff : undefined}
            >
              <Text style={styles.selectAllText}>{t('today.selectAll')}</Text>
            </Pressable>
          </View>
          {/* Said BEFORE the tap, never discovered after. A shared list has no per-day skip, so
              removing a repeat here ends it for both of you, and that is not a thing to learn from
              the consequence. */}
          {selected.some((id) => {
            const row = tasks.find((task) => task.id === id);
            return row?.recurrence !== undefined && row.recurrence.kind !== 'none';
          }) && <Text style={styles.selectNote}>{t('ours.removeEndsRepeats')}</Text>}
          <View style={styles.selectShelf}>
            <Pressable onPress={exitSelect} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={6}>
              <Text style={styles.selectCancel}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={bulkTick}
              disabled={selected.length === 0}
              accessibilityRole="button"
              accessibilityLabel={t('today.markSelectedDoneA11y')}
              hitSlop={6}
              style={selected.length === 0 ? styles.selectOff : undefined}
            >
              <Text style={styles.selectDone}>{t('common.done')}</Text>
            </Pressable>
            <Pressable
              onPress={bulkRemove}
              disabled={selected.length === 0}
              accessibilityRole="button"
              // One and Other, as Today does. This asked for a removeCountA11y key that no catalogue has, so a screen
              // reader spoke the raw key (t() takes any string; lib/catalog-keys.test.ts now catches that).
              accessibilityLabel={t(selected.length === 1 ? 'today.removeCountA11yOne' : 'today.removeCountA11yOther', { count: String(selected.length) })}
              hitSlop={6}
              style={selected.length === 0 ? styles.selectOff : undefined}
            >
              <Text style={styles.selectRemove}>{t('common.remove')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* The composer: the floating pill and the panel that rises from it, the same object as Today's.
          MOUNTED always (hidden while selecting, never unmounted), which is the capture iron rule that typed
          text is never lost: tick something mid-sentence, come back, the words are still there. A closed
          list takes no new rows, so it has no pill at all. */}
      {!frozen && (
        <CaptureSheet
          ref={sheetRef}
          heading={t('ours.addTo', { name: listName })}
          // The pill steps aside while a card is held, as on Today (P1), and only for a card on the screen.
          hidden={selectMode || (confirmingId != null && shown.some((task) => task.id === confirmingId))}
          onOpenChange={onSheetOpenChange}
          onCapture={captureFromSheet}
          whenNote={whenNote}
          today={now}
          /* STEPS stay off: a shared row has no `slices` field to hold them, and breaking a
             thing down is a personal shaping tool. How you approach a task is yours; that it
             needs doing is the household's.

             WHEN is ON, with ANYTIME as its resting answer, and that is a reversal of the
             call made when this bar was built. The reasoning then was that a shared list is
             not a day. It has become one, in the only sense that matters: a dated or repeating
             shared row now appears on BOTH your Todays, so choosing a day here is a real and
             useful act rather than a word that means nothing. Anytime stays the default because
             most of a household list has no day and must never become somebody's morning. */
          whenDefault="anytime"
          allowSteps={false}
          /* Break-it-down and Sort-for-me stay off, by omission rather than a flag: they have a
             model AUTHOR content that then lands on a list another person reads, and pointing a
             model at somebody else's screen is a decision about them, not a UI convenience.

             SCAN is not that, which is worth spelling out because the sentence above nearly
             excluded it by association. Scan reads a photo YOU pointed a camera at and drops the
             words into YOUR capture box, where you read them, edit them, and Add them yourself.
             The model commits nothing; it is a camera-shaped keyboard. And the photo never
             reaches the shared table at all: your person sees the rows you added, exactly as if
             you had typed them. */
          onCamera={() => {
            if (premiumLoading) return; // entitlement still resolving: a tap is a no-op, never a wrong bounce
            if (!premium) {
              // Tagged apart from Today's own OCR gate on purpose. A paywall met on a surface a
              // second person can see is a genuinely different moment from one met alone, and
              // whether the shared list converts is a thing worth being able to answer.
              track('premium.gate_hit', { reason: 'ocr_ours' });
              router.push({ pathname: '/premium', params: { from: 'ocr_ours' } });
              return;
            }
            setCameraOpen(true);
          }}
        />
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
    keptWith: { color: t.colors.skyInk, fontSize: 15 * t.scale, fontFamily: fonts.body, marginTop: spacing.one },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.one },
    date: { color: t.colors.skyInk, fontSize: 15 * t.scale, fontFamily: fonts.body },
    sharedLine: { color: t.colors.skyInk, fontSize: 14 * t.scale, lineHeight: 21 * t.scale, fontFamily: fonts.body, marginTop: 9 },
    waitBridge: {
      alignSelf: 'flex-start',
      marginTop: spacing.two,
      paddingVertical: spacing.two,
      paddingHorizontal: spacing.four,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.pill,
    },
    waitBridgeAction: { color: t.colors.skyAccent, fontFamily: fonts.bodyBold, fontWeight: '600' },
    offline: { color: t.colors.skyInk, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.three },
    empty: {
      color: t.colors.skyInk,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 24 * t.scale,
      marginTop: spacing.six,
    },
    // Recently removed: dimmed, at the foot, folded away from the working list. It never says who.
    removedFold: { marginTop: spacing.six, borderTopWidth: border.hair, borderTopColor: t.colors.line, paddingTop: spacing.four },
    removedHeading: { color: t.colors.skyInk, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    removedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, marginTop: spacing.three },
    removedTitle: { flex: 1, color: t.colors.skyInk, fontSize: 15 * t.scale, fontFamily: fonts.body },
    restore: { color: t.colors.skyAccent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    removedHint: { color: t.colors.skyInk, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.three },
    row: { marginTop: spacing.two },
    // The Finished line: Today's own done line (a hairline, the word and a caret in soft ink, the whole row a
    // 44pt tap), drawn here rather than shared, because Today is frozen until 3 Jan.
    finishedLine: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.three,
      paddingHorizontal: spacing.two,
      borderTopWidth: border.hair,
      borderTopColor: t.appearance === 'quiet' ? t.quiet.hairline : t.colors.line,
    },
    finishedLineText: { color: t.colors.skyInk, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    finishedCaret: { color: t.colors.skyInk, fontSize: 15 * t.scale, fontFamily: fonts.body },
    pressed: { opacity: PRESSED_OPACITY },
    capture: {
      paddingHorizontal: spacing.five,
      paddingTop: spacing.three,
      borderTopWidth: border.hair,
      borderTopColor: t.colors.line,
      backgroundColor: t.colors.bg,
    },
    // The select shelf, docked at the foot while selecting (the pill steps aside).
    selectTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.three },
    selectHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    selectCount: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    selectAllText: { color: t.colors.accentText, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    selectNote: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginBottom: spacing.three },
    selectShelf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectCancel: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body },
    selectDone: { color: t.colors.accentText, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    selectRemove: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body },
    // Quiet-unavailable rather than absent: the control keeps its place at lowered contrast, which
    // is the same treatment every other unavailable action in this app gets.
    selectOff: { opacity: 0.45 },
  });
