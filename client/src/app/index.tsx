import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bloom, type BloomData } from '@/components/Bloom';
import { BrainDump, type BrainDumpHandle } from '@/components/BrainDump';
import { CameraCapture } from '@/components/CameraCapture';
import { type BreakdownAnswers, BreakdownQuestions } from '@/components/BreakdownQuestions';
import { BreakdownReview, type ReviewPhase, type ReviewStep } from '@/components/BreakdownReview';
import { DatePicker } from '@/components/DatePicker';
import { LivingBackground } from '@/components/LivingBackground';
import { ModalCard } from '@/components/ModalCard';
import { PremiumButton } from '@/components/PremiumButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RepeatingDrawer } from '@/components/RepeatingDrawer';
import { RoomsSheet } from '@/components/RoomsSheet';
import { RotatingPhrase } from '@/components/RotatingPhrase';
import { TaskRow } from '@/components/TaskRow';
import { border, fonts, layout, motion, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import {
  clarify,
  combine,
  DEFAULT_QUESTIONS,
  plan as planBreakdown,
  purgeScrapbookImages,
  reportOutcome,
  sequence,
  strategise,
  tiny,
  triage,
  type OrderItem,
  type PlanItem,
  type Questions,
} from '@/lib/ai';
import { useSession } from '@/lib/auth';
import { completionsByDay } from '@/lib/calendar';
import { celebrationTier, finishContext } from '@/lib/celebrate';
import { combineTasks, eligibleForCombine } from '@/lib/combine';
import { ageInDays, isBigWin } from '@/lib/reward';
import { phaseGreeting } from '@/lib/phase';
import { addDaysISO, formatTodayLabel, friendlyDate, isReentry, presetDate, toISODate } from '@/lib/day';
import { dayWeight, weightedLoad } from '@/lib/estimate';
import { dayCleared, dayClosed, stepsLanded, taskDone } from '@/lib/haptics';
import { type Inbound, subscribeInbound, takeInbound } from '@/lib/inbound';
import { aiLanguage } from '@/lib/locale';
import { buildOutcome } from '@/lib/outcome';
import { scheduleFields, type CaptureSchedule } from '@/lib/recurrence';
import { availableNudgePresets, isWindDownTime, type NudgePreset, nudgeTargetFor } from '@/lib/nudge';
import { cancelNudge, disableDailyReminder, enableDailyReminder, scheduleNudge } from '@/lib/reminders';
import { applySliceDelta } from '@/lib/slices';
import { spreadDueDates } from '@/lib/spread';
import { loadClosedDate, loadLastOpen, loadLowDayDate, loadOnboarded, loadReminderOn, loadScrapbooks, loadSyncedOwner, loadTasks, saveClosedDate, saveLastOpen, saveLowDayDate, saveReminderOn, saveSyncedOwner, saveTasks, wipeLocalData } from '@/lib/storage';
import { isSyncConfigured, supabase } from '@/lib/supabase';
import { isAccountGone, localBelongsToAnother, syncOnce } from '@/lib/sync';
import { parseDump, sweepElapsedNudges, type Task } from '@/lib/tasks';
import { summarizeAdded, summaryLine, triageToTasks } from '@/lib/triage';
import { track } from '@/lib/telemetry';
import { updateWidget } from '@/widget/update';
import { useReducedMotion, useTheme, useThemedStyles } from '@/lib/theme-provider';
import { usePremium } from '@/lib/premium-provider';
import { applyManualOrder, completeAncestors, deferTo, deferToTomorrow, hasActiveTinyChild, isDoneOn, isRecurring, pinFirst, resurfaceOpenParent, setBig, setPin, setSequence, tasksForToday, tinyParentTitle, toggleDoneOn, upcomingTasks } from '@/lib/today';

import closeDayArt from '../../assets/images/closeday.jpg';
import emptyArt from '../../assets/images/empty.jpg';

let addCounter = 0;
const REENTRY_GAP_DAYS = 4; // a calm "welcome back" shows on the first open after this many days away

function makeId(): string {
  addCounter += 1;
  return `t-${Date.now().toString(36)}-${addCounter.toString(36)}`;
}

// Clock read, kept at module scope so handlers stay pure for the render linter
// (same reason makeId lives here). Bumps updatedAt / stamps tombstones.
function nowMs(): number {
  return Date.now();
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [closedDate, setClosedDate] = useState<string | null>(null);
  const [lowDayDate, setLowDayDate] = useState<string | null>(null);
  const [sortSummary, setSortSummary] = useState<string | null>(null);
  const [affirmation, setAffirmation] = useState<string | null>(null); // a brief "done is done" / "good enough" reassurance; auto-clears
  const [bloom, setBloom] = useState<BloomData | null>(null); // the held whole-task-finish celebration
  const [roomsOpen, setRoomsOpen] = useState(false); // the Rooms navigation sheet (collapses the 4 header links)
  const affirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tinyBusy = useRef(false); // guards the make-it-tiny AI call from a double-fire
  const [reentry, setReentry] = useState(false);
  const [didOpen, setDidOpen] = useState(false);
  const [didText, setDidText] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [moveToOpen, setMoveToOpen] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false); // the Combine review modal
  const [combineTitle, setCombineTitle] = useState(''); // the editable umbrella title (AI-suggested)
  const [beingCombined, setBeingCombined] = useState<string[]>([]); // snapshot of the ids being folded
  const combineBusy = useRef(false); // guards the combine AI call from a double-fire
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [nudgePresets, setNudgePresets] = useState<NudgePreset[]>([]);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusPick, setFocusPick] = useState<string | null>(null);
  const { premium, loading: premiumLoading } = usePremium(); // gates Pin; a dev override drives it locally
  const brainDumpRef = useRef<BrainDumpHandle>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false); // the OCR photo-capture modal (premium)
  const { width: winW } = useWindowDimensions();
  const dockFooter = Platform.OS !== 'web' || winW < 700; // native + narrow web dock, wide web blends into the page
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [strategising, setStrategising] = useState(false);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [strategiseError, setStrategiseError] = useState<string | null>(null);
  const [offerDefer, setOfferDefer] = useState(false); // after "Plan my day" orders a heavy day, offer to lighten it
  const [order, setOrder] = useState<OrderItem[] | null>(null);
  const [sequencing, setSequencing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  // Break it down, the two-call flow: qualify (questions) -> decompose (review).
  const [bdPhase, setBdPhase] = useState<'off' | 'questions' | 'review'>('off');
  const [bdTask, setBdTask] = useState('');
  const [bdParentId, setBdParentId] = useState<string | null>(null); // the existing task being broken down (its id becomes the silent parent), or null for an at-capture breakdown
  const [bdQuestions, setBdQuestions] = useState<Questions | null>(null);
  const [bdSteps, setBdSteps] = useState<ReviewStep[] | null>(null);
  const [bdPhases, setBdPhases] = useState<ReviewPhase[] | null>(null);
  const [bdAnswers, setBdAnswers] = useState<BreakdownAnswers | null>(null);
  const [bdBusy, setBdBusy] = useState(false);
  const [bdError, setBdError] = useState<string | null>(null);
  const [bdCorrId, setBdCorrId] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);
  const router = useRouter();
  const session = useSession();
  const tasksRef = useRef<Task[]>(tasks);
  const reduced = useReducedMotion();
  // The close-the-day card's gentle entrance (0 = below + transparent, 1 = settled).
  // useState, not useRef: reading a ref in render trips the React Compiler lint.
  const [closeRise] = useState(() => new Animated.Value(0));
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();

  // Re-read the persisted list on every focus, not only first mount, so returning
  // to Today always reflects the current store, including after an account deletion
  // wipes it (native keeps a mounted screen alive on router.replace; web reloads).
  // The `loaded` gate still holds the empty / all-done copy until the first load
  // lands so neither flashes.
  // First run: if the welcome has never been completed, redirect to it once. Keyed
  // off the onboarded flag, not task count, since a fresh install seeds example tasks.
  useEffect(() => {
    let active = true;
    void loadOnboarded().then((done) => {
      if (active && !done) router.replace('/welcome');
    });
    return () => {
      active = false;
    };
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadTasks().then((stored) => {
        if (!active) return;
        // Clear nudges whose time has already passed so a fired (or moot) reminder does not
        // leave a stale bell on the row, then persist if anything was swept.
        const swept = sweepElapsedNudges(stored, nowMs());
        setTasks(swept);
        if (swept !== stored) void saveTasks(swept);
        setLoaded(true);
      });
      void loadClosedDate().then((d) => {
        if (active) setClosedDate(d);
      });
      void loadLowDayDate().then((d) => {
        if (active) setLowDayDate(d);
      });
      void loadLastOpen().then((last) => {
        if (!active) return;
        if (isReentry(last, today, REENTRY_GAP_DAYS)) {
          setReentry(true);
          track('reentry.shown');
        }
        void saveLastOpen(toISODate(today));
      });
      return () => {
        active = false;
      };
    }, [today]),
  );

  // Keep the latest tasks reachable from the sync effect without making it re-run
  // on every edit (which would re-sync constantly).
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Reflect the persisted daily-reminder toggle (the schedule itself survives restarts).
  useEffect(() => {
    let active = true;
    void loadReminderOn().then((on) => {
      if (active) setReminderOn(on);
    });
    return () => {
      active = false;
    };
  }, []);

  // Sweep elapsed "remind me" nudges whenever the app returns to the foreground, so a bell
  // whose time passed while the app was backgrounded clears on return. The load sweep covers
  // a cold open, this covers a warm resume (which does not re-fire useFocusEffect). Reads the
  // live tasks via the ref so the listener never needs re-binding.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const swept = sweepElapsedNudges(tasksRef.current, nowMs());
      if (swept !== tasksRef.current) {
        setTasks(swept);
        void saveTasks(swept);
      }
    });
    return () => sub.remove();
  }, []);

  // Opt-in cloud sync: when signed in (and configured), reconcile once with the
  // account and persist the merged result. Runs on sign-in and on open. Realtime
  // and push-on-change are deferred (see BUILD-PLAN backlog). Failures are silent
  // and logged, the app stays usable offline regardless.
  useEffect(() => {
    if (!supabase || !session) return;
    const client = supabase;
    const uid = session.user.id;
    let active = true;
    void (async () => {
      // Cross-account guard: if the local store was last synced with a DIFFERENT
      // account (a sign-out then sign-in as someone else, or a half-finished sign-out),
      // never merge or migrate its tasks into this account. Start the merge from empty,
      // and clear the visible list first. Anonymous local (no prior owner) still migrates.
      const foreign = localBelongsToAnother(await loadSyncedOwner(), uid);
      if (foreign) {
        setTasks([]);
        void wipeLocalData();
      }
      try {
        const merged = await syncOnce(client, foreign ? [] : tasksRef.current, uid);
        if (!active) return;
        setTasks(merged);
        void saveTasks(merged);
        void saveSyncedOwner(uid);
        track('sync.completed', { count: merged.length });
      } catch (e) {
        if (isAccountGone(e)) {
          // The account was deleted (here or on another device), so writes now fail the
          // user_id foreign key. Clear this orphaned device's synced tasks and ownership
          // and sign out, rather than keep showing a deleted account's data. Local-only
          // data (tasks, scrapbooks, routines, per-day state) is wiped; only display prefs stay.
          if (!active) return;
          setTasks([]);
          void purgeScrapbookImages((await loadScrapbooks()).map((b) => b.image));
          void wipeLocalData();
          void client.auth.signOut();
          track('sync.account_gone');
        } else {
          track('sync.failed', { error: e instanceof Error ? e.message : e });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [session]);

  // Drive the close-the-day card's soft fade-and-rise on open. Reduced motion
  // shows it settled instantly, never moving for users who opt out of motion.
  useEffect(() => {
    if (!closing) {
      closeRise.setValue(0);
      return;
    }
    if (reduced) {
      closeRise.setValue(1);
      return;
    }
    const anim = Animated.timing(closeRise, {
      toValue: 1,
      duration: motion.gentle,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [closing, reduced, closeRise]);

  // Focus mode is for sitting with a single task; hold a wake lock while it is open so
  // the screen does not dim and sleep mid-task, released the moment Focus closes (or the
  // screen unmounts). Native only; the web build has no wake lock worth requesting here.
  useEffect(() => {
    if (!focusOpen || Platform.OS === 'web') return;
    void activateKeepAwakeAsync('doubledone-focus');
    return () => {
      void deactivateKeepAwake('doubledone-focus');
    };
  }, [focusOpen]);

  // Inbound launch intents (a launcher shortcut, or shared text) are stashed at the app
  // root and consumed here: open Focus, or seed and focus the capture box. Drained once
  // on mount (a cold launch) and on each later arrival while Today is open.
  const applyInbound = useCallback((i: Inbound | null) => {
    if (!i) return;
    if (i.kind === 'focus') {
      setFocusPick(null);
      setFocusOpen(true);
      track('focus.opened', { via: 'shortcut' });
      return;
    }
    brainDumpRef.current?.seed(i.kind === 'capture' ? i.text : null);
    track(i.kind === 'capture' ? 'capture.shared' : 'capture.shortcut');
  }, []);

  useEffect(() => subscribeInbound(() => applyInbound(takeInbound())), [applyInbound]);

  const visible = pinFirst(applyManualOrder(tasksForToday(tasks, today))); // the pin floats to the very top, then any accepted manual order
  const upcoming = upcomingTasks(tasks, today);
  const allDone = loaded && visible.length > 0 && visible.every((t) => isDoneOn(t, today));
  // Closed when the stored close-date is today's; it self-clears when the date rolls over.
  const isClosed = closedDate === toISODate(today);
  const isLowDay = lowDayDate === toISODate(today);
  const windDown = isWindDownTime(today); // evening: a gentle in-app nudge toward closing the day
  const todayDone = useMemo(() => completionsByDay(tasks).get(toISODate(today)) ?? [], [tasks, today]);
  // One-off, undone tasks on Today: the ones Strategise can re-spread (recurring stay by cadence).
  const spreadable = visible.filter((t) => !isRecurring(t) && !isDoneOn(t, today));
  const onlyTask = selected.length === 1 ? visible.find((t) => t.id === selected[0]) : undefined;
  // For the multi-select "Big" toggle: true when every selected task is already big, so the action flips to
  // "Not big" (clear); a mixed or empty selection marks all big (the additive, validating default).
  const allBig = selected.length > 0 && selected.every((id) => tasks.find((t) => t.id === id)?.big);
  // The selected tasks eligible to combine (open one-offs); the Combine action shows at 2+.
  const combinable = selected.filter((id) => {
    const t = tasks.find((x) => x.id === id);
    return t != null && eligibleForCombine(t);
  });
  // Focus mode shows one unfinished one-off at a time (recurring habits are not the
  // wall-of-awful). The first not-yet-skipped one; completing or skipping advances it.
  const focusTask = focusOpen && focusPick ? (spreadable.find((t) => t.id === focusPick) ?? null) : null;
  const bigCount = spreadable.filter((t) => t.big).length;
  const weightOfDay = dayWeight(spreadable.length, isLowDay, bigCount);
  // A big task weighs more than its count: weightedLoad makes each big count as BIG_WEIGHT normal tasks, so a
  // genuinely piled day (or one big task plus a real pile) reads heavy and offers the relief tools. A LONE big
  // task lifts the gauge (the floor inside dayWeight) but does NOT trip this: re-spreading cannot dissolve one
  // big rock, Break it down is the tool for that. Heavy (and low-day capacity) gates the nudge + "Lighten today".
  const weighted = weightedLoad(spreadable.length, bigCount);
  const dayIsHeavy = weighted >= 6 || (isLowDay && weighted >= 4);

  // When a task leaves the active-today state (done, removed, deferred), cancel any pending
  // nudge and strip its fields, so you are never poked about something already handled.
  function clearNudgeIfAny(task: Task): Task {
    if (!task.nudgeId) return task;
    void cancelNudge(task.nudgeId);
    const next = { ...task };
    delete next.nudgeId;
    delete next.nudgeAt;
    return next;
  }

  function commit(next: Task[]) {
    setTasks(next);
    void saveTasks(next);
    void updateWidget(next, closedDate); // keep any home-screen widget in sync (native; no-op on web)
  }

  // Soft-delete: tombstone the task (hidden from every view) rather than dropping
  // it, so the deletion can sync to other devices instead of resurrecting on pull.
  function removeTask(id: string) {
    const now = nowMs();
    commit(tasks.map((t) => (t.id === id ? clearNudgeIfAny({ ...t, deletedAt: now, updatedAt: now }) : t)));
    setConfirmingId(null);
    track('task.removed');
  }

  // Push a one-off to tomorrow: a calm "not today" that moves a single task
  // forward a day (it returns tomorrow), the single-task sibling of close-the-day's
  // roll forward. Never-shame: no counter, no penalty, just a date move.
  function deferTask(id: string) {
    const now = nowMs();
    commit(tasks.map((t) => (t.id === id ? clearNudgeIfAny({ ...deferToTomorrow(t, today), updatedAt: now }) : t)));
    setConfirmingId(null);
    track('task.deferred');
  }

  // "Just this one" focus mode: complete the focused task fully (slices included) by
  // the same done/completedAt path, then the next unfinished one surfaces on its own.
  function focusComplete(id: string) {
    const now = nowMs();
    commit(
      tasks.map((t) => {
        if (t.id !== id) return t;
        const slices = t.slices ? { total: t.slices.total, done: t.slices.total } : t.slices;
        return clearNudgeIfAny({ ...t, done: true, completedAt: now, updatedAt: now, ...(slices ? { slices } : {}) });
      }),
    );
    track('focus.completed');
    setFocusPick(null); // back to "Which one?" so the next can be chosen, or the calm empty state
  }

  function openFocus() {
    // Focus opens straight to the pinned task when there is one, so pin and Focus compose: the pin
    // is the persistent anchor, Focus is the session that works it. Otherwise it asks "Which one?".
    const pinned = spreadable.find((t) => t.pinnedAt != null);
    setFocusPick(pinned ? pinned.id : null);
    setFocusOpen(true);
    track('focus.opened');
  }

  function closeFocus() {
    setFocusOpen(false);
    setFocusPick(null);
  }

  // Pin a task as the day's ONE priority (premium): stamp pinnedAt on it and clear the pin off every
  // other task, so at-most-one holds. Both the new pin and any displaced one bump updatedAt, so the
  // change syncs cleanly. A leaf field, so nothing else about the task moves. Tapping a pinned task's
  // Unpin just clears it. The premium gate lives in the button; this is the entitled path.
  function pinTask(id: string) {
    const wasPinned = tasks.find((t) => t.id === id)?.pinnedAt != null;
    commit(setPin(tasks, id, nowMs())); // the at-most-one invariant + the updatedAt bumps live in setPin (pure, tested)
    track(wasPinned ? 'task.unpinned' : 'task.pinned');
    affirm(wasPinned ? 'Unpinned.' : 'Pinned. Your one thing for today.');
    exitSelect();
  }

  // Tap-and-hold a task to enter selection with that task already picked, then act
  // on one or several at once. This is the calm "clear a few quickly" path; it
  // replaces both the old long-press single-task menu and the Select-several button.
  // Android carries the long-press through the row's re-render into select mode, so the
  // thumb-lift then fires onSelect on the now-select row and would toggle the id straight
  // back off. selectGuard remembers the just-selected id so toggleSelect swallows that one.
  const selectGuard = useRef<{ id: string; at: number } | null>(null);
  function enterSelectWith(id: string) {
    setSelectMode(true);
    setSelected([id]);
    selectGuard.current = { id, at: nowMs() };
    track('select.opened');
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected([]);
  }
  function toggleSelect(id: string) {
    const g = selectGuard.current;
    if (g && g.id === id && nowMs() - g.at < 800) {
      selectGuard.current = null; // swallow the one spurious release right after a long-press
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function bulkComplete() {
    if (selected.length === 0) return;
    const now = nowMs();
    const set = new Set(selected);
    commit(
      tasks.map((t) => {
        if (!set.has(t.id) || isDoneOn(t, today)) return t;
        const toggled = { ...toggleDoneOn(t, today), updatedAt: now };
        if (!isRecurring(toggled)) toggled.completedAt = toggled.done ? now : null;
        return toggled;
      }),
    );
    track('bulk.completed', { count: selected.length });
    affirm('Done is done. Recorded.');
    exitSelect();
  }
  function bulkRemove() {
    if (selected.length === 0) return;
    const now = nowMs();
    const set = new Set(selected);
    commit(tasks.map((t) => (set.has(t.id) ? clearNudgeIfAny({ ...t, deletedAt: now, updatedAt: now }) : t)));
    track('bulk.removed', { count: selected.length });
    exitSelect();
  }
  function bulkMoveTo(iso: string) {
    if (selected.length === 0) return;
    const now = nowMs();
    const set = new Set(selected);
    commit(tasks.map((t) => (set.has(t.id) && !isRecurring(t) ? clearNudgeIfAny({ ...deferTo(t, iso), updatedAt: now }) : t)));
    track('bulk.moved', { count: selected.length });
    setMoveToOpen(false);
    exitSelect();
  }

  // Mark (or unmark) the selected tasks as big: the user saying these weigh heavily. Free, multi-select,
  // and validating, never a scold. Lifts the weight gauge + the heavy-day signal, and makes finishing one a
  // big-win. The toggle direction (allBig) is decided at the call site, so a second tap reverses it.
  function markBig(ids: string[], on: boolean) {
    if (ids.length === 0) return;
    commit(setBig(tasks, ids, on, nowMs()));
    track('bulk.big', { count: ids.length, on });
    affirm(on ? "Marked as a lot. The day knows it's heavier." : 'Eased off. No longer marked.');
    exitSelect();
  }

  // Combine (the inverse of Break-it-down): hand the selected one-offs' titles to the AI for
  // an umbrella name, then show it editable. The AI is best-effort, a failure just opens the
  // review with an empty name to type, so the flow never blocks. The fold runs on accept.
  async function openCombine() {
    if (combineBusy.current) return;
    const ids = combinable;
    if (ids.length < 2) return;
    combineBusy.current = true;
    setBeingCombined(ids);
    affirm('Finding a name…');
    const titles = ids
      .map((id) => tasks.find((t) => t.id === id)?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
    let suggested = '';
    try {
      suggested = await combine(titles, aiLanguage);
    } catch {
      // best-effort: open the review with an empty name for the user to type
    } finally {
      combineBusy.current = false;
    }
    setCombineTitle(suggested);
    setCombineOpen(true);
  }

  // Accept the umbrella: fold the selected tasks into one new task at the earliest of their due
  // dates (tombstoning the originals, recorded on the umbrella's combinedFrom), and tombstone any
  // silent parent the combine empties. The umbrella completes like an ordinary task (no bloom).
  function combineAccept() {
    const title = combineTitle.trim();
    if (!title || beingCombined.length < 2) return;
    const { next } = combineTasks(tasks, beingCombined, title, nowMs(), makeId());
    commit(next);
    track('combine.created', { count: beingCombined.length });
    affirm(`Combined into one: ${title}.`);
    setCombineOpen(false);
    setCombineTitle('');
    setBeingCombined([]);
    exitSelect();
  }

  // "Remind me": a calm preset chooser (the late-night guard hides anything that would fire
  // past 9pm), then a local nudge for the single selected task, stamped so the row shows it
  // and so done / remove / defer can cancel it. Native only; the web build no-ops.
  function openNudge() {
    setNudgePresets(availableNudgePresets(new Date()));
    setNudgeOpen(true);
  }
  async function pickNudge(presetId: string) {
    const task = onlyTask;
    setNudgeOpen(false);
    if (!task) return;
    const target = nudgeTargetFor(presetId, new Date());
    if (!target) return;
    const id = await scheduleNudge(task.id, task.title, target);
    if (id) {
      commit(tasks.map((t) => (t.id === task.id ? { ...t, nudgeAt: target.getTime(), nudgeId: id, updatedAt: nowMs() } : t)));
      track('nudge.set', { preset: presetId });
    }
    exitSelect();
  }

  function signOut() {
    if (!supabase) return;
    const client = supabase;
    const uid = session?.user.id;
    void (async () => {
      // Sync is on-open only, so push any pending local changes to this account before
      // the session ends, or they would be orphaned. Best effort: a failed push (e.g.
      // offline) must not block sign-out, and the local store is left intact so no work
      // is lost. The cross-account guard runs on the next sign-in, not here.
      if (uid) {
        try {
          await syncOnce(client, tasksRef.current, uid);
        } catch {
          // offline / transient: keep local intact, never lose work
        }
      }
      await client.auth.signOut();
    })();
    track('auth.signed_out');
  }

  // Close the day: a calm wrap, not a mechanical reset. Undone tasks already roll
  // forward on their own, so this is purely the closing ritual.
  function openClose() {
    setClosing(true);
    track('day.closed', { finished: todayDone.length });
  }

  function reopenDay() {
    setClosedDate(null);
    void saveClosedDate(null);
    track('day.reopened');
  }

  // A low-capacity day: one tap recalibrates the weight gauge to a gentler target and
  // gives permission to do little. Per-day (self-clears at midnight), never a setting,
  // never-shame. The backlog is untouched, only the day's expectation shrinks.
  function toggleLowDay() {
    if (isLowDay) {
      setLowDayDate(null);
      void saveLowDayDate(null);
      track('lowday.off');
    } else {
      const iso = toISODate(today);
      setLowDayDate(iso);
      void saveLowDayDate(iso);
      track('lowday.on');
      affirm('A low day. Be gentle, a little is plenty.');
    }
  }

  function openDrawer() {
    setDrawerOpen(true);
    track('repeating.opened');
  }

  // A calm daily reminder, opt-in. Native schedules a local one; on web (Phase 2)
  // reminders.web.ts subscribes to a web-push daily nudge. Same toggle, platform-fit.
  async function toggleReminder() {
    if (reminderOn) {
      await disableDailyReminder();
      setReminderOn(false);
      void saveReminderOn(false);
      track('reminder.disabled');
    } else {
      const ok = await enableDailyReminder();
      setReminderOn(ok);
      void saveReminderOn(ok);
      track('reminder.enabled', { granted: ok });
    }
  }

  // Strategise: hand today's one-offs to the AI, get a calm re-spread, then PROPOSE
  // it (the user accepts). Never rearranges the day on its own.
  async function runStrategise() {
    if (strategising) return;
    setStrategiseError(null);
    setStrategising(true);
    try {
      const result = await strategise(spreadable.map((t) => ({ id: t.id, title: t.title, big: t.big })), aiLanguage);
      track('strategise.requested', { count: spreadable.length });
      setPlan(result);
    } catch {
      setStrategiseError('Could not strategise just now. Try again.');
    } finally {
      setStrategising(false);
    }
  }

  function acceptPlan() {
    if (!plan) return;
    const byId = new Map(plan.map((p) => [p.id, p.dayOffset]));
    const now = nowMs();
    const next = tasks.map((t) => {
      const off = byId.get(t.id);
      if (off == null) return t;
      // dayOffset 0 keeps it on Today (undated); >0 sets a future due date.
      return { ...t, due: off <= 0 ? null : addDaysISO(today, off), updatedAt: now };
    });
    commit(next);
    track('strategise.accepted', { moved: plan.filter((p) => p.dayOffset > 0).length });
    setPlan(null);
  }

  // Plan my order: hand today's one-offs to the AI, get a calm suggested SEQUENCE, then PROPOSE it (the user
  // accepts). Never reorders the day on its own. Premium-gated at the moment of asking (abundance).
  async function runSequence() {
    if (sequencing || premiumLoading) return;
    if (!premium) {
      track('premium.gate_hit', { reason: 'sequence' });
      router.push('/premium');
      return;
    }
    setOrderError(null);
    setSequencing(true);
    try {
      const result = await sequence(spreadable.map((t) => ({ id: t.id, title: t.title })), undefined, aiLanguage);
      track('sequence.requested', { count: spreadable.length });
      if (result.length > 0) setOrder(result);
      else setOrderError('Could not plan an order just now. Try again.');
    } catch {
      setOrderError('Could not plan an order just now. Try again.');
    } finally {
      setSequencing(false);
    }
  }

  function acceptOrder() {
    if (!order) return;
    commit(setSequence(tasks, order.map((o) => o.id), nowMs()));
    track('sequence.accepted', { count: order.length });
    setOrder(null);
    // Once the day is ordered, if it is still heavy, offer to lighten it (the re-spread). On a calm day
    // there is nothing to push out, so just affirm and stay out of the way.
    if (dayIsHeavy) setOfferDefer(true);
    else affirm('A gentle order, top of the list when you are ready.');
  }

  // A brief, consistent reassurance after completing (Done-is-done / Good-enough). One
  // timer at a time, so a fresh completion is never cut short by an older one's clear.
  function affirm(line: string) {
    setAffirmation(line);
    if (affirmTimer.current) clearTimeout(affirmTimer.current);
    affirmTimer.current = setTimeout(() => setAffirmation(null), 3500);
  }

  // Stable so the Bloom's hold timer is not reset on every re-render of Today.
  const dismissBloom = useCallback(() => setBloom(null), []);

  function toggle(id: string) {
    const next = tasks.map((t) => {
      if (t.id !== id) return t;
      const toggled = { ...toggleDoneOn(t, today), updatedAt: nowMs() };
      // Stamp the completion time for one-offs so the calendar can place them on the
      // right day. Recurring tasks carry their own dated completedDates instead.
      if (!isRecurring(toggled)) toggled.completedAt = toggled.done ? nowMs() : null;
      return isDoneOn(toggled, today) ? clearNudgeIfAny(toggled) : toggled;
    });
    const justToggled = next.find((t) => t.id === id);
    const done = justToggled ? isDoneOn(justToggled, today) : false;
    // The moat starts at the call site: log the outcome, not just "done".
    track('task.toggled', { done });
    // The moat's completion half: a finished breakdown step reports an anonymised
    // outcome (id + timing only), so "how long this takes" becomes real data over time.
    if (justToggled && justToggled.decompositionId && isDoneOn(justToggled, today)) {
      const outcome = buildOutcome(justToggled, nowMs());
      if (outcome) void reportOutcome(outcome);
    }
    // Cluster B: completing a child may finish its silent parent (decompose, exhaustive),
    // or resurface its open parent (tiny-version, partial pebbles). Either is the real task.
    let finalTasks = next;
    let parentBack: string | null = null;
    let bloomData: BloomData | null = null;
    if (done && justToggled?.parentId) {
      const parent = next.find((t) => t.id === justToggled.parentId);
      if (parent?.openParent) {
        // a tiny-version pebble done: bring the real task back (it never auto-completes) and
        // retire the spent pebble, so pebbles never pile up however often it is shrunk
        const { tasks: resurfaced, parentTitle } = resurfaceOpenParent(next, id, nowMs());
        finalTasks = resurfaced;
        parentBack = parentTitle;
        track('tiny.stepDone');
      } else {
        const { tasks: walked, completed } = completeAncestors(next, id, today, nowMs());
        finalTasks = walked;
        if (completed.length > 0) {
          const whole = completed[completed.length - 1]; // the topmost finished task: the whole thing
          const stepCount = finalTasks.filter((t) => t.parentId === whole.id && !t.deletedAt).length;
          const tier = celebrationTier({ bigWin: isBigWin(whole), lingerDays: ageInDays(whole), stepMinutes: whole.complexity ?? 0 });
          bloomData = { title: whole.title, context: finishContext({ lingerDays: ageInDays(whole), stepCount }), tier: tier.tier, durationMs: tier.durationMs };
          track('parent.completed', { depth: completed.length });
        }
      }
    }
    const todays = tasksForToday(finalTasks, today);
    const cleared = todays.length > 0 && todays.every((t) => isDoneOn(t, today));
    if (cleared) {
      track('day.cleared', { count: todays.length });
      dayCleared(reduced); // the whole day just cleared: a fuller success than one task
    } else if (done) {
      taskDone(reduced); // a single task done: the core, soft cue
    }
    // A whole-task finish gets the held bloom (the centrepiece). Everything else keeps the
    // quiet one-line reassurance. Never both: the bloom IS the moment.
    if (bloomData) {
      setBloom(bloomData);
    } else {
      const message = parentBack
        ? `You started, that's the hard part. ${parentBack} is back when you're ready.`
        : done && !cleared
          ? 'Done is done. Recorded.' // OCD reassurance: it is filed, you can stop checking
          : null;
      if (message) affirm(message);
    }
    commit(finalTasks);
  }

  // Good enough: complete a task you are stuck perfecting, with explicit permission to
  // release it. Reuses toggle, then overrides the affirmation to the gentler line.
  function goodEnough(id: string) {
    setConfirmingId(null);
    toggle(id);
    affirm('Good enough is done. Let it go.');
    track('goodenough.used');
  }

  function capture(text: string, schedule: CaptureSchedule, sliceCount?: number) {
    const titles = parseDump(text);
    if (titles.length === 0) return;
    setSortSummary(null);
    const now = nowMs();
    const fields = scheduleFields(schedule, today); // due / recurrence for the chosen when
    // Slices are a single one-off concept; BrainDump only offers them for a lone
    // line, but guard here too so a multi-line dump never inherits a slice count.
    const useSlices = sliceCount != null && sliceCount >= 2 && titles.length === 1;
    const added: Task[] = titles.map((title, i) => ({
      id: makeId(),
      title,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      ...fields,
      ...(useSlices && i === 0 ? { slices: { total: sliceCount, done: 0 } } : {}),
    }));
    commit([...tasks, ...added]);
    // One line is a quick add; several is a genuine brain-dump. Log the shape and
    // the chosen schedule so the moat can learn how this audience really captures.
    track(titles.length > 1 ? 'brain_dump.captured' : 'task.added', {
      count: titles.length,
      schedule: schedule.mode,
    });
    if (useSlices) track('slices.defined', { total: sliceCount });
  }

  // "I also did that": log something already done that was never on the list, so the
  // Lookback reflects what you actually did, not just what you ticked. A completed
  // task stamped now (shows checked on Today and in the Lookback). Feeds the moat.
  function logDidIt(text: string) {
    const title = text.trim();
    if (!title) return;
    const now = nowMs();
    const did: Task = { id: makeId(), title, done: true, createdAt: now, updatedAt: now, completedAt: now };
    commit([...tasks, did]);
    track('offplan.logged');
    setDidText('');
    setDidOpen(false);
  }

  // Advance (or step back) one slice of a sliced task. Crossing to all-slices-done
  // completes it through the same path as a tap-to-complete (done + completedAt),
  // so the calendar, Close-the-day and the celebration treat it like any finish.
  function step(id: string, delta: number) {
    const before = tasks.find((t) => t.id === id);
    const next = tasks.map((t) => {
      if (t.id !== id) return t;
      const moved = applySliceDelta(t, delta);
      if (moved === t) return t; // clamped at a bound: nothing changed, no resync
      const now = nowMs();
      const stamped: Task = { ...moved, updatedAt: now };
      if (moved.done && !t.done) stamped.completedAt = now;
      else if (!moved.done && t.done) stamped.completedAt = null;
      return stamped;
    });
    const after = next.find((t) => t.id === id);
    if (after === before) return; // no-op
    // The moat: how people slice and pace multi-part work, not just "done".
    track('slices.progressed', {
      done: after?.slices?.done ?? 0,
      total: after?.slices?.total ?? 0,
      complete: after?.done ?? false,
    });
    if (after?.done && !before?.done) {
      const todays = tasksForToday(next, today);
      if (todays.length > 0 && todays.every((t) => isDoneOn(t, today))) {
        track('day.cleared', { count: todays.length });
      }
    }
    commit(next);
  }

  // Break it down, call 1: ask the AI for the qualifying questions, then show
  // them. Clarify is best-effort, so a failure falls back to default questions
  // and the flow never blocks.
  async function biteElephant(text: string, parentId?: string) {
    if (bdBusy) return; // re-entry guard: breakdownExisting (TaskRow "Break down") calls this unguarded
    const task = text.trim();
    if (!task) return;
    setBdTask(task);
    setBdParentId(parentId ?? null);
    setBdBusy(true);
    try {
      setBdQuestions(await clarify(task, aiLanguage));
    } catch {
      setBdQuestions(DEFAULT_QUESTIONS);
    } finally {
      setBdBusy(false);
      setBdPhase('questions');
    }
    track('breakdown.started');
  }

  // Break it down, call 2: plan the phases + phase-one steps, work out each
  // date from the chosen spread, and show it for review (accept / deselect).
  // A small task comes back as one phase (so this behaves like a flat decompose);
  // a big one comes back as several, only the first of which is broken into steps.
  async function bdSubmitQuestions(answers: BreakdownAnswers) {
    if (bdBusy) return;
    setBdAnswers(answers);
    setBdError(null);
    setBdBusy(true);
    const corrId = makeId(); // a pseudonymous id for this decomposition (the moat link)
    setBdCorrId(corrId);
    try {
      const { phases, firstSteps } = await planBreakdown(
        bdTask,
        {
          dueDate: answers.dueDate,
          spread: answers.spread,
          question: bdQuestions?.custom ?? '',
          answer: answers.customAnswer,
        },
        aiLanguage,
        corrId,
      );
      if (firstSteps.length === 0) throw new Error('no steps');
      // Distribute the phase starts across the runway (phase 1 starts Today).
      const phaseStarts = spreadDueDates(Math.max(1, phases.length), today, answers.dueDate, 'gradual');
      const phase1End = phases.length > 1 ? (phaseStarts[1] ?? answers.dueDate) : answers.dueDate;
      // Phase one's steps spread within phase one's window.
      const stepDates = spreadDueDates(firstSteps.length, today, phase1End, answers.spread);
      setBdSteps(firstSteps.map((s, i) => ({ title: s.title, minutes: s.minutes, date: stepDates[i] ?? null })));
      setBdPhases(phases.slice(1).map((p, i) => ({ title: p.title, date: phaseStarts[i + 1] ?? null })));
      setBdPhase('review');
      track('decomposition.offered', {
        steps: firstSteps.length,
        phases: phases.length,
        spread: answers.spread,
        hasDueDate: answers.dueDate != null,
      });
    } catch {
      setBdPhase('questions'); // stay put; the user can retry or dismiss
      setBdError("Couldn't break it down just now. Your task is still here, try again?");
    } finally {
      setBdBusy(false);
    }
  }

  // Accept the chosen phase-one steps onto Today, plus a dated milestone task for
  // each later phase (each broken down later, when you reach it).
  function bdAccept(selected: ReviewStep[]) {
    const now = nowMs();
    // Keep the real task as a silent parent and chain the steps to it (Cluster B): an
    // existing task becomes the parent; an at-capture breakdown mints one.
    const parentId = bdParentId ?? makeId();
    const link = { parentId, parentTitle: bdTask };
    const totalMinutes = selected.reduce((sum, s) => sum + s.minutes, 0);
    const stepTasks: Task[] = selected.map((s, i) => ({
      id: makeId(),
      title: `${s.title} (${s.minutes} min)`,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      complexity: s.minutes, // the step's effort, used to weight its completion
      ...link,
      ...(bdCorrId ? { decompositionId: bdCorrId, decompositionSteps: selected.length } : {}),
      ...(s.date ? { due: s.date } : {}),
    }));
    const phaseTasks: Task[] = (bdPhases ?? []).map((p, i) => ({
      id: makeId(),
      title: p.title,
      done: false,
      createdAt: now + selected.length + i,
      updatedAt: now + selected.length + i,
      ...link,
      ...(p.date ? { due: p.date } : {}),
    }));
    // The parent is hidden from Today / Later and completed + celebrated when its children finish.
    const withParent: Task[] = bdParentId
      ? tasks.map((t) => (t.id === bdParentId ? { ...t, silentParent: true, complexity: totalMinutes, updatedAt: now } : t))
      : [...tasks, { id: parentId, title: bdTask, done: false, createdAt: now, updatedAt: now, silentParent: true, complexity: totalMinutes }];
    commit([...withParent, ...stepTasks, ...phaseTasks]);
    stepsLanded(reduced); // the dreaded task just got smaller
    // The moat: how many of the offered steps the user kept, and how many phases.
    track('breakdown.added', {
      added: selected.length,
      offered: bdSteps?.length ?? selected.length,
      phases: phaseTasks.length,
      spread: bdAnswers?.spread ?? 'gradual',
    });
    resetBreakdown();
  }

  // Break down an existing task (e.g. a later-phase milestone when you reach it):
  // feed its title into the same flow. The task itself stays; the user can tick or
  // remove it once its steps are on the board.
  function breakdownExisting(title: string, id?: string) {
    setConfirmingId(null);
    void biteElephant(title, id);
  }

  // Make it tiny: the AI returns a 2-minute version; the real task goes silent as an OPEN
  // parent (it never auto-completes), and the tiny version becomes its child on Today.
  // Finishing the tiny version resurfaces the real task (see toggle), never losing it.
  async function makeTiny(id: string, title: string) {
    if (tinyBusy.current) return;
    // Guard against infinite pebbles: if a tiny step for this task is still open, do not
    // spawn another. One pebble at a time.
    if (hasActiveTinyChild(tasks, id)) {
      setConfirmingId(null);
      exitSelect();
      affirm('You already have a tiny step for this. Finish that one first.');
      return;
    }
    tinyBusy.current = true;
    setConfirmingId(null);
    exitSelect();
    affirm('Shrinking it…');
    try {
      const tinyTitle = await tiny(title);
      if (!tinyTitle) throw new Error('empty');
      const now = nowMs();
      commit([
        ...tasks.map((t) => (t.id === id ? { ...t, silentParent: true, openParent: true, updatedAt: now } : t)),
        { id: makeId(), title: tinyTitle, done: false, createdAt: now, updatedAt: now, parentId: id, parentTitle: title },
      ]);
      track('tiny.made');
      affirm('Made it tiny. Just this one.');
    } catch {
      affirm("Couldn't shrink that just now. Try again.");
    } finally {
      tinyBusy.current = false;
    }
  }

  function resetBreakdown() {
    setBdPhase('off');
    setBdTask('');
    setBdParentId(null);
    setBdQuestions(null);
    setBdSteps(null);
    setBdPhases(null);
    setBdAnswers(null);
    setBdBusy(false);
    setBdError(null);
    setBdCorrId(null);
  }

  // AI triage: sort a brain-dump into buckets, then apply (later -> tomorrow; today
  // and decompose stay on Today). Opt-in via "Sort for me", so a direct apply is calm.
  // Lines the AI drops fall back to Today.
  async function sortDump(text: string) {
    const lines = parseDump(text);
    if (lines.length === 0) return;
    const items = await triage(lines);
    const added = triageToTasks(lines, items, today, nowMs(), makeId);
    commit([...tasks, ...added]);
    const summary = summarizeAdded(added);
    setSortSummary(summaryLine(summary));
    track('triage.applied', {
      total: lines.length,
      today: summary.today,
      later: summary.later,
      decompose: summary.decompose,
    });
  }

  return (
    <View style={styles.screen}>
      <LivingBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.seven }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Text style={styles.date}>{formatTodayLabel(today)}</Text>
          <Pressable
            onPress={() => setRoomsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Menu: Repeating, Routines, Lookback, Chart a course, Settings"
            hitSlop={8}
            style={({ pressed }) => [styles.roomsPill, pressed && styles.pressed]}
          >
            <View style={styles.roomsDots}>
              <View style={styles.roomsDot} />
              <View style={styles.roomsDot} />
              <View style={styles.roomsDot} />
            </View>
            <Text style={styles.roomsLabel}>Menu</Text>
          </Pressable>
        </View>
        {reentry && !isClosed && (
          <View style={styles.reentry}>
            <Text style={styles.reentryTitle}>Welcome back.</Text>
            <Text style={styles.reentryBody}>
              {"However long it's been, the past is fine. Nothing's overdue, nothing's lost. Here's just today, when you're ready."}
            </Text>
            <PrimaryButton
              label="See today"
              onPress={() => setReentry(false)}
              accessibilityLabel="See today"
              style={styles.reentryBtn}
            />
          </View>
        )}
        <Text style={styles.title}>Today</Text>
        <Text style={styles.spine}>{phaseGreeting(today)}</Text>
        {loaded && !isClosed && spreadable.length > 0 && (
          <View style={styles.weight}>
            <View style={styles.weightTrack}>
              <View style={[styles.weightFill, { flex: weightOfDay.fill }]} />
              <View style={{ flex: 1 - weightOfDay.fill }} />
            </View>
            <Text style={styles.weightLabel}>{weightOfDay.label}</Text>
            <Pressable
              onPress={toggleLowDay}
              accessibilityRole="button"
              accessibilityLabel={isLowDay ? 'Back to a normal day' : 'Mark today a low-capacity day'}
              hitSlop={8}
            >
              <Text style={styles.lowDayToggle}>
                {isLowDay ? 'Back to a normal day' : 'Low on energy? Make it a low day'}
              </Text>
            </Pressable>
          </View>
        )}

        {isClosed && (
          <View style={styles.rested}>
            <View style={styles.restedArt}>
              <Image
                source={closeDayArt}
                style={styles.artFill}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessible
                accessibilityLabel="A calm dusk sky settling over a closed notebook"
              />
            </View>
            <Text style={styles.restedTitle}>{"You've closed today."}</Text>
            <Text style={styles.restedLine}>
              {todayDone.length > 0
                ? `You finished ${todayDone.length} ${todayDone.length === 1 ? 'thing' : 'things'} today. Rest well.`
                : "A quiet day, and that's allowed. Rest well."}
            </Text>
            <Text style={styles.restedSub}>{"It's all here tomorrow."}</Text>
            <Pressable
              onPress={reopenDay}
              accessibilityRole="button"
              accessibilityLabel="Reopen today"
              hitSlop={8}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.restedReopen}>Reopen today</Text>
            </Pressable>
          </View>
        )}

        {!isClosed && (
          <>
        {spreadable.length > 0 && (
          <Pressable
            onPress={openFocus}
            accessibilityRole="button"
            accessibilityLabel="Focus on one thing"
            style={({ pressed }) => [styles.focusEntry, pressed && styles.pressed]}
          >
            <Text style={styles.focusEntryText}>Focus on one thing</Text>
          </Pressable>
        )}
        <View style={styles.list}>
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              done={isDoneOn(task, today)}
              onToggle={() => toggle(task.id)}
              onLongPress={() => enterSelectWith(task.id)}
              confirming={confirmingId === task.id}
              onRemove={() => removeTask(task.id)}
              onKeep={() => setConfirmingId(null)}
              recurring={isRecurring(task)}
              slices={task.slices ?? undefined}
              onAdvance={() => step(task.id, 1)}
              onRetreat={() => step(task.id, -1)}
              onBreakdown={() => breakdownExisting(task.title, task.id)}
              onMakeTiny={() => makeTiny(task.id, task.title)}
              onDefer={() => deferTask(task.id)}
              onGoodEnough={() => goodEnough(task.id)}
              suggestBreakdown={task.suggestBreakdown}
              selecting={selectMode}
              selected={selected.includes(task.id)}
              onSelect={() => toggleSelect(task.id)}
              nudgeAt={task.nudgeAt != null && task.nudgeAt > nowMs() ? task.nudgeAt : undefined}
              tinyParent={tinyParentTitle(tasks, task)}
              pinned={task.pinnedAt != null && !isDoneOn(task, today)}
              big={task.big}
            />
          ))}
        </View>

        {loaded && visible.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyArt}>
              <Image
                source={emptyArt}
                style={styles.artFill}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessible
                accessibilityLabel="A warm coffee beside an open notebook in morning light"
              />
            </View>
            <Text style={[styles.calmNote, styles.emptyNote]}>Nothing here yet. Add one thing, or enjoy the quiet.</Text>
          </View>
        )}
        {allDone && <Text style={styles.calmNote}>{"That's the list. Nicely done."}</Text>}

        {loaded && !selectMode && (
          <Pressable
            onPress={() => setDidOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Log something you also did"
            hitSlop={6}
            style={({ pressed }) => [styles.alsoDidUnderList, pressed && styles.pressed]}
          >
            <Text style={styles.alsoDidLink}>+ I also did that</Text>
          </Pressable>
        )}

        {upcoming.length > 0 && (
          <View style={styles.later}>
            <Text style={styles.laterHeading}>Later</Text>
            {upcoming.map((task, i) => (
              <View key={task.id} style={styles.laterItem}>
                {(i === 0 || upcoming[i - 1].due !== task.due) && task.due && (
                  <Text style={styles.laterDate}>{friendlyDate(task.due, today)}</Text>
                )}
                <TaskRow
                  title={task.title}
                  done={isDoneOn(task, today)}
                  onToggle={() => toggle(task.id)}
                  onLongPress={() => enterSelectWith(task.id)}
                  confirming={confirmingId === task.id}
                  onRemove={() => removeTask(task.id)}
                  onKeep={() => setConfirmingId(null)}
                  recurring={isRecurring(task)}
                  slices={task.slices ?? undefined}
                  onAdvance={() => step(task.id, 1)}
                  onRetreat={() => step(task.id, -1)}
                  onBreakdown={() => breakdownExisting(task.title, task.id)}
                  onMakeTiny={() => makeTiny(task.id, task.title)}
                  onGoodEnough={() => goodEnough(task.id)}
                  selecting={selectMode}
                  selected={selected.includes(task.id)}
                  onSelect={() => toggleSelect(task.id)}
                  big={task.big}
                />
              </View>
            ))}
          </View>
        )}
        {loaded && !selectMode && (
          <View style={styles.dayActions}>
            {spreadable.length >= 2 && (
              <>
                {dayIsHeavy && <Text style={styles.strategiseNudge}>{"Today's looking full."}</Text>}
                {dayIsHeavy && (
                  <Pressable
                    onPress={runStrategise}
                    disabled={strategising}
                    style={({ pressed }) => [styles.strategiseBtn, pressed && styles.pressed, strategising && styles.disabledBtn]}
                    accessibilityRole="button"
                    accessibilityLabel="Lighten today by moving some tasks to later days"
                  >
                    <Text style={styles.strategiseBtnText}>{strategising ? 'Lightening…' : 'Lighten today'}</Text>
                  </Pressable>
                )}
                {strategiseError && <Text style={styles.strategiseErr}>{strategiseError}</Text>}
                <PremiumButton
                  label={sequencing ? 'Planning…' : 'Plan my day'}
                  onPress={runSequence}
                  disabled={sequencing}
                  accessibilityLabel="Plan my day, order today's tasks"
                  style={styles.sequenceBtn}
                />
                {orderError && <Text style={styles.strategiseErr}>{orderError}</Text>}
              </>
            )}
            {windDown && !isClosed && (
              <Text style={styles.windDown}>
                {"Evening's here. Close the day when you're ready, even a little counts."}
              </Text>
            )}
            <Pressable
              onPress={openClose}
              style={({ pressed }) => [styles.closeDay, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close the day"
            >
              <Text style={styles.closeDayText}>Close the day</Text>
            </Pressable>
          </View>
        )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, dockFooter && styles.footerDock, { paddingBottom: insets.bottom + (captureOpen ? spacing.one : spacing.four) }]}>
        {selectMode ? (
          <View style={styles.selectBar}>
            <View style={styles.selectTop}>
              <Text style={styles.selectCount}>{selected.length === 0 ? 'Tap tasks to select' : `${selected.length} selected`}</Text>
              <Pressable onPress={() => setSelected(spreadable.map((x) => x.id))} accessibilityRole="button" accessibilityLabel="Select all tasks" hitSlop={6}>
                <Text style={styles.selectAllText}>Select all</Text>
              </Pressable>
            </View>
            <View style={styles.selectActions}>
              <View style={styles.actionRow}>
                <Pressable onPress={bulkComplete} disabled={selected.length === 0} accessibilityRole="button" accessibilityLabel="Mark selected done" hitSlop={6}>
                  <Text style={[styles.selectDone, selected.length === 0 && styles.selectActionOff]}>Done</Text>
                </Pressable>
                {selected.length === 1 && (
                  <Pressable
                    onPress={() => {
                      const one = selected[0];
                      if (one) goodEnough(one);
                      exitSelect();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Mark the selected task good enough and done"
                    hitSlop={6}
                  >
                    <Text style={styles.selectAction}>Good enough</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setMoveToOpen(true)} disabled={selected.length === 0} accessibilityRole="button" accessibilityLabel="Move selected to a date" hitSlop={6}>
                  <Text style={[styles.selectAction, selected.length === 0 && styles.selectActionOff]}>Move to…</Text>
                </Pressable>
                <Pressable onPress={() => markBig(selected, !allBig)} disabled={selected.length === 0} accessibilityRole="button" accessibilityLabel={allBig ? 'Unmark the selected tasks as big' : 'Mark the selected tasks as big'} hitSlop={6}>
                  <Text style={[styles.selectAction, selected.length === 0 && styles.selectActionOff]}>{allBig ? 'Not big' : 'Big'}</Text>
                </Pressable>
                {Platform.OS !== 'web' && onlyTask && !isDoneOn(onlyTask, today) && (
                  <Pressable onPress={openNudge} accessibilityRole="button" accessibilityLabel="Remind me about this task" hitSlop={6}>
                    <Text style={styles.selectAction}>Remind me</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.actionRow}>
                {selected.length === 1 && (
                  <Pressable
                    onPress={() => {
                      const one = tasks.find((y) => y.id === selected[0]);
                      if (one) breakdownExisting(one.title, one.id);
                      exitSelect();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Break down the selected task"
                    hitSlop={6}
                  >
                    <Text style={styles.selectAction}>Break down</Text>
                  </Pressable>
                )}
                {onlyTask && !isRecurring(onlyTask) && !isDoneOn(onlyTask, today) && (
                  <Pressable
                    onPress={() => {
                      const t = onlyTask;
                      if (!t) return;
                      if (premiumLoading) return; // entitlement still resolving: a tap is a no-op, never a wrong bounce
                      // Gate only SETTING a fresh pin (abundance). Clearing a pin you set is always free, so a
                      // lapsed sub can still unpin. A free tap routes calmly to the upsell, never a wall.
                      if (!t.pinnedAt && !premium) {
                        track('premium.gate_hit', { reason: 'pin' });
                        router.push('/premium');
                        return;
                      }
                      pinTask(t.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={onlyTask.pinnedAt ? 'Unpin this task' : "Pin this as today's one thing"}
                    hitSlop={6}
                  >
                    <Text style={[styles.selectAction, !premium && !onlyTask.pinnedAt && styles.selectActionDim]}>{onlyTask.pinnedAt ? 'Unpin' : 'Pin'}</Text>
                  </Pressable>
                )}
                {selected.length === 1 && (
                  <Pressable
                    onPress={() => {
                      const one = tasks.find((y) => y.id === selected[0]);
                      if (one) void makeTiny(one.id, one.title);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Make the selected task tiny"
                    hitSlop={6}
                  >
                    <Text style={styles.selectAction}>Make it tiny</Text>
                  </Pressable>
                )}
                {combinable.length >= 2 && (
                  <Pressable
                    onPress={() => void openCombine()}
                    accessibilityRole="button"
                    accessibilityLabel="Combine selected tasks into one"
                    hitSlop={6}
                  >
                    <Text style={styles.selectAction}>Combine</Text>
                  </Pressable>
                )}
                <Pressable onPress={bulkRemove} disabled={selected.length === 0} accessibilityRole="button" accessibilityLabel="Remove selected" hitSlop={6}>
                  <Text style={[styles.selectRemove, selected.length === 0 && styles.selectActionOff]}>Remove</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={exitSelect} accessibilityRole="button" accessibilityLabel="Cancel selection" hitSlop={6}>
              <Text style={styles.selectCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
        {!isClosed && sortSummary && <Text style={styles.sortSummary}>{sortSummary}</Text>}
        {!isClosed && affirmation && <Text style={styles.affirmation}>{affirmation}</Text>}
        {!isClosed &&
          (captureOpen ? (
            <View style={styles.capturePanel}>
              <Pressable
                onPress={() => setCaptureOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Collapse the add panel"
                hitSlop={8}
                style={styles.captureHandle}
              >
                <Text style={styles.optLink}>Done adding</Text>
              </Pressable>
              <BrainDump
                ref={brainDumpRef}
                onCapture={capture}
                onBiteElephant={biteElephant}
                onSort={sortDump}
                today={today}
                onCamera={() => {
                  if (premiumLoading) return; // entitlement still resolving: a tap is a no-op, never a wrong bounce
                  if (!premium) {
                    track('premium.gate_hit', { reason: 'ocr' });
                    router.push('/premium');
                    return;
                  }
                  setCameraOpen(true);
                }}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setCaptureOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a task to today"
              style={({ pressed }) => [styles.addBar, pressed && styles.pressed]}
            >
              <Text style={styles.focusEntryText}>+  Add to today</Text>
            </Pressable>
          ))}
        <View style={styles.ethos}>
          <RotatingPhrase />
        </View>
        {/* The optional, low-priority links live below the marquee, calm and out of the way:
            who you're synced as (or the sync invite) and the daily-reminder toggle. */}
        <View style={styles.optionalLinks}>
          {isSyncConfigured &&
            (session ? (
              <>
                <Text style={styles.optLink} numberOfLines={1}>
                  Synced to {session.user.email ?? 'your account'}
                </Text>
                <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={6}>
                  <Text style={styles.optFaint}>Sign out</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => router.push('/sign-in')} accessibilityRole="button" accessibilityLabel="Sync across devices" hitSlop={6}>
                <Text style={styles.optLink}>Sync across devices</Text>
              </Pressable>
            ))}
          <Pressable onPress={toggleReminder} accessibilityRole="button" accessibilityLabel="Toggle daily reminder" hitSlop={6}>
            <Text style={styles.optLink}>{reminderOn ? 'Daily reminder on' : 'Turn on daily reminder'}</Text>
          </Pressable>
        </View>
          </>
        )}
      </View>

      <Modal visible={focusOpen} animationType="fade" onRequestClose={closeFocus}>
        <View style={styles.focusScreen}>
          <Pressable
            onPress={closeFocus}
            accessibilityRole="button"
            accessibilityLabel="Exit focus"
            hitSlop={10}
            style={({ pressed }) => [styles.focusExit, pressed && styles.pressed]}
          >
            <Text style={styles.focusExitText}>Exit</Text>
          </Pressable>
          {focusTask ? (
            <View style={styles.focusBody}>
              <Text style={styles.focusLabel}>Just this one</Text>
              <Text style={styles.focusTitle}>{focusTask.title}</Text>
              {focusTask.slices ? (
                <Text style={styles.focusStep}>
                  Step {Math.min(focusTask.slices.done + 1, focusTask.slices.total)} of {focusTask.slices.total}
                </Text>
              ) : null}
              <View style={styles.focusActions}>
                <Pressable
                  onPress={() => setFocusPick(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose another"
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Text style={styles.focusSkipText}>Choose another</Text>
                </Pressable>
                <PrimaryButton
                  label="Done"
                  onPress={() => focusComplete(focusTask.id)}
                  accessibilityLabel={`Done with ${focusTask.title}`}
                />
              </View>
            </View>
          ) : spreadable.length > 0 ? (
            <View style={styles.focusBody}>
              <Text style={styles.focusLabel}>Just this one</Text>
              <Text style={styles.focusTitle}>Which one?</Text>
              <View style={styles.focusPickList}>
                {spreadable.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setFocusPick(t.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Focus on ${t.title}`}
                    style={({ pressed }) => [styles.focusPickItem, pressed && styles.pressed]}
                  >
                    <Text style={styles.focusPickItemText}>{t.title}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.focusBody}>
              <Text style={styles.focusTitle}>{"That's everything for now."}</Text>
              <Text style={styles.focusEmptyNote}>{"Nothing left to focus on. Rest, or add something when you're ready."}</Text>
              <PrimaryButton label="Back to Today" onPress={closeFocus} accessibilityLabel="Back to Today" />
            </View>
          )}
        </View>
      </Modal>

      <ModalCard visible={didOpen} onClose={() => setDidOpen(false)}>
            <Text style={styles.didTitle}>What did you do?</Text>
            <Text style={styles.didHint}>{"Something you got done that was never on the list. It still counts."}</Text>
            <TextInput
              style={styles.didInput}
              value={didText}
              onChangeText={setDidText}
              placeholder="Made the call, took a walk…"
              placeholderTextColor={theme.colors.inkFaint}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => logDidIt(didText)}
              accessibilityLabel="What did you do"
            />
            <View style={styles.didActions}>
              <Pressable
                onPress={() => {
                  setDidText('');
                  setDidOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                hitSlop={8}
              >
                <Text style={styles.didCancel}>Cancel</Text>
              </Pressable>
              <PrimaryButton label="Add it" onPress={() => logDidIt(didText)} accessibilityLabel="Add it" />
            </View>
      </ModalCard>

      <ModalCard visible={combineOpen} onClose={() => setCombineOpen(false)}>
            <Text style={styles.didTitle}>Combine into one</Text>
            <Text style={styles.didHint}>
              {`${beingCombined.length} tasks become one. Edit the name, or keep the suggestion. It lands on the earliest of their dates.`}
            </Text>
            <TextInput
              style={styles.didInput}
              value={combineTitle}
              onChangeText={setCombineTitle}
              placeholder="Name the combined task…"
              placeholderTextColor={theme.colors.inkFaint}
              returnKeyType="done"
              onSubmitEditing={combineAccept}
              accessibilityLabel="The combined task's name"
            />
            <View style={styles.combineList}>
              {beingCombined.map((id) => {
                const t = tasks.find((x) => x.id === id);
                if (!t) return null;
                return (
                  <Text key={id} style={styles.combineItem} numberOfLines={1}>
                    · {t.title}
                  </Text>
                );
              })}
            </View>
            <View style={styles.didActions}>
              <Pressable
                onPress={() => {
                  setCombineOpen(false);
                  setCombineTitle('');
                  setBeingCombined([]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                hitSlop={8}
              >
                <Text style={styles.didCancel}>Cancel</Text>
              </Pressable>
              <PrimaryButton
                label="Combine"
                onPress={combineAccept}
                disabled={!combineTitle.trim()}
                accessibilityLabel="Combine into one task"
              />
            </View>
      </ModalCard>

      <ModalCard visible={moveToOpen} onClose={() => setMoveToOpen(false)}>
            <Text style={styles.didTitle}>Move to…</Text>
            <Text style={styles.didHint}>
              {`${selected.length} ${selected.length === 1 ? 'task' : 'tasks'} move to the day you pick.`}
            </Text>
            <View style={styles.moveToPresets}>
              <Pressable
                onPress={() => bulkMoveTo(toISODate(today))}
                style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Today"
              >
                <Text style={styles.moveChipText}>Today</Text>
              </Pressable>
              <Pressable
                onPress={() => bulkMoveTo(presetDate(today, 'thisWeekend'))}
                style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="This weekend"
              >
                <Text style={styles.moveChipText}>This weekend</Text>
              </Pressable>
              <Pressable
                onPress={() => bulkMoveTo(presetDate(today, 'nextWeek'))}
                style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <Text style={styles.moveChipText}>Next week</Text>
              </Pressable>
            </View>
            <DatePicker value={null} onChange={(iso) => bulkMoveTo(iso)} today={today} />
            <Pressable
              onPress={() => setMoveToOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={8}
              style={styles.moveCancelWrap}
            >
              <Text style={styles.didCancel}>Cancel</Text>
            </Pressable>
      </ModalCard>

      <ModalCard visible={nudgeOpen} onClose={() => setNudgeOpen(false)}>
            <Text style={styles.didTitle}>Remind me…</Text>
            <Text style={styles.didHint}>A gentle poke about this later today, never a deadline.</Text>
            {nudgePresets.length === 0 ? (
              <Text style={styles.didHint}>It is a little late for a nudge today. Tomorrow is always there.</Text>
            ) : (
              <View style={styles.moveToPresets}>
                {nudgePresets.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => void pickNudge(p.id)}
                    style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={p.label}
                  >
                    <Text style={styles.moveChipText}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable
              onPress={() => setNudgeOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              hitSlop={8}
              style={styles.moveCancelWrap}
            >
              <Text style={styles.didCancel}>Not now</Text>
            </Pressable>
      </ModalCard>

      <Modal visible={closing} transparent animationType="fade" onRequestClose={() => setClosing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setClosing(false)} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Animated.View
            style={[
              styles.wrapAnim,
              {
                opacity: closeRise,
                transform: [{ translateY: closeRise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              },
            ]}
          >
            <Pressable style={styles.wrapCard} onPress={() => {}}>
              <View style={styles.wrapArt}>
                <Image
                  source={closeDayArt}
                  style={styles.artFill}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  accessible
                  accessibilityLabel="A calm dusk sky settling over a closed notebook"
                />
              </View>
              <Text style={styles.wrapTitle}>{"That's the day"}</Text>
              {todayDone.length > 0 ? (
                <>
                  <Text style={styles.wrapLine}>
                    You finished {todayDone.length} {todayDone.length === 1 ? 'thing' : 'things'} today
                    {todayDone.some((c) => c.big) ? ', one a big one' : ''}.
                  </Text>
                  <View style={styles.wrapList}>
                    {todayDone.map((c) => (
                      <View key={c.id} style={styles.wrapItem}>
                        <Text style={styles.wrapCheck}>✓</Text>
                        <Text style={styles.wrapItemText}>{c.title}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.wrapLine}>A quiet day. That is allowed.</Text>
              )}
              <Text style={styles.wrapRoll}>Anything left rolls to tomorrow. Nothing is lost.</Text>
              <Text style={styles.closeNoteLabel}>Anything else you did?</Text>
              <TextInput
                style={styles.didInput}
                value={closeNote}
                onChangeText={setCloseNote}
                placeholder="Something off the list…"
                placeholderTextColor={theme.colors.inkFaint}
                returnKeyType="done"
                accessibilityLabel="Anything else you did today"
              />
              <PrimaryButton
                label="Goodnight"
                onPress={() => {
                  const note = closeNote.trim();
                  if (note) {
                    const now = nowMs();
                    const did: Task = { id: makeId(), title: note, done: true, createdAt: now, updatedAt: now, completedAt: now };
                    commit([...tasks, did]);
                    track('offplan.logged', { at: 'close' });
                  }
                  setCloseNote('');
                  setClosing(false);
                  setClosedDate(toISODate(today));
                  void saveClosedDate(toISODate(today));
                  dayClosed(reduced); // the gentle close: a warm, soft confirmation
                }}
                accessibilityLabel="Goodnight"
                style={styles.wrapBtn}
              />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <ModalCard visible={plan != null} onClose={() => setPlan(null)}>
            <Text style={styles.wrapTitle}>A calmer spread</Text>
            <Text style={styles.wrapLine}>{"Keep today lighter. Here's where the rest could go."}</Text>
            <View style={styles.wrapList}>
              {(plan ?? []).map((p) => {
                const t = tasks.find((x) => x.id === p.id);
                if (!t) return null;
                const when = p.dayOffset <= 0 ? 'Today' : p.dayOffset === 1 ? 'Tomorrow' : `In ${p.dayOffset} days`;
                return (
                  <View key={p.id} style={styles.planItem}>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.planWhen}>{when}</Text>
                  </View>
                );
              })}
            </View>
            <PrimaryButton
              label="Use this spread"
              onPress={acceptPlan}
              accessibilityLabel="Use this spread"
              style={styles.wrapBtn}
            />
            <Pressable onPress={() => setPlan(null)} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={styles.planDismiss}>Not now</Text>
            </Pressable>
      </ModalCard>

      <ModalCard visible={order != null} onClose={() => setOrder(null)}>
            <Text style={styles.wrapTitle}>A gentle order</Text>
            <Text style={styles.wrapLine}>{"Here's an order that might flow. Yours to take or leave."}</Text>
            <View style={styles.wrapList}>
              {(order ?? []).map((o, i) => {
                const t = tasks.find((x) => x.id === o.id);
                if (!t) return null;
                return (
                  <View key={o.id} style={styles.seqItem}>
                    <Text style={styles.seqNum}>{i + 1}</Text>
                    <View style={styles.seqText}>
                      <Text style={styles.planTitle} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={styles.seqReason} numberOfLines={2}>
                        {o.reason}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <PrimaryButton
              label="Use this order"
              onPress={acceptOrder}
              accessibilityLabel="Use this order"
              style={styles.wrapBtn}
            />
            <Pressable onPress={() => setOrder(null)} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={styles.planDismiss}>Not now</Text>
            </Pressable>
      </ModalCard>

      {/* After "Plan my day" orders a heavy day, offer the Lighten-today re-spread (Melroy's "push a few
          out?" follow-up). Only on a heavy day, and only after ordering, so it never nags a calm day. */}
      <ModalCard visible={offerDefer} onClose={() => setOfferDefer(false)}>
            <Text style={styles.wrapTitle}>Still a full day?</Text>
            <Text style={styles.wrapLine}>Today is ordered. Want to push a few tasks out to later days, to lighten it?</Text>
            <PrimaryButton
              label="Yes, lighten today"
              onPress={() => {
                setOfferDefer(false);
                runStrategise();
              }}
              accessibilityLabel="Yes, lighten today by moving some out"
              style={styles.wrapBtn}
            />
            <Pressable
              onPress={() => {
                setOfferDefer(false);
                affirm('A gentle order, top of the list when you are ready.');
              }}
              accessibilityRole="button"
              accessibilityLabel="No, this is good"
            >
              <Text style={styles.planDismiss}>No, this is good</Text>
            </Pressable>
      </ModalCard>

      <CameraCapture
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onTasks={(scanned) => {
          setCameraOpen(false);
          setCaptureOpen(true);
          brainDumpRef.current?.seed(scanned.join('\n'));
        }}
      />

      <RepeatingDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        tasks={tasks}
        today={today}
        onToggle={toggle}
      />

      {bdPhase === 'questions' && bdQuestions && (
        <BreakdownQuestions
          key={bdTask}
          task={bdTask}
          questions={bdQuestions}
          busy={bdBusy}
          error={bdError}
          onSubmit={bdSubmitQuestions}
          onCancel={resetBreakdown}
          today={today}
        />
      )}
      {bdPhase === 'review' && bdSteps && (
        <BreakdownReview
          key={bdTask}
          task={bdTask}
          steps={bdSteps}
          laterPhases={bdPhases ?? undefined}
          busy={bdBusy}
          onAdd={bdAccept}
          onCancel={resetBreakdown}
          today={today}
        />
      )}
      <RoomsSheet
        visible={roomsOpen}
        onClose={() => setRoomsOpen(false)}
        onRepeating={openDrawer}
        onRoutines={() => router.push('/routines')}
        onLookback={() => router.push('/lookback')}
        onChart={() => router.push('/chart')}
        onSettings={() => router.push('/settings')}
      />
      <Bloom data={bloom} onDone={dismissBloom} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' }, // the LivingBackground shows through
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: spacing.five,
      paddingBottom: spacing.six,
      maxWidth: layout.maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.one },
    date: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    roomsPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.two,
      borderWidth: border.hair,
      borderColor: t.scheme === 'dark' ? 'rgba(242,235,224,0.14)' : 'rgba(43,39,34,0.10)',
      backgroundColor: t.scheme === 'dark' ? 'rgba(37,33,25,0.6)' : 'rgba(255,255,255,0.6)',
      borderRadius: radius.pill,
      paddingVertical: spacing.two,
      paddingHorizontal: 13,
    },
    roomsDots: { flexDirection: 'row', gap: 3 },
    roomsDot: { width: 4, height: 4, borderRadius: radius.pill, backgroundColor: t.colors.accent },
    roomsLabel: { color: t.colors.accent, fontSize: 13 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    title: {
      color: t.colors.ink,
      fontSize: 34 * t.scale,
      fontWeight: '600',
      fontFamily: fonts.sans,
      letterSpacing: -0.5,
    },
    spine: { color: t.colors.inkSoft, fontSize: 16 * t.scale, marginTop: spacing.two, marginBottom: spacing.six, fontFamily: fonts.body },
    list: { gap: spacing.two },
    calmNote: { color: t.colors.inkSoft, fontSize: 16 * t.scale, marginTop: spacing.five, lineHeight: 24 * t.scale, fontFamily: fonts.body },
    emptyState: { alignItems: 'center' },
    emptyArt: { width: '100%', maxWidth: 420, aspectRatio: 16 / 9, borderRadius: radius.lg, marginTop: spacing.five, overflow: 'hidden' },
    emptyNote: { textAlign: 'center' },
    artFill: { position: 'absolute', width: '100%', height: '100%' },
    later: { marginTop: spacing.seven, gap: spacing.two },
    laterHeading: {
      ...t.type.eyebrow,
      color: t.colors.inkFaint,
      textTransform: 'uppercase',
      marginBottom: spacing.one,
    },
    laterItem: { gap: spacing.two },
    laterDate: { color: t.colors.inkSoft, fontSize: 13 * t.scale, marginTop: spacing.two, fontFamily: fonts.body },
    footer: {
      paddingHorizontal: spacing.five,
      paddingTop: spacing.three,
      maxWidth: layout.maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
    // The mobile / narrow-web dock: a filled bar with a hairline top. Dropped on wide web
    // so the capture region blends into the Dusk page under the list, not a floating panel.
    footerDock: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.line,
      backgroundColor: t.colors.bg,
    },
    ethos: { marginTop: spacing.three, alignItems: 'center' },
    optionalLinks: { marginTop: spacing.four, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.five },
    optLink: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline' },
    optFaint: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center', textDecorationLine: 'underline' },
    selectBar: { gap: spacing.three, alignItems: 'center', paddingVertical: spacing.two },
    selectCount: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    selectActions: { alignItems: 'center', gap: spacing.three },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: spacing.four },
    selectAction: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    selectActionDim: { opacity: 0.5 }, // a premium action shown to a free user: dimmed but tappable, routes to the upsell
    selectDone: { color: t.colors.done, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    selectRemove: { color: t.colors.danger, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    selectActionOff: { color: t.colors.inkFaint },
    selectCancel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    sortSummary: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginBottom: spacing.two },
    affirmation: { color: t.colors.done, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center', marginBottom: spacing.two },
    reentry: {
      backgroundColor: t.colors.accentSoft,
      borderRadius: radius.lg,
      paddingVertical: spacing.five,
      paddingHorizontal: spacing.five,
      gap: spacing.three,
      marginBottom: spacing.five,
    },
    reentryTitle: { ...t.type.subheading, color: t.colors.ink, letterSpacing: -0.3 },
    reentryBody: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body },
    reentryBtn: { alignSelf: 'flex-start', marginTop: spacing.one },
    weight: { marginTop: spacing.two, marginBottom: spacing.four, gap: spacing.two },
    weightTrack: { flexDirection: 'row', height: 6, borderRadius: radius.pill, backgroundColor: t.colors.line, overflow: 'hidden' },
    weightFill: { backgroundColor: t.colors.accent },
    weightLabel: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    lowDayToggle: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.one, textDecorationLine: 'underline' },
    windDown: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    dayActions: { marginTop: spacing.seven, alignItems: 'center', gap: spacing.three },
    closeDay: {
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.five,
      borderRadius: radius.md,
      borderWidth: border.hair,
      borderColor: t.colors.line,
    },
    closeDayText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    rested: { alignItems: 'center', gap: spacing.three, paddingTop: spacing.five, paddingBottom: spacing.four },
    restedArt: {
      width: '100%',
      maxWidth: 300,
      aspectRatio: 3 / 2,
      borderRadius: radius.lg,
      overflow: 'hidden',
      marginBottom: spacing.two,
    },
    restedTitle: { ...t.type.heading, color: t.colors.ink, letterSpacing: -0.3, textAlign: 'center' },
    restedLine: { color: t.colors.ink, fontSize: 17 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    restedSub: { color: t.colors.inkFaint, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    restedReopen: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.three },
    strategiseNudge: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    strategiseBtn: {
      borderRadius: radius.md,
      borderWidth: border.hair,
      borderColor: t.colors.accent,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.five,
    },
    strategiseBtnText: { color: t.colors.accent, fontSize: 16 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    strategiseErr: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
    disabledBtn: { opacity: 0.5 },
    planItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
    planTitle: { color: t.colors.ink, fontSize: 16 * t.scale, flexShrink: 1, fontFamily: fonts.body },
    planWhen: { color: t.colors.accent, fontSize: 14 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    // "Plan my order" (premium): the big PremiumButton (the DoubleDone Premium gradient), the premium signal on Today.
    sequenceBtn: { alignSelf: 'stretch', marginTop: spacing.three },
    seqItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.three },
    seqNum: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', minWidth: 16, textAlign: 'center', marginTop: 1 },
    seqText: { flex: 1, gap: 1 },
    seqReason: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 18 * t.scale },
    planDismiss: { color: t.colors.inkSoft, fontSize: 15 * t.scale, textAlign: 'center', marginTop: spacing.two, fontFamily: fonts.body },
    pressed: { opacity: PRESSED_OPACITY },
    addBar: { borderWidth: border.hair, borderColor: t.colors.accent, borderRadius: radius.md, paddingVertical: spacing.four, alignItems: 'center' },
    capturePanel: { gap: spacing.two },
    captureHandle: { alignSelf: 'center', paddingVertical: spacing.two },
    alsoDidLink: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    didTitle: { ...t.type.subheading, color: t.colors.ink, letterSpacing: -0.3 },
    didHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
    didInput: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      fontSize: 17 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      backgroundColor: t.colors.surface,
      marginTop: spacing.one,
    },
    didActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.five, marginTop: spacing.two },
    didCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusEntry: {
      borderWidth: border.hair,
      borderColor: t.colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      marginBottom: spacing.four,
      alignItems: 'center',
    },
    focusEntryText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    alsoDidUnderList: { marginTop: spacing.three, marginBottom: spacing.two, alignItems: 'center' },
    selectTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.four, marginBottom: spacing.two },
    selectAllText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, textDecorationLine: 'underline' },
    moveToPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two, justifyContent: 'center', marginBottom: spacing.three },
    moveChip: { borderWidth: border.hair, borderColor: t.colors.line, borderRadius: radius.pill, paddingVertical: spacing.three, paddingHorizontal: spacing.three },
    moveChipText: { color: t.colors.ink, fontFamily: fonts.body, fontSize: 14 * t.scale },
    moveCancelWrap: { marginTop: spacing.three, alignItems: 'center' },
    combineList: { gap: spacing.one, marginTop: spacing.one, marginBottom: spacing.one },
    combineItem: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    focusPickList: { marginTop: spacing.five, gap: spacing.four, alignItems: 'center' },
    focusPickItem: { paddingVertical: spacing.two, paddingHorizontal: spacing.three },
    focusPickItemText: { color: t.colors.accent, fontFamily: fonts.sans, fontSize: 22 * t.scale, textAlign: 'center' },
    closeNoteLabel: { color: t.colors.inkSoft, fontFamily: fonts.body, fontSize: 14 * t.scale, marginTop: spacing.three, marginBottom: spacing.two, textAlign: 'center' },
    focusScreen: { flex: 1, backgroundColor: t.colors.bg, padding: spacing.six, justifyContent: 'center', alignItems: 'center' },
    focusExit: { position: 'absolute', top: spacing.seven, left: spacing.five },
    focusExitText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusBody: { alignItems: 'center', gap: spacing.four, maxWidth: 440, width: '100%' },
    focusLabel: { ...t.type.eyebrow, color: t.colors.accent, textTransform: 'uppercase' },
    focusTitle: { color: t.colors.ink, fontSize: 30 * t.scale, lineHeight: 38 * t.scale, fontFamily: fonts.sans, fontWeight: '600', textAlign: 'center', letterSpacing: -0.3 },
    focusStep: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body },
    focusEmptyNote: { color: t.colors.inkSoft, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    focusActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.six, marginTop: spacing.four },
    focusSkipText: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    backdrop: {
      flex: 1,
      backgroundColor: t.colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.five,
    },
    wrapAnim: { width: '100%', maxWidth: 420 },
    wrapCard: {
      backgroundColor: t.colors.bg,
      borderRadius: radius.lg,
      padding: spacing.six,
      width: '100%',
      maxWidth: 420,
      gap: spacing.three,
    },
    wrapArt: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, marginBottom: spacing.one, overflow: 'hidden' },
    wrapTitle: { ...t.type.heading, color: t.colors.ink, letterSpacing: -0.3 },
    wrapLine: { color: t.colors.ink, fontSize: 17 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body },
    wrapList: { gap: spacing.two, marginTop: spacing.one },
    wrapItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
    wrapCheck: { color: t.colors.done, fontSize: 16 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    wrapItemText: { color: t.colors.inkSoft, fontSize: 16 * t.scale, flexShrink: 1, fontFamily: fonts.body },
    wrapRoll: { color: t.colors.inkFaint, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, marginTop: spacing.two, fontFamily: fonts.body },
    wrapBtn: { marginTop: spacing.three },
  });
