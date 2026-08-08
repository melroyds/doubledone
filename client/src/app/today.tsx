import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bloom, type BloomData } from '@/components/Bloom';
import { BedtimeCapture } from '@/components/BedtimeCapture';
import { BrainDump, type BrainDumpHandle } from '@/components/BrainDump';
import { CameraCapture } from '@/components/CameraCapture';
import { type BreakdownAnswers, BreakdownQuestions } from '@/components/BreakdownQuestions';
import { BreakdownReview, type ReviewPhase, type ReviewStep } from '@/components/BreakdownReview';
import { DatePicker } from '@/components/DatePicker';
import { LivingBackground } from '@/components/LivingBackground';
import { ModalCard } from '@/components/ModalCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RepeatingDrawer } from '@/components/RepeatingDrawer';
import { RoomsSheet } from '@/components/RoomsSheet';
import { RotatingPhrase } from '@/components/RotatingPhrase';
import { TaskRow } from '@/components/TaskRow';
import { border, cardShadow, fonts, layout, motion, PRESSED_OPACITY, radius, rgba, spacing, type Theme } from '@/constants/theme';
import {
  clarify,
  combine,
  defaultQuestions,
  type Energy,
  matchEnergy,
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
import { canMatchEnergy, recordEnergyUse, shouldWarnEnergy } from '@/lib/energy';
import { useSession } from '@/lib/auth';
import { completionsByDay } from '@/lib/calendar';
import { weekStartISO, weekTitles } from '@/lib/scrapbook';
import { shouldShowWhatsNew, WHATS_NEW } from '@/lib/whats-new';
import { celebrationTier, doneAffirmation, finishContext } from '@/lib/celebrate';
import { combineTasks, eligibleForCombine } from '@/lib/combine';
import { aiErrorLine } from '@/lib/connection';
import { ageInDays, isBigWin } from '@/lib/reward';
import { phaseGreeting } from '@/lib/phase';
import { addDaysISO, daysBetween, formatTodayLabel, friendlyDate, fromISODate, isReentry, presetDate, toISODate } from '@/lib/day';
import { type DayEnergy, type DayTool, dayTools, occupantTool, planEnergyFromDay, toolGate } from '@/lib/day-tools';
import { dayWeight, heavyAt, weightedLoad } from '@/lib/estimate';
import { dayCleared, dayClosed, stepsLanded, taskDone } from '@/lib/haptics';
import { subscribeInbound, takeInbound } from '@/lib/inbound';
import { aiLanguage, fmt, t } from '@/lib/locale';
import { buildOutcome } from '@/lib/outcome';
import { scheduleFields, type CaptureSchedule, type Recurrence } from '@/lib/recurrence';
import { availableNudgePresets, isWindDownTime, type NudgePreset, nudgeTargetFor } from '@/lib/nudge';
import { cancelNudge, disableDailyReminder, enableDailyReminder, scheduleNudge } from '@/lib/reminders';
import { reminderReasonLine } from '@/lib/reminders-types';
import { applySliceDelta, clearSlices, MAX_SLICES, MIN_SLICES, setSliceTotal } from '@/lib/slices';
import { spreadDueDates } from '@/lib/spread';
import { loadClosedDate, loadDayEnergy, loadEnergyUses, loadHoldHintSeen, loadLastOpen, loadLastSyncOk, loadLowDayDate, loadOnboarded, loadReminderHour, loadReminderOfferMade, loadReminderOn, loadScrapbookOfferMade, loadScrapbooks, loadSyncedOwner, loadTasks, loadWhatsNewSeen, saveClosedDate, saveDayEnergy, saveEnergyUses, saveHoldHintSeen, saveLastOpen, saveLastSyncOk, saveLowDayDate, saveReminderOfferMade, saveReminderOn, saveScrapbookOfferMade, saveSyncedOwner, saveTasks, saveWhatsNewSeen, wipeLocalData, loadWidgetOfferMade, saveWidgetOfferMade } from '@/lib/storage';
import { restedOffer } from '@/lib/offers';
import { type DayContext, dropFromOrder, hasContext, moveInOrder } from '@/lib/plan-day';
import { hasWidgetPlaced, WIDGETS_SUPPORTED } from '@/widget/presence';
import { isSyncConfigured, supabase } from '@/lib/supabase';
import { syncScrapbooks } from '@/lib/scrapbook-sync';
import { isAccountGone, localBelongsToAnother, syncOnce } from '@/lib/sync';
import { completeOnDay, makeId, nowMs, parseDump, sweepElapsedNudges, type Task, withMonotonicStamps } from '@/lib/tasks';
import { summarizeAdded, summaryLine, triageToTasks } from '@/lib/triage';
import { track } from '@/lib/telemetry';
import { updateWidget } from '@/widget/update';
import { useReducedMotion, useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';
import { usePremium } from '@/lib/premium-provider';
import { applyManualOrder, completeAncestors, deferTo, deferToTomorrow, hasActiveTinyChild, isDoneOn, isRecurring, pinFirst, renameTask, resurfaceOpenParent, setBig, setPin, setSequence, skipOn, tasksForToday, tinyParentTitle, toggleDoneOn, upcomingTasks } from '@/lib/today';

import closeDayArt from '../../assets/images/closeday.jpg';
import emptyArt from '../../assets/images/empty.jpg';

const REENTRY_GAP_DAYS = 4; // a calm "welcome back" shows on the first open after this many days away

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [closedDate, setClosedDate] = useState<string | null>(null);
  const [lowDayDate, setLowDayDate] = useState<string | null>(null);
  // The Energy day-state (the constant frame). null = the pills were not touched today, which reads
  // as Normal; it is a DAY-state, never a setting, so a stored record from yesterday is ignored on
  // load and the day starts at Normal by construction.
  const [dayEnergySel, setDayEnergySel] = useState<DayEnergy | null>(null);
  // The fixed action layer: whether the caret panel is open, and which unavailable tool (if any)
  // is currently explaining itself in one plain line.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolHint, setToolHint] = useState<DayTool | null>(null);
  // The slot's occupant resolves from the hour the screen OPENED at and never changes mid-session:
  // a slot that flipped from Plan to Focus while you looked away is the reshaping this design kills.
  const [hourAtOpen] = useState(() => new Date().getHours());
  const [sortSummary, setSortSummary] = useState<string | null>(null);
  const [affirmation, setAffirmation] = useState<string | null>(null); // a brief "done is done" / "good enough" reassurance; auto-clears
  const [bloom, setBloom] = useState<BloomData | null>(null); // the held whole-task-finish celebration
  const [roomsOpen, setRoomsOpen] = useState(false); // the Rooms navigation sheet (collapses the 4 header links)
  const affirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const affirmCount = useRef(0); // rotates the completion affirmation through the pool (lib/celebrate)
  const tinyBusy = useRef(false); // guards the make-it-tiny AI call from a double-fire
  const [reentry, setReentry] = useState(false);
  const [didOpen, setDidOpen] = useState(false);
  const [didText, setDidText] = useState('');
  const [closeNote, setCloseNote] = useState('');
  // The tasks the Move-to picker is about, captured when it opens: one task from a held card, or
  // the whole selection from the bulk bar. Non-null opens the picker. Held as ids (not read back
  // off `selected`) so a single-task move is not silently a zero-task move.
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [doneOnId, setDoneOnId] = useState<string | null>(null); // the task being marked "Done on…" an earlier day; non-null opens the picker modal
  const [combineOpen, setCombineOpen] = useState(false); // the Combine review modal
  const [combineTitle, setCombineTitle] = useState(''); // the editable umbrella title (AI-suggested)
  const [beingCombined, setBeingCombined] = useState<string[]>([]); // snapshot of the ids being folded
  const combineBusy = useRef(false); // guards the combine AI call from a double-fire
  const [manualBdOpen, setManualBdOpen] = useState(false); // the no-AI "break it down by hand" modal (type the steps yourself)
  const [manualBdId, setManualBdId] = useState<string | null>(null); // the task being broken down by hand (becomes the silent parent)
  const [manualBdTitle, setManualBdTitle] = useState(''); // its title, for the modal heading
  const [manualBdText, setManualBdText] = useState(''); // the typed steps, one per line
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [nudgeId, setNudgeId] = useState<string | null>(null); // the task the reminder is for, captured at open time (pickNudge awaits, so a derived read could shift under it)
  const [nudgePresets, setNudgePresets] = useState<NudgePreset[]>([]);
  const [sliceEditOpen, setSliceEditOpen] = useState(false); // the "track in steps" editor (split a task into parts)
  const [sliceEditCount, setSliceEditCount] = useState(MIN_SLICES);
  const [sliceEditId, setSliceEditId] = useState<string | null>(null); // captured so confirm/clear survive exitSelect
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusPick, setFocusPick] = useState<string | null>(null);
  // Energy matching ("What fits right now?"): the one-question modal, its pick, and the
  // freemium meter's local use history (15 a month free; see lib/energy.ts).
  const [energyOpen, setEnergyOpen] = useState(false);
  const [energyBusy, setEnergyBusy] = useState(false);
  const [energyPick, setEnergyPick] = useState<{ id: string; line: string } | null>(null);
  const [energyErr, setEnergyErr] = useState<string | null>(null);
  const [energyNote, setEnergyNote] = useState<string | null>(null); // the calm "n left this month" line, at 10 and 5
  const [energyUses, setEnergyUses] = useState<number[]>([]);
  const { premium, loading: premiumLoading } = usePremium(); // gates Pin; a dev override drives it locally
  const brainDumpRef = useRef<BrainDumpHandle>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false); // the OCR photo-capture modal (premium)
  const { width: winW, height: winH } = useWindowDimensions();
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
  // "Plan my day" asks about the day BEFORE it sorts (energy / work-or-off / indoors-or-out), so the
  // order fits the day the person is actually having. Every answer is optional.
  const [planAskOpen, setPlanAskOpen] = useState(false);
  const [dayContext, setDayContext] = useState<DayContext>({});
  const [sequencing, setSequencing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [holdHintSeen, setHoldHintSeen] = useState(true); // default true: don't flash the coachmark before it loads
  const [syncOk, setSyncOk] = useState<boolean | null>(null); // last sync result; null until known, false = local-only
  const [reminderOfferMade, setReminderOfferMade] = useState(true); // default true: don't flash the close-day reminder offer
  // The home-screen widget offer (the "app comes to you" pass). Both default to the quiet answer so
  // nothing flashes before the real values load, matching the reminder offer above.
  const [widgetOfferMade, setWidgetOfferMade] = useState(true);
  const [widgetPlaced, setWidgetPlaced] = useState(true);
  const [scrapbookOfferMade, setScrapbookOfferMade] = useState(true); // default true: never flash the ask
  const [scrapbookMade, setScrapbookMade] = useState(true);
  const [showWhatsNew, setShowWhatsNew] = useState(false); // default false: never flash the card
  // The keyboard's current height. The OS gives us NOTHING here: SDK 5x Android is
  // edge-to-edge, which IGNORES adjustResize, so the keyboard overlays the window and a
  // bottom-anchored panel simply vanishes under it (tester screenshots, 2026-07-26). The
  // web keyboard is handled by the viewport meta (interactive-widget) instead; RN's
  // Keyboard module never fires there, so this stays 0 on web by construction.
  const [kbHeight, setKbHeight] = useState(0);
  const [widgetHowShown, setWidgetHowShown] = useState(false); // the ask swaps to the instructions in place
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
  const aiEnabled = useSettings().settings.aiEnabled; // false hides every gen-AI affordance on Today (Break it down, Strategise, Make it tiny, Combine, Plan my day)
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
      // A record from a past day comes back null, which IS the morning reset: the day starts at
      // Normal because nothing says otherwise, not because anything ran at midnight.
      void loadDayEnergy(toISODate(today)).then((rec) => {
        if (active && rec) setDayEnergySel(rec.level);
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
    void loadHoldHintSeen().then((seen) => {
      if (active) setHoldHintSeen(seen);
    });
    void loadLastSyncOk().then((v) => {
      if (active) setSyncOk(v);
    });
    void loadReminderOfferMade().then((made) => {
      if (active) setReminderOfferMade(made);
    });
    void loadWidgetOfferMade().then((made) => {
      if (active) setWidgetOfferMade(made);
    });
    void loadScrapbookOfferMade().then((made) => {
      if (active) setScrapbookOfferMade(made);
    });
    // Whether they have EVER made a scrapbook: someone who has needs no introduction to it.
    void loadScrapbooks().then((books) => {
      if (active) setScrapbookMade(books.length > 0);
    });
    // What's New: content-keyed, once per announcement, never to a fresh install (onboarding
    // stamps the current id, so only a device that predates the announcement sees it).
    void Promise.all([loadWhatsNewSeen(), loadOnboarded()]).then(([seen, onboarded]) => {
      if (active) setShowWhatsNew(shouldShowWhatsNew(seen, onboarded));
    });
    // Asks the launcher whether a DoubleDone widget is actually on the home screen, so someone who
    // already has one is never offered it. No-ops to "placed" on web and on any error.
    void hasWidgetPlaced().then((placed) => {
      if (active) setWidgetPlaced(placed);
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
    // WAIT for the local load (`loaded`) before syncing. Without this gate the sync could
    // race loadTasks and run against the empty initial tasksRef, which makes every remote row
    // look "remote-only": it pulls non-deleted copies back down AND overwrites local storage,
    // wiping any un-pushed tombstone (a delete made this session but not yet synced). That is
    // the "deleted task keeps coming back" bug, worst for agent-added tasks whose tombstone
    // has only ever lived locally. Gating on `loaded` makes the merge see the real local set.
    if (!supabase || !session || !loaded) return;
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
        // Keepsakes ride behind the task sync, best effort and internally caught, so a
        // scrapbook hiccup can never mark the task sync failed. `foreign` mirrors the
        // cross-account guard above: another account's local books never migrate up.
        void syncScrapbooks(client, uid, foreign);
        track('sync.completed', { count: merged.length });
        setSyncOk(true);
        void saveLastSyncOk(true);
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
          // A non-fatal sync failure (network, RLS, 5xx, expired token): the tasks are safe on this device,
          // but we must NOT keep claiming "Synced", that is a false promise of cross-device safety.
          track('sync.failed', { error: e instanceof Error ? e.message : e });
          if (active) setSyncOk(false);
          void saveLastSyncOk(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [session, loaded]);

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
  // Since the capture redesign, BrainDump stays MOUNTED while the panel is hidden (typed
  // text survives a collapse), so the ref usually exists even with the panel closed: the
  // seed goes through it directly, and setCaptureOpen(true) reveals the panel. pendingSeed
  // still covers the one true gap (an intent arriving before the first mount on a cold
  // start), flushed by the CALLBACK REF below the moment BrainDump actually mounts. That
  // callback-ref flush cured the launch-week "share only works when the box is already
  // open" bug; do not go back to flushing from an effect.
  const pendingSeed = useRef<string | null | undefined>(undefined); // undefined = nothing parked
  useEffect(
    () =>
      subscribeInbound(() => {
        const i = takeInbound();
        if (!i) return;
        if (i.kind === 'focus') {
          setFocusPick(null);
          setFocusOpen(true);
          track('focus.opened', { via: 'shortcut' });
          return;
        }
        const text = i.kind === 'capture' ? i.text : null;
        setCaptureOpen(true);
        if (brainDumpRef.current) {
          brainDumpRef.current.seed(text);
        } else {
          pendingSeed.current = text;
        }
        track(i.kind === 'capture' ? 'capture.shared' : 'capture.shortcut');
      }),
    [],
  );

  // The panel opens focused: the first keystroke never waits (capture iron rule). Focus can
  // only land after the reveal renders (a hidden input ignores focus on web), so it runs as
  // an effect on the flip, not inside the tap handler.
  useEffect(() => {
    if (captureOpen) brainDumpRef.current?.seed(null);
  }, [captureOpen]);

  // Track the keyboard so the footer can lift the capture panel above it (see kbHeight).
  // iOS uses the will-events (the did-events land after the animation and read as lag).
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

  // The ref both render sites pass to BrainDump: keeps .current in sync AND flushes any
  // parked seed exactly when the box mounts, however late that is (a cold start's first
  // load, the footer appearing, the capture panel opening). Timing can no longer lose it.
  function attachBrainDump(h: BrainDumpHandle | null) {
    brainDumpRef.current = h;
    if (h && pendingSeed.current !== undefined) {
      h.seed(pendingSeed.current);
      pendingSeed.current = undefined;
    }
  }

  const visible = pinFirst(applyManualOrder(tasksForToday(tasks, today))); // the pin floats to the very top, then any accepted manual order
  // The current week's deduped finishes: the scrapbook's raw material, read by the earned-moment mention.
  const weekFinishes = weekTitles(completionsByDay(tasks), weekStartISO(today)).length;
  const upcoming = upcomingTasks(tasks, today);
  const allDone = loaded && visible.length > 0 && visible.every((t) => isDoneOn(t, today));
  // Closed when the stored close-date is today's; it self-clears when the date rolls over.
  const isClosed = closedDate === toISODate(today);
  const isLowDay = lowDayDate === toISODate(today);
  const windDown = isWindDownTime(today); // evening: a gentle in-app nudge toward closing the day
  const todayDone = useMemo(() => completionsByDay(tasks).get(toISODate(today)) ?? [], [tasks, today]);
  // One-off, undone tasks on Today: the ones Strategise can re-spread (recurring stay by cadence).
  const spreadable = visible.filter((t) => !isRecurring(t) && !isDoneOn(t, today));
  // Kept for exactly ONE consumer now that every single-task action lives on the held card: the
  // recurring-aware Remove label on the bulk bar. Searches all tasks (not just Today's) so a lone
  // selected Later repeat is still labelled honestly.
  const onlyTask = selected.length === 1 ? tasks.find((t) => t.id === selected[0] && !t.deletedAt) : undefined;
  // For the multi-select "Big" toggle: true when every selected task is already big, so the action flips to
  // "Not big" (clear); a mixed or empty selection marks all big (the additive, validating default).
  const allBig = selected.length > 0 && selected.every((id) => tasks.find((t) => t.id === id)?.big);
  // The selected tasks eligible to combine (open one-offs); the Combine action shows at 2+.
  const combinable = selected.filter((id) => {
    const t = tasks.find((x) => x.id === id);
    return t != null && eligibleForCombine(t);
  });
  // The select shelf (congruency pass, 2026-08-08): select mode's bar joins the held-card-v2
  // family. The shelf rises like the card; Combine fades within a PERMANENTLY reserved slot
  // (the bar never changes height mid-selection); its arrival is announced exactly once.
  const allSelected = spreadable.length > 0 && selected.length >= spreadable.length;
  const combineEligible = selectMode && combinable.length >= 2;
  const [shelfRise] = useState(() => new Animated.Value(0));
  const [combineFade] = useState(() => new Animated.Value(0));
  const combineWasEligible = useRef(false);
  useEffect(() => {
    if (!selectMode) {
      shelfRise.setValue(0);
      return;
    }
    Animated.timing(shelfRise, { toValue: 1, duration: reduced ? 90 : 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [selectMode, reduced, shelfRise]);
  useEffect(() => {
    Animated.timing(combineFade, { toValue: combineEligible ? 1 : 0, duration: reduced ? 1 : 180, useNativeDriver: false }).start();
    if (combineEligible && !combineWasEligible.current) {
      AccessibilityInfo.announceForAccessibility?.(t('today.combineAvailableAnnounce'));
    }
    combineWasEligible.current = combineEligible;
  }, [combineEligible, reduced, combineFade]);
  // Focus mode shows one unfinished one-off at a time (recurring habits are not the
  // wall-of-awful). The first not-yet-skipped one; completing or skipping advances it.
  const focusTask = focusOpen && focusPick ? (spreadable.find((t) => t.id === focusPick) ?? null) : null;
  const bigCount = spreadable.filter((t) => t.big).length;
  // The day's effective energy: the pill if touched today, else the legacy low-day flag (an
  // in-flight low day from before this build still reads as Low), else Normal.
  const dayEnergy: DayEnergy = dayEnergySel ?? (isLowDay ? 'low' : 'normal');
  const weightOfDay = dayWeight(spreadable.length, dayEnergy, bigCount);
  // A big task weighs more than its count: weightedLoad makes each big count as BIG_WEIGHT normal tasks, so a
  // genuinely piled day (or one big task plus a real pile) reads heavy and offers the relief tools. A LONE big
  // task lifts the gauge (the floor inside dayWeight) but does NOT trip this: re-spreading cannot dissolve one
  // big rock, Break it down is the tool for that. Heavy (and low-day capacity) gates the nudge + "Lighten today".
  const weighted = weightedLoad(spreadable.length, bigCount);
  const dayIsHeavy = heavyAt(weighted, dayEnergy);
  // The constant frame's fixed pieces: the tool set for this configuration, the slot's occupant
  // (clock-resolved at open, held for the session), and the availability gate per tool.
  const frameTools = dayTools(aiEnabled);
  const occupant = occupantTool(hourAtOpen, aiEnabled);
  const gateFor = (tool: DayTool) => toolGate(tool, { openCount: spreadable.length, heavy: dayIsHeavy });
  const toolLabel = (tool: DayTool) =>
    tool === 'plan'
      ? t('actions.planMyDay')
      : tool === 'focus'
        ? t('today.focusOne')
        : tool === 'lighten'
          ? t('actions.lightenToday')
          : tool === 'settle'
            ? t('today.toolSettle')
            : t('today.closeTheDay');

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
    // Monotonic updatedAt (see withMonotonicStamps): guarantees a task we changed beats the
    // copy we synced, even one written by the MCP Worker's clock or another device, so a
    // delete/edit can never lose last-write-wins to a future-timestamped remote row and
    // silently resurrect on the next pull.
    const stamped = withMonotonicStamps(next, tasks);
    setTasks(stamped);
    void saveTasks(stamped);
    void updateWidget(stamped, closedDate); // keep any home-screen widget in sync (native; no-op on web)
  }

  // Remove is scoped to what Today shows: Today manages days, the Repeating drawer
  // manages the series. A recurring task's Remove skips TODAY'S instance only (the
  // series continues on its next due day, see skipOn); a one-off is soft-deleted, a
  // tombstone (hidden from every view) rather than a drop, so the deletion can sync
  // to other devices instead of resurrecting on pull.
  function removeTask(id: string) {
    const now = nowMs();
    const target = tasks.find((x) => x.id === id);
    if (target && isRecurring(target)) {
      commit(tasks.map((x) => (x.id === id ? clearNudgeIfAny({ ...skipOn(x, today), updatedAt: now }) : x)));
      setConfirmingId(null);
      track('repeat.instance_skipped');
      affirm(t('repeat.skippedToday'));
      return;
    }
    commit(tasks.map((x) => (x.id === id ? clearNudgeIfAny({ ...x, deletedAt: now, updatedAt: now }) : x)));
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

  // "Done on…": mark a rolled-over task done as of the EARLIER day it was actually
  // finished, so the Lookback attributes it honestly. This is bookkeeping, not a fresh
  // win: the quiet affirmation only, never the bloom or a haptic celebration.
  function openDoneOn(id: string) {
    dismissActions(); // the picker takes over from here
    setDoneOnId(id);
  }

  function pickDoneOn(iso: string) {
    const id = doneOnId;
    setDoneOnId(null);
    if (id == null) return;
    const now = nowMs();
    commit(tasks.map((x) => (x.id === id ? clearNudgeIfAny(completeOnDay(x, iso, now)) : x)));
    track('task.done_earlier', { daysBack: daysBetween(fromISODate(iso), today) });
    affirm(t('today.doneOnAffirm', { day: friendlyDate(iso, today) }));
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

  // --- Energy matching: "What fits right now?" ------------------------------------------
  // One question (how much have you got), one Haiku pick, propose-only. Free is 15 a
  // calendar month, metered locally (lib/energy.ts, the scrapbook-gate precedent); the
  // gate is checked BEFORE any network call, and past the cap the tap routes to the
  // paywall exactly like Pin / Quiet. Reminders surface at 10 and 5 picks left.
  function openEnergy() {
    if (premiumLoading) return; // entitlement still resolving: a tap is a no-op, never a wrong bounce
    const gate = canMatchEnergy(premium, energyUses, nowMs());
    if (!gate.allowed) {
      track('premium.gate_hit', { reason: 'energy' });
      router.push('/premium');
      return;
    }
    setEnergyPick(null);
    setEnergyErr(null);
    setEnergyNote(null);
    setEnergyOpen(true);
    track('energy.opened');
  }

  async function runEnergy(level: Energy) {
    if (energyBusy) return;
    setEnergyBusy(true);
    setEnergyErr(null);
    const pick = await matchEnergy(
      spreadable.map((x) => ({ id: x.id, title: x.title, big: x.big })),
      level,
      aiLanguage,
    );
    setEnergyBusy(false);
    if (!pick) {
      setEnergyErr(aiErrorLine(t('today.energyError')));
      return;
    }
    // A use is spent only on a successful pick, never on an error, so a flaky network
    // can never quietly drain the month's allowance.
    const nextUses = recordEnergyUse(energyUses, nowMs());
    setEnergyUses(nextUses);
    void saveEnergyUses(nextUses);
    const after = canMatchEnergy(premium, nextUses, nowMs());
    setEnergyNote(after.remaining != null && shouldWarnEnergy(after.remaining) ? t('today.energyLeft', { count: after.remaining }) : null);
    setEnergyPick(pick);
    track('energy.used', { energy: level, remaining: after.remaining ?? -1 });
  }

  function startEnergyPick() {
    if (!energyPick) return;
    setEnergyOpen(false);
    setFocusPick(energyPick.id);
    setFocusOpen(true);
    track('energy.started');
  }

  useEffect(() => {
    void loadEnergyUses().then(setEnergyUses);
  }, []);

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
    affirm(wasPinned ? t('today.unpinnedAffirm') : t('today.pinnedAffirm'));
    dismissActions();
  }

  // Multi-select: act on several tasks at once. Only ever reached deliberately, from a held
  // row's "Select more", so it always starts at 1 and is meant for 2+.
  // Android carries the long-press through the row's re-render into select mode, so the
  // thumb-lift then fires onSelect on the now-select row and would toggle the id straight
  // back off. selectGuard remembers the just-selected id so toggleSelect swallows that one.
  const selectGuard = useRef<{ id: string; at: number } | null>(null);
  function enterSelectWith(id: string) {
    setSelectMode(true);
    setSelected([id]);
    selectGuard.current = { id, at: nowMs() };
    // Kept as "select.opened" (renaming forfeits the history), but its meaning narrows here from
    // "someone held a task" to "someone wants BULK": the prop keeps that legible in the data.
    track('select.opened', { from: 'select_more' });
  }
  // ONE gesture, ONE meaning: a hold reveals that row's own actions, in place, in both
  // appearances. It deliberately changes NOTHING else on the screen, which is the whole
  // point: the page keeps its height, so it can never lurch back to the top the way the
  // old mode-flip did (that hid the day actions, shortened the page, and the ScrollView
  // clamped to 0). Bulk is a door you walk through, not a room you get thrown into.
  function onRowLongPress(id: string) {
    setConfirmingId(id);
    track('hold.opened');
  }
  // Reorder eligibility: an open, unpinned task (the pin owns the very top by other means).
  function canReorder(task: Task, day: Date): boolean {
    return !isDoneOn(task, day) && !(task.pinnedAt != null);
  }
  // "Up" stops BELOW a pinned top task: pinFirst floats the pin above any stamped order, so
  // letting a task move into slot 0 would be a tap that visibly does nothing.
  const reorderTopIdx = visible.length > 0 && visible[0].pinnedAt != null && !isDoneOn(visible[0], today) ? 1 : 0;

  // Free manual reorder (born of the second "how do I re-order?" field report, 2026-08-04):
  // nudge a task one place in today's VISIBLE order by stamping the whole order via
  // setSequence (the same machinery Plan-my-order accepts into). Free on purpose: Pin is
  // premium and was the only ordering a free user could even be told about, which was none.
  // Deliberately not act-and-dismiss: the card stays held so three places is three taps.
  function moveRow(id: string, delta: -1 | 1) {
    const ids = visible.map((v) => v.id);
    const next = moveInOrder(ids, ids.indexOf(id), delta);
    if (next === ids) return; // already at the edge
    commit(setSequence(tasks, next, nowMs()));
    // The design-v2 contract: each rail tap announces the landing place, so a screen-reader
    // user hears the move happen without leaving the still-open card.
    const pos = next.indexOf(id) + 1;
    AccessibilityInfo.announceForAccessibility?.(
      t(delta === -1 ? 'today.movedUpAnnounce' : 'today.movedDownAnnounce', { pos: String(pos), total: String(next.length) }),
    );
    track('task.reordered', { dir: delta === -1 ? 'up' : 'down' });
  }

  // The held card carries the single-task shaping actions. All act-and-dismiss (the row stays
  // put, so we close the card ourselves).
  function bigRow(task: Task) {
    markBig([task.id], !task.big);
  }
  // Rename from the card's tappable title. Deliberately NOT act-and-dismiss: fixing a typo then
  // continuing to another action is the natural flow, and the changed title is its own feedback.
  // renameTask returns the same array on a no-op (empty / unchanged), so nothing commits or syncs.
  function renameRow(id: string, title: string) {
    const next = renameTask(tasks, id, title, nowMs());
    if (next !== tasks) {
      commit(next);
      track('task.renamed');
    }
  }
  function pinRow(task: Task) {
    if (premiumLoading) return; // entitlement still resolving: a tap is a no-op, never a wrong bounce
    if (task.pinnedAt == null && !premium) {
      track('premium.gate_hit', { reason: 'pin' });
      router.push('/premium');
      dismissActions();
      return;
    }
    pinTask(task.id);
  }
  // The door out of the single-row held-state into multi-select, for the bulk actions
  // (Combine, move several to a day, tick several off) that only make sense on 2+.
  function selectFromRow(id: string) {
    setConfirmingId(null);
    enterSelectWith(id);
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected([]);
  }
  // Close whatever single-task surface is open, without the caller having to know which one it
  // was: an action can now be reached from the held card OR from the bulk bar, and each half is
  // a no-op when the other is what is showing.
  function dismissActions() {
    setConfirmingId(null);
    exitSelect();
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
    doneAffirm();
    exitSelect();
  }
  function bulkRemove() {
    if (selected.length === 0) return;
    const now = nowMs();
    const set = new Set(selected);
    // Same split as removeTask: a selected recurring task is skipped for today only
    // (the repeat continues), one-offs keep the tombstone. A mixed selection does both.
    const skippedCount = selected.filter((id) => {
      const x = tasks.find((y) => y.id === id);
      return x != null && isRecurring(x);
    }).length;
    commit(
      tasks.map((x) => {
        if (!set.has(x.id)) return x;
        if (isRecurring(x)) return clearNudgeIfAny({ ...skipOn(x, today), updatedAt: now });
        return clearNudgeIfAny({ ...x, deletedAt: now, updatedAt: now });
      }),
    );
    if (skippedCount > 0) track('repeat.instance_skipped', { count: skippedCount });
    if (selected.length - skippedCount > 0) track('bulk.removed', { count: selected.length - skippedCount });
    // Only-recurring removals get the honest reassurance: nothing died, today was skipped.
    if (skippedCount === selected.length) affirm(t('repeat.skippedToday'));
    exitSelect();
  }
  function bulkMoveTo(iso: string) {
    const ids = moveIds;
    if (!ids?.length) return;
    const now = nowMs();
    const set = new Set(ids);
    commit(tasks.map((t) => (set.has(t.id) && !isRecurring(t) ? clearNudgeIfAny({ ...deferTo(t, iso), updatedAt: now }) : t)));
    track('bulk.moved', { count: ids.length });
    setMoveIds(null);
    dismissActions();
  }

  // Mark (or unmark) the selected tasks as big: the user saying these weigh heavily. Free, multi-select,
  // and validating, never a scold. Lifts the weight gauge + the heavy-day signal, and makes finishing one a
  // big-win. The toggle direction (allBig) is decided at the call site, so a second tap reverses it.
  function markBig(ids: string[], on: boolean) {
    if (ids.length === 0) return;
    commit(setBig(tasks, ids, on, nowMs()));
    track('bulk.big', { count: ids.length, on });
    affirm(on ? t('today.markedBigAffirm') : t('today.easedOffAffirm'));
    dismissActions();
  }

  // Combine (the inverse of Break-it-down): the structural fold (combineTasks) is AI-free, so this works
  // with AI off. The AI's only job is SUGGESTING the umbrella name; with AI off we start from a plain join
  // the editable review lets the user keep or rename. Best-effort, so an AI failure never blocks the fold.
  async function openCombine() {
    if (combineBusy.current) return;
    const ids = combinable;
    if (ids.length < 2) return;
    combineBusy.current = true;
    setBeingCombined(ids);
    const titles = ids
      .map((id) => tasks.find((t) => t.id === id)?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
    let suggested = titles.join(', ');
    if (aiEnabled) {
      affirm(t('today.combineFindingName'));
      try {
        suggested = await combine(titles, aiLanguage);
      } catch {
        suggested = ''; // best-effort: open the review with an empty name for the user to type
      }
    }
    combineBusy.current = false;
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
    affirm(t('today.combinedAffirm', { title }));
    setCombineOpen(false);
    setCombineTitle('');
    setBeingCombined([]);
    exitSelect();
  }

  // "Remind me": a calm preset chooser (the late-night guard hides anything that would fire
  // past 9pm), then a local nudge for the held task, stamped so the row shows it and so done /
  // remove / defer can cancel it. Native only; the web build no-ops.
  function openNudge(id: string) {
    setNudgeId(id);
    setNudgePresets(availableNudgePresets(new Date()));
    setNudgeOpen(true);
  }
  async function pickNudge(presetId: string) {
    const task = tasks.find((x) => x.id === nudgeId);
    setNudgeOpen(false);
    setNudgeId(null);
    if (!task) return;
    const target = nudgeTargetFor(presetId, new Date());
    if (!target) return;
    const id = await scheduleNudge(task.id, task.title, target);
    if (id) {
      commit(tasks.map((t) => (t.id === task.id ? { ...t, nudgeAt: target.getTime(), nudgeId: id, updatedAt: nowMs() } : t)));
      track('nudge.set', { preset: presetId });
    }
    dismissActions();
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
          await syncScrapbooks(client, uid); // flush unpushed keepsakes too, same best effort
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
  /**
   * State today's energy (the pills). Replaces the old low-day toggle: Low IS the low-capacity day
   * (Cluster C), so choosing it writes the same lowDayDate the close-day copy and any older code
   * still read, and choosing Normal or High clears it. One concept, one source of truth, and an
   * in-flight low day from before this build carries over without a migration.
   */
  function setEnergy(level: DayEnergy) {
    if (level === dayEnergy && dayEnergySel != null) return; // radiogroup: re-tapping the chosen pill is a no-op
    const iso = toISODate(today);
    setDayEnergySel(level);
    void saveDayEnergy({ date: iso, level });
    if (level === 'low') {
      setLowDayDate(iso);
      void saveLowDayDate(iso);
      affirm(t('today.lowDayAffirm')); // the same warm permission the low-day toggle gave
    } else {
      setLowDayDate(null);
      void saveLowDayDate(null);
    }
    track('energy.day_set', { level });
  }

  /**
   * Run a day tool from the fixed layer. An unavailable tool never navigates and never scolds: it
   * states, once, in one plain line, what the TOOL needs. Every tool behind this stays propose-
   * then-accept (Plan gates premium then asks; Lighten proposes a re-spread; Close opens the wrap).
   */
  function runTool(tool: DayTool) {
    const gate = gateFor(tool);
    if (!gate.available) {
      setToolHint(tool);
      track('daytools.unavailable', { tool });
      return;
    }
    setToolsOpen(false);
    setToolHint(null);
    if (tool === 'plan') openPlanAsk();
    else if (tool === 'focus') openFocus();
    else if (tool === 'lighten') void runStrategise();
    else if (tool === 'settle') router.push('/settle');
    else openClose();
  }

  function toggleToolsPanel() {
    setToolHint(null);
    if (!toolsOpen) track('daytools.opened');
    setToolsOpen(!toolsOpen);
  }

  function closeToolsPanel() {
    setToolsOpen(false);
    setToolHint(null);
  }

  function openDrawer() {
    setDrawerOpen(true);
    track('repeating.opened');
  }

  // The Repeating drawer manages the series (Today manages days): rename or
  // re-cadence a repeating task in place. updatedAt bumps so the edit wins
  // last-write-wins sync, the same commit path as every other task mutation.
  function editSeries(id: string, title: string, recurrence: Recurrence) {
    const now = nowMs();
    commit(tasks.map((x) => (x.id === id ? { ...x, title, recurrence, updatedAt: now } : x)));
    track('repeat.series_edited');
  }

  // Remove the whole series: the standard tombstone (hidden from every view, syncs
  // as a delete). The drawer pairs it with a 6-second undo, matching routines, so
  // it is recoverable rather than a confirmation gauntlet.
  function removeSeries(id: string) {
    const now = nowMs();
    commit(tasks.map((x) => (x.id === id ? clearNudgeIfAny({ ...x, deletedAt: now, updatedAt: now }) : x)));
    track('repeat.series_removed');
  }

  // The undo: clear the tombstone and the series is back, cadence and history intact.
  function restoreSeries(id: string) {
    const now = nowMs();
    commit(tasks.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: now } : x)));
    track('repeat.remove.undone');
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
      const result = await enableDailyReminder(await loadReminderHour());
      setReminderOn(result.ok);
      void saveReminderOn(result.ok);
      track('reminder.enabled', { granted: result.ok });
      if (!result.ok) affirm(reminderReasonLine(result.reason)); // never a silent bounce-back
    }
  }

  // The one-time daily-reminder offer, shown on the rested screen after the first close-the-day (the moment its
  // value is concrete). Either choice retires it for good, so it never nags. The reminder is the named lever
  // against the week-three retention cliff, surfaced here instead of only in a faint footer link.
  async function acceptReminderOffer() {
    setReminderOfferMade(true);
    void saveReminderOfferMade();
    const result = await enableDailyReminder(await loadReminderHour());
    setReminderOn(result.ok);
    void saveReminderOn(result.ok);
    track('reminder.enabled', { granted: result.ok, via: 'closeday_offer' });
    if (!result.ok) affirm(reminderReasonLine(result.reason));
  }
  function dismissReminderOffer() {
    setReminderOfferMade(true);
    void saveReminderOfferMade();
    track('reminder.offer_declined');
  }
  // The widget offer can only TEACH the gesture: Android gives no way to place a widget for someone.
  // So "yes" swaps the ask for the instructions in place, and spends the one-time offer either way.
  function acceptWidgetOffer() {
    setWidgetHowShown(true);
    void saveWidgetOfferMade();
    track('widget.offer_accepted');
  }
  function dismissWidgetOffer() {
    setWidgetOfferMade(true);
    void saveWidgetOfferMade();
    track('widget.offer_declined');
  }
  function dismissWhatsNew() {
    setShowWhatsNew(false);
    void saveWhatsNewSeen(WHATS_NEW.id);
    track('whatsnew.dismissed', { id: WHATS_NEW.id });
  }

  // The scrapbook mention (the ladder's LAST rung): the free monthly keepsake was advertised
  // nowhere but the premium page, so it is introduced once, at the earned moment the week
  // could already be one. "Yes" is just a door to the Calendar, where the scrapbook lives.
  function acceptScrapbookOffer() {
    setScrapbookOfferMade(true);
    void saveScrapbookOfferMade();
    track('scrapbook.offer_accepted');
    router.push('/lookback');
  }
  function dismissScrapbookOffer() {
    setScrapbookOfferMade(true);
    void saveScrapbookOfferMade();
    track('scrapbook.offer_declined');
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
      setStrategiseError(aiErrorLine(t('today.strategiseError')));
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
  // Tapping "Plan my day" opens the ask FIRST (premium and the gate are checked before the sheet, so
  // nobody answers three questions and then hits a paywall).
  function openPlanAsk() {
    if (sequencing || premiumLoading) return;
    if (!premium) {
      track('premium.gate_hit', { reason: 'sequence' });
      router.push('/premium');
      return;
    }
    setDayContext({});
    setPlanAskOpen(true);
  }

  async function runSequence(context: DayContext = {}) {
    if (sequencing) return;
    setPlanAskOpen(false);
    setOrderError(null);
    setSequencing(true);
    try {
      const result = await sequence(
        spreadable.map((t) => ({ id: t.id, title: t.title })),
        context.energy,
        aiLanguage,
        context.day,
        context.setting,
      );
      // The SHAPE of the ask only (which questions got answered), never what they answered about
      // themselves beyond the three values, and never any task text.
      track('sequence.requested', { count: spreadable.length, tailored: hasContext(context) });
      if (result.length > 0) setOrder(result);
      else setOrderError(aiErrorLine(t('today.sequenceError')));
    } catch {
      setOrderError(aiErrorLine(t('today.sequenceError')));
    } finally {
      setSequencing(false);
    }
  }

  // Editing the PROPOSAL, before any of it touches the day. Both are pure array ops (lib/plan-day),
  // and a no-op returns the same reference, so nudging the top item up changes nothing at all.
  // Dropping a task removes it from THIS PLAN only: it stays on Today, untouched and undated.
  function movePlanItem(index: number, direction: -1 | 1) {
    setOrder((prev) => (prev ? moveInOrder(prev, index, direction) : prev));
  }
  function dropPlanItem(index: number) {
    setOrder((prev) => (prev ? dropFromOrder(prev, index) : prev));
  }

  function acceptOrder() {
    if (!order || order.length === 0) return;
    commit(setSequence(tasks, order.map((o) => o.id), nowMs()));
    track('sequence.accepted', { count: order.length });
    setOrder(null);
    // Once the day is ordered, if it is still heavy, offer to lighten it (the re-spread). On a calm day
    // there is nothing to push out, so just affirm and stay out of the way.
    if (dayIsHeavy) setOfferDefer(true);
    else affirm(t('today.gentleOrderAffirm'));
  }

  // A brief, consistent reassurance after completing. One timer at a time, so a fresh completion is
  // never cut short by an older one's clear.
  function affirm(line: string) {
    setAffirmation(line);
    if (affirmTimer.current) clearTimeout(affirmTimer.current);
    affirmTimer.current = setTimeout(() => setAffirmation(null), 3500);
  }

  // A completed task rotates through the calm completion pool (lib/celebrate), so the reassurance never
  // feels canned and it carries the OCD / perfectionism release ("good enough, let it go") that used to be
  // a separate "Good enough" button.
  function doneAffirm() {
    affirm(doneAffirmation(affirmCount.current++));
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
      if (parentBack) {
        affirm(t('today.tinyParentBackAffirm', { parentTitle: parentBack }));
      } else if (done && !cleared) {
        doneAffirm(); // a rotating completion line (carries the old "good enough" release)
      }
    }
    commit(finalTasks);
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

  // Open the "track in steps" editor for one task (capture its id so the editor survives the held card
  // closing on confirm). Pre-fills the current count, or MIN_SLICES for a still-whole task.
  function openSliceEdit(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    setSliceEditId(t.id);
    setSliceEditCount(t.slices ? Math.min(MAX_SLICES, Math.max(MIN_SLICES, t.slices.total)) : MIN_SLICES);
    setSliceEditOpen(true);
  }
  // Apply the chosen count: split a whole task into parts, or re-size a sliced one (progress carries over,
  // clamped to the new total). The user's discretionary "make this a 20-part task" lever.
  function confirmSliceEdit() {
    const id = sliceEditId;
    if (id == null) return;
    const wasSliced = tasks.find((t) => t.id === id)?.slices != null;
    commit(tasks.map((t) => (t.id === id ? { ...setSliceTotal(t, sliceEditCount), updatedAt: nowMs() } : t)));
    track(wasSliced ? 'slices.resized' : 'slices.defined', { total: sliceEditCount });
    setSliceEditOpen(false);
    setSliceEditId(null);
    dismissActions();
    affirm(t('today.slicesSetAffirm', { count: sliceEditCount }));
  }
  // Drop the parts, back to one whole task (keeps whatever done state it had).
  function makeWhole() {
    const id = sliceEditId;
    if (id == null) return;
    commit(tasks.map((t) => (t.id === id ? { ...clearSlices(t), updatedAt: nowMs() } : t)));
    track('slices.cleared');
    setSliceEditOpen(false);
    setSliceEditId(null);
    dismissActions();
    affirm(t('today.backToOneTaskAffirm'));
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
      setBdQuestions(defaultQuestions());
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
      setBdError(aiErrorLine(t('breakdown.planError')));
    } finally {
      setBdBusy(false);
    }
  }

  // Accept the chosen phase-one steps onto Today, plus a dated milestone task for
  // each later phase (each broken down later, when you reach it). The phases come
  // back from the review, not bdPhases state: they too are propose -> edit -> accept,
  // so the minted milestones carry the user's edits and skip the removed ones.
  function bdAccept(selected: ReviewStep[], phases: ReviewPhase[]) {
    const now = nowMs();
    // Keep the real task as a silent parent and chain the steps to it (Cluster B): an
    // existing task becomes the parent; an at-capture breakdown mints one.
    const parentId = bdParentId ?? makeId();
    const link = { parentId, parentTitle: bdTask };
    const totalMinutes = selected.reduce((sum, s) => sum + s.minutes, 0);
    const stepTasks: Task[] = selected.map((s, i) => ({
      id: makeId(),
      title: t('breakdown.stepTitleWithMinutes', { title: s.title, minutes: s.minutes }),
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      complexity: s.minutes, // the step's effort, used to weight its completion
      ...link,
      ...(bdCorrId ? { decompositionId: bdCorrId, decompositionSteps: selected.length } : {}),
      ...(s.date ? { due: s.date } : {}),
    }));
    const phaseTasks: Task[] = phases.map((p, i) => ({
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

  // Break it down WITHOUT AI: the no-AI twin of breakdownExisting. Same outcome (the task becomes a
  // silent parent and its steps become children), but the user types the steps instead of the model
  // writing them. Opened from the same "Break it down" affordance when AI is off, so the gesture is
  // identical and only the source of the steps changes. No network, no questions, no phases.
  function openManualBreakdown(id: string, title: string) {
    setConfirmingId(null);
    setManualBdId(id);
    setManualBdTitle(title);
    setManualBdText('');
    setManualBdOpen(true);
  }

  function closeManualBreakdown() {
    setManualBdOpen(false);
    setManualBdId(null);
    setManualBdTitle('');
    setManualBdText('');
  }

  function manualBreakdownSubmit() {
    const id = manualBdId;
    const parent = id ? tasks.find((t) => t.id === id) : undefined;
    const lines = manualBdText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!parent || lines.length === 0) {
      closeManualBreakdown();
      return;
    }
    const now = nowMs();
    const link = { parentId: parent.id, parentTitle: parent.title };
    const stepTasks: Task[] = lines.map((title, i) => ({
      id: makeId(),
      title,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      ...link,
    }));
    // The real task goes silent (hidden, auto-completes + blooms when every step is done), exactly as an
    // AI breakdown does, so the parent/child model is identical with AI on or off.
    const withParent = tasks.map((t) => (t.id === parent.id ? { ...t, silentParent: true, updatedAt: now } : t));
    commit([...withParent, ...stepTasks]);
    track('breakdown.manual', { added: lines.length });
    closeManualBreakdown();
    dismissActions();
    stepsLanded(reduced); // the dreaded task just got smaller
  }

  // Make it tiny: the AI returns a 2-minute version; the real task goes silent as an OPEN
  // parent (it never auto-completes), and the tiny version becomes its child on Today.
  // Finishing the tiny version resurfaces the real task (see toggle), never losing it.
  async function makeTiny(id: string, title: string) {
    if (tinyBusy.current) return;
    // Guard against infinite pebbles: if a tiny step for this task is still open, do not
    // spawn another. One pebble at a time.
    if (hasActiveTinyChild(tasks, id)) {
      dismissActions();
      affirm(t('today.tinyAlreadyActive'));
      return;
    }
    tinyBusy.current = true;
    dismissActions();
    affirm(t('today.tinyShrinking'));
    try {
      const tinyTitle = await tiny(title);
      if (!tinyTitle) throw new Error('empty');
      const now = nowMs();
      commit([
        ...tasks.map((t) => (t.id === id ? { ...t, silentParent: true, openParent: true, updatedAt: now } : t)),
        { id: makeId(), title: tinyTitle, done: false, createdAt: now, updatedAt: now, parentId: id, parentTitle: title },
      ]);
      track('tiny.made');
      affirm(t('today.tinyMade'));
    } catch {
      affirm(aiErrorLine(t('today.tinyError')));
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
    // Keyed by appearance: switching Standard <-> Quiet remounts Today's subtree so native
    // lays it out fresh. Without this, a toggle made on the Settings screen re-styles Today
    // while it sits DETACHED behind Settings in the native stack, and the round trip left
    // rows at Quiet's (~3px shorter) measured height under Standard's styles, clipping the
    // row bottoms ("eaten up a bit"). Web never detaches screens, which is why it could not
    // reproduce. A remount on an appearance change is rare and invisible (same values).
    <View key={theme.appearance} style={styles.screen}>
      <LivingBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.seven }]}
        keyboardShouldPersistTaps="handled"
        // Swipe anywhere on the page to put the keyboard away. The capture box is multiline, so
        // iOS's Return key inserts a newline instead of dismissing, which left the keyboard stuck
        // unless you found bare background to tap (Melroy, iOS, 2026-07-15). This is the gesture
        // iOS users already expect, and it works from anywhere, not just the strip above the box.
        keyboardDismissMode="on-drag"
      >
        <View style={styles.topBar}>
          <Text style={styles.date}>{formatTodayLabel(today)}</Text>
          <Pressable
            onPress={() => setRoomsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={aiEnabled ? t('today.menuA11y') : t('today.menuNoAiA11y')}
            hitSlop={8}
            style={({ pressed }) => [styles.roomsPill, pressed && styles.pressed]}
          >
            {theme.appearance !== 'quiet' && (
              <View style={styles.roomsDots}>
                <View style={styles.roomsDot} />
                <View style={styles.roomsDot} />
                <View style={styles.roomsDot} />
              </View>
            )}
            <Text style={styles.roomsLabel}>{t('today.menu')}</Text>
          </Pressable>
        </View>
        {reentry && !isClosed && (
          <View style={styles.reentry}>
            <Text style={styles.reentryTitle}>{t('today.reentryTitle')}</Text>
            <Text style={styles.reentryBody}>
              {t('today.reentryBody')}
            </Text>
            <PrimaryButton
              label={t('today.seeToday')}
              onPress={() => setReentry(false)}
              accessibilityLabel={t('today.seeToday')}
              style={styles.reentryBtn}
            />
          </View>
        )}
        <Text style={styles.title}>{t('common.today')}</Text>
        <Text style={styles.spine}>{phaseGreeting(today)}</Text>
        {/* The day panel, ALWAYS rendered on an open day (real-user report, 2026-07-26: with the
            gauge gated on having tasks, an empty day left the pills floating with no anchor and no
            header, "not so good"). dayWeight(0) already answers the empty day calmly ("A clear
            day."), so the gate predated the redesign and no longer earned its keep: the constant
            frame's own rule, nothing appears or vanishes with the task count, now covers the top
            of the screen too. */}
        {loaded && !isClosed && (
          <View style={styles.weight}>
            {/* The energy gauge stays in Quiet, just whisper-thin: a 3px hairline track (see styles). */}
            <View style={styles.weightTrack}>
              <View style={[styles.weightFill, { flex: weightOfDay.fill }]} />
              <View style={{ flex: 1 - weightOfDay.fill }} />
            </View>
            <Text style={styles.weightLabel}>{weightOfDay.label}</Text>
          </View>
        )}
        {/* The Energy pills: a DAY-state beside the gauge, not a setting. Always the same three, in
            the same place, on every open day (the old low-day toggle vanished on exactly the days it
            served). Low is the low-capacity day; High is more room, never a target: it scales what
            "full" means, so the gauge and the Lighten offer move with the person, not against them.
            Resets to Normal each morning, so it can never become configuration debt. The visible
            overline is the same feedback: three bare words with no header read as lost text. */}
        {loaded && !isClosed && (
          <View>
          <Text style={styles.energyOverline}>{t('today.energyOverline')}</Text>
          <View
            style={styles.energyRow}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('today.energyTitleA11y')}
          >
            {(['low', 'normal', 'high'] as const).map((lvl) => {
              const on = dayEnergy === lvl;
              const label =
                lvl === 'low' ? t('today.energyPillLow') : lvl === 'high' ? t('today.energyPillHigh') : t('today.energyPillNormal');
              return (
                <Pressable
                  key={lvl}
                  onPress={() => setEnergy(lvl)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={label}
                  hitSlop={6}
                  style={({ pressed }) => [styles.energyPill, on && styles.energyPillOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.energyPillText, on && styles.energyPillTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
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
                accessibilityLabel={t('closeDay.artAlt')}
              />
            </View>
            <Text style={styles.restedTitle}>{t('closeDay.restedTitle')}</Text>
            <Text style={styles.restedLine}>
              {todayDone.length > 0
                ? fmt.plural(todayDone.length, { one: t('closeDay.restedFinishedOne'), other: t('closeDay.restedFinishedOther') })
                : t('closeDay.restedQuiet')}
            </Text>
            <Text style={styles.restedSub}>{t('closeDay.restedSub')}</Text>
            {/* The calm forward view's door (Path C, 2026-07-24): a COUNT, never a list. Closing the
                day means setting it down, so the future is one quiet reassurance ("your captures are
                safe") with an opt-in peek via the Lookback, not tomorrow's weight re-loaded here. */}
            {upcoming.length > 0 && (
              <Pressable
                onPress={() => router.push('/lookback')}
                accessibilityRole="button"
                accessibilityLabel={t('closeDay.waitingAheadA11y')}
                hitSlop={8}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.restedWaiting}>
                  {fmt.plural(upcoming.length, { one: t('closeDay.waitingAheadOne'), other: t('closeDay.waitingAheadOther', { count: upcoming.length }) })}
                </Text>
              </Pressable>
            )}
            <BedtimeCapture onCapture={capture} today={today} />
            <Pressable
              onPress={reopenDay}
              accessibilityRole="button"
              accessibilityLabel={t('closeDay.reopen')}
              hitSlop={8}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.restedReopen}>{t('closeDay.reopen')}</Text>
            </Pressable>
            {/* At most ONE lifeline offer, ever, decided by the pure `restedOffer` rules: the app is
                so calm that its own opt-in lifelines are invisible (a returning user asked for four
                things that already existed), but the goodnight screen must never become a pitch. */}
            {restedOffer({ reminderOn, reminderOfferMade, widgetSupported: WIDGETS_SUPPORTED, widgetPlaced, widgetOfferMade, aiEnabled, weekFinishes, scrapbookMade, scrapbookOfferMade }) === 'reminder' && (
              <View style={styles.reminderOffer}>
                <Text style={styles.reminderOfferText}>{t('reminders.offerText')}</Text>
                <View style={styles.reminderOfferRow}>
                  <Pressable onPress={acceptReminderOffer} accessibilityRole="button" accessibilityLabel={t('reminders.offerYesA11y')} hitSlop={6}>
                    <Text style={styles.reminderOfferYes}>{t('reminders.offerYes')}</Text>
                  </Pressable>
                  <Pressable onPress={dismissReminderOffer} accessibilityRole="button" accessibilityLabel={t('common.notNow')} hitSlop={6}>
                    <Text style={styles.reminderOfferNo}>{t('common.notNow')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {restedOffer({ reminderOn, reminderOfferMade, widgetSupported: WIDGETS_SUPPORTED, widgetPlaced, widgetOfferMade, aiEnabled, weekFinishes, scrapbookMade, scrapbookOfferMade }) === 'widget' && (
              <View style={styles.reminderOffer}>
                {widgetHowShown ? (
                  <Text style={styles.reminderOfferText}>{t('reminders.widgetOfferHow')}</Text>
                ) : (
                  <>
                    <Text style={styles.reminderOfferText}>{t('reminders.widgetOfferText')}</Text>
                    <View style={styles.reminderOfferRow}>
                      <Pressable onPress={acceptWidgetOffer} accessibilityRole="button" accessibilityLabel={t('reminders.widgetOfferYesA11y')} hitSlop={6}>
                        <Text style={styles.reminderOfferYes}>{t('reminders.widgetOfferYes')}</Text>
                      </Pressable>
                      <Pressable onPress={dismissWidgetOffer} accessibilityRole="button" accessibilityLabel={t('common.notNow')} hitSlop={6}>
                        <Text style={styles.reminderOfferNo}>{t('common.notNow')}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}
            {restedOffer({ reminderOn, reminderOfferMade, widgetSupported: WIDGETS_SUPPORTED, widgetPlaced, widgetOfferMade, aiEnabled, weekFinishes, scrapbookMade, scrapbookOfferMade }) === 'scrapbook' && (
              <View style={styles.reminderOffer}>
                <Text style={styles.reminderOfferText}>{t('today.scrapbookOffer')}</Text>
                <View style={styles.reminderOfferRow}>
                  <Pressable onPress={acceptScrapbookOffer} accessibilityRole="button" accessibilityLabel={t('today.scrapbookOfferGo')} hitSlop={6}>
                    <Text style={styles.reminderOfferYes}>{t('today.scrapbookOfferGo')}</Text>
                  </Pressable>
                  <Pressable onPress={dismissScrapbookOffer} accessibilityRole="button" accessibilityLabel={t('common.notNow')} hitSlop={6}>
                    <Text style={styles.reminderOfferNo}>{t('common.notNow')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {!isClosed && (
          <>
        {/* Focus's standalone entry is GONE from above the list (the constant frame): it now lives
            in the fixed action layer at the thumb, as the 11:00-17:00 occupant and always in the
            caret panel. Energy matching stays INSIDE Focus mode's "Which one?" picker (Melroy's
            call, launch week): choosing what to focus on is the moment the question makes sense. */}
        {/* What's New: content-keyed (never build-keyed), shown once per announcement id, a calm
            dismissible card in the hold-hint's shape. NEVER a modal: a launch popup would steal
            the open-to-capture moment. Fresh installs never see it (onboarding stamps the id). */}
        {showWhatsNew && (
          <View style={styles.holdHint}>
            <View style={styles.whatsNewBody}>
              <Text style={styles.whatsNewTitle}>{t(WHATS_NEW.titleKey)}</Text>
              {WHATS_NEW.lineKeys.map((k) => (
                <Text key={k} style={styles.holdHintText}>
                  {t(k)}
                </Text>
              ))}
            </View>
            <Pressable onPress={dismissWhatsNew} accessibilityRole="button" accessibilityLabel={t('common.gotIt')} hitSlop={8}>
              <Text style={styles.holdHintDismiss}>{t('common.gotIt')}</Text>
            </Pressable>
          </View>
        )}
        {!holdHintSeen && visible.length > 0 && (
          // The long-press is the only door to half the app (pin / remind / combine / make-it-tiny / bulk).
          // A one-time, dismissible coachmark teaches it, so a first-timer never misses the rescue tools.
          <Pressable
            onPress={() => {
              setHoldHintSeen(true);
              void saveHoldHintSeen();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('today.holdHintDismissA11y')}
            style={styles.holdHint}
          >
            {theme.appearance === 'quiet' && <View style={styles.holdHintDot} />}
            <Text style={styles.holdHintText}>{aiEnabled ? t('today.holdHint') : t('today.holdHintNoAi')}</Text>
            <Text style={styles.holdHintDismiss}>{t('common.gotIt')}</Text>
          </Pressable>
        )}
        <View style={styles.list}>
          {visible.map((task, i) => (
            <TaskRow
              key={task.id}
              title={task.title}
              done={isDoneOn(task, today)}
              onToggle={() => toggle(task.id)}
              onLongPress={() => onRowLongPress(task.id)}
              confirming={confirmingId === task.id}
              onRemove={() => removeTask(task.id)}
              onKeep={() => setConfirmingId(null)}
              recurring={isRecurring(task)}
              /* Reorder eligibility: never on a done task, never on the pinned task (pinFirst
                 refloats it, the tap would look dead), and "up" stops below a pinned top. */
              onMoveUp={canReorder(task, today) && i > reorderTopIdx ? () => moveRow(task.id, -1) : undefined}
              onMoveDown={canReorder(task, today) && i < visible.length - 1 ? () => moveRow(task.id, 1) : undefined}
              slices={task.slices ?? undefined}
              onAdvance={() => step(task.id, 1)}
              onRetreat={() => step(task.id, -1)}
              onBreakdown={aiEnabled ? () => breakdownExisting(task.title, task.id) : () => openManualBreakdown(task.id, task.title)}
              onMakeTiny={aiEnabled ? () => makeTiny(task.id, task.title) : undefined}
              onDefer={() => deferTask(task.id)}
              onBig={() => bigRow(task)}
              onPin={() => pinRow(task)}
              onSelectMore={() => selectFromRow(task.id)}
              onRename={(title) => renameRow(task.id, title)}
              onNudge={Platform.OS !== 'web' && !isDoneOn(task, today) ? () => openNudge(task.id) : undefined}
              onSteps={!isRecurring(task) && !isDoneOn(task, today) ? () => openSliceEdit(task.id) : undefined}
              onMoveTo={!isRecurring(task) ? () => setMoveIds([task.id]) : undefined}
              onDoneOn={isDoneOn(task, today) && !isRecurring(task) ? () => openDoneOn(task.id) : undefined}
              pinDim={!premium && task.pinnedAt == null}
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
                accessibilityLabel={t('today.emptyArtAlt')}
              />
            </View>
            <Text style={[styles.calmNote, styles.emptyNote]}>{t('today.emptyNote')}</Text>
          </View>
        )}
        {allDone && <Text style={styles.calmNote}>{t('today.allDoneNote')}</Text>}

        {loaded && !selectMode && (
          <Pressable
            onPress={() => setDidOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('today.alsoDidA11y')}
            hitSlop={6}
            style={({ pressed }) => [styles.alsoDidUnderList, pressed && styles.pressed]}
          >
            <Text style={styles.alsoDidLink}>{t('today.alsoDidThat')}</Text>
          </Pressable>
        )}

        {upcoming.length > 0 && (
          <View style={styles.later}>
            <Text style={styles.laterHeading}>{t('today.laterHeading')}</Text>
            {upcoming.map((task, i) => (
              <View key={task.id} style={styles.laterItem}>
                {(i === 0 || upcoming[i - 1].due !== task.due) && task.due && (
                  <Text style={styles.laterDate}>{friendlyDate(task.due, today)}</Text>
                )}
                {/* A Later task holds into the SAME card as a Today one, which is a net gain: the old
                    bar's single-task actions searched only Today, so they were already silently dead
                    here. Move to… is the honest way to re-date it. No Tomorrow (an ambiguous pull
                    backward on a future task), no Remind me (the presets are today-shaped), no Pin
                    (Today-only by design). */}
                <TaskRow
                  title={task.title}
                  done={isDoneOn(task, today)}
                  onToggle={() => toggle(task.id)}
                  onLongPress={() => onRowLongPress(task.id)}
                  confirming={confirmingId === task.id}
                  onRemove={() => removeTask(task.id)}
                  onKeep={() => setConfirmingId(null)}
                  recurring={isRecurring(task)}
                  slices={task.slices ?? undefined}
                  onAdvance={() => step(task.id, 1)}
                  onRetreat={() => step(task.id, -1)}
                  onBreakdown={aiEnabled ? () => breakdownExisting(task.title, task.id) : () => openManualBreakdown(task.id, task.title)}
                  onMakeTiny={aiEnabled ? () => makeTiny(task.id, task.title) : undefined}
                  onBig={() => bigRow(task)}
                  onSelectMore={() => selectFromRow(task.id)}
                  onRename={(title) => renameRow(task.id, title)}
                  onSteps={!isRecurring(task) ? () => openSliceEdit(task.id) : undefined}
                  onMoveTo={!isRecurring(task) ? () => setMoveIds([task.id]) : undefined}
                  selecting={selectMode}
                  selected={selected.includes(task.id)}
                  onSelect={() => toggleSelect(task.id)}
                  big={task.big}
                />
              </View>
            ))}
          </View>
        )}
        {/* The stacked action pile ("Today's looking full" + Lighten + Plan + wind-down + Close) is
            GONE (the constant frame, 2026-07-25). All four day tools now live in ONE fixed layer at
            the thumb, outside this ScrollView, so nothing appears, vanishes, or slides with the
            task count and the emotional payoff (Close the day) is never buried under a long list. */}
          </>
        )}
      </ScrollView>

      {/* The caret panel's scrim: the list dims at 40% and never moves; tapping it closes. Rendered
          BEFORE the footer so the footer (and the panel inside it) stays on top by sibling order. */}
      {toolsOpen && (
        <Pressable
          style={styles.toolsScrim}
          onPress={closeToolsPanel}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
      )}

      {/* While capture is open the footer lifts by the keyboard's height, so the panel rides
          ABOVE the keyboard instead of vanishing under it (edge-to-edge Android never resizes
          the window for us). iOS reports a height that includes the home-indicator strip the
          padding already covers, so that part is subtracted there. Scoped to captureOpen: the
          held card's inline edit and the modals manage their own keyboards. */}
      <View style={[styles.footer, dockFooter && styles.footerDock, { paddingBottom: insets.bottom + (captureOpen ? spacing.one : spacing.four) + (captureOpen ? Math.max(0, kbHeight - (Platform.OS === 'ios' ? insets.bottom : 0)) : 0) }]}>
        {/* THE CONSTANT FRAME (Claude Design 1b-developed, Melroy's pick 2026-07-25). One fixed
            action layer at the thumb: a "Right now" slot holding the tool that suits the HOUR
            (clock only, resolved at open, never mid-session), and a caret opening the same tools in
            the same day order, always. An unavailable tool keeps its place at lowered contrast and
            explains itself in one plain line when tapped: never absent, never locked. This is what
            lets muscle memory form on a screen that used to reshape itself with the task count.
            While the capture panel is open the slot YIELDS (the capture redesign's one frame
            exception): the person is mid-thought, and the frame returns the moment capture closes. */}
        {loaded && !selectMode && !isClosed && !captureOpen && (
          <>
            {toolsOpen && (
              <View style={styles.toolsPanel}>
                {frameTools.map((tool) => {
                  const gate = gateFor(tool);
                  const busy = (tool === 'lighten' && strategising) || (tool === 'plan' && sequencing);
                  return (
                    <View key={tool}>
                      <Pressable
                        onPress={() => runTool(tool)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy }}
                        accessibilityLabel={gate.available || gate.hintKey == null ? toolLabel(tool) : `${toolLabel(tool)}. ${t(gate.hintKey)}`}
                        style={({ pressed }) => [styles.toolRow, pressed && styles.pressed]}
                      >
                        <Text style={[styles.toolName, !gate.available && styles.toolNameQuiet]}>
                          {busy ? (tool === 'plan' ? t('today.planning') : t('today.lightening')) : toolLabel(tool)}
                        </Text>
                        {tool === occupant && <Text style={styles.toolNowTag}>{t('today.toolNow')}</Text>}
                      </Pressable>
                      {toolHint === tool && gate.hintKey != null && (
                        <Text style={styles.toolHintLine}>{t(gate.hintKey)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            <View style={styles.rightNowRow}>
              <Pressable
                onPress={() => runTool(occupant)}
                disabled={(occupant === 'plan' && sequencing) || (occupant === 'lighten' && strategising)}
                accessibilityRole="button"
                accessibilityLabel={`${t('today.rightNow')}: ${toolLabel(occupant)}`}
                style={({ pressed }) => [styles.rightNowSlot, pressed && styles.pressed]}
              >
                <Text style={styles.rightNowOverline}>{t('today.rightNow')}</Text>
                <Text style={[styles.rightNowName, !gateFor(occupant).available && styles.toolNameQuiet]}>
                  {occupant === 'plan' && sequencing
                    ? t('today.planning')
                    : occupant === 'lighten' && strategising
                      ? t('today.lightening')
                      : toolLabel(occupant)}
                </Text>
              </Pressable>
              <Pressable
                onPress={toggleToolsPanel}
                accessibilityRole="button"
                accessibilityState={{ expanded: toolsOpen }}
                accessibilityLabel={t('today.allDayToolsA11y')}
                style={({ pressed }) => [styles.caretBtn, pressed && styles.pressed]}
              >
                <Text style={styles.caretText}>{toolsOpen ? '⌄' : '⌃'}</Text>
              </Pressable>
            </View>
            {toolHint != null && !toolsOpen && gateFor(toolHint).hintKey != null && (
              <Text style={styles.toolHintLine}>{t(gateFor(toolHint).hintKey!)}</Text>
            )}
            {strategiseError != null && <Text style={styles.strategiseErr}>{strategiseError}</Text>}
            {orderError != null && <Text style={styles.strategiseErr}>{orderError}</Text>}
          </>
        )}
        {/* The capture panel stays MOUNTED while hidden (display none, not unmount) so typed
            text survives a collapse: the capture iron rule that text is never lost. The panel's
            own Close resets the door to Today · no repeat · no steps but keeps the words. */}
        <View style={[styles.capturePanel, (!captureOpen || selectMode || isClosed) && styles.capturePanelHidden]}>
          <BrainDump
            ref={attachBrainDump}
            onCapture={capture}
            onBiteElephant={biteElephant}
            onSort={sortDump}
            onClose={() => setCaptureOpen(false)}
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
        {selectMode ? (
          /* The select shelf (design congruency pass): a card in the held-card-v2 family.
             GENUINELY BULK, and nothing else: every single-task action lives on the held card.
             Fixed anatomy in every state (count+Select all, the verb row, Combine's PERMANENTLY
             reserved slot, the shelf), so the bar never changes height mid-selection. */
          <Animated.View
            style={[
              styles.selectShelfCard,
              { opacity: shelfRise, transform: [{ translateY: reduced ? 0 : shelfRise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
            ]}
          >
            <View style={styles.selectTop}>
              <Text style={selected.length === 0 ? styles.selectHintText : styles.selectCount}>
                {selected.length === 0 ? t('today.selectHint') : t('today.selectedCount', { count: selected.length })}
              </Text>
              {/* Select all wears the rail grammar (bordered = act-and-stay), dimming in place
                  once everything is selected rather than vanishing. */}
              <Pressable
                onPress={() => setSelected(spreadable.map((x) => x.id))}
                disabled={allSelected}
                accessibilityRole="button"
                accessibilityState={{ disabled: allSelected }}
                accessibilityLabel={allSelected ? t('today.selectAllUnavailA11y') : t('today.selectAllA11y')}
                style={[styles.selectAllPill, allSelected && styles.selectRowOff]}
                hitSlop={6}
              >
                <Text style={[styles.selectAllPillText, allSelected && styles.selectDimText]}>{t('today.selectAll')}</Text>
              </Pressable>
            </View>
            <View style={[styles.selectVerbRow, selected.length === 0 && styles.selectRowOff]}>
              <Pressable onPress={bulkComplete} disabled={selected.length === 0} accessibilityRole="button" accessibilityLabel={t('today.markSelectedDoneA11y')} hitSlop={6} style={styles.selectVerb}>
                <Text style={styles.selectDone}>{t('common.done')}</Text>
              </Pressable>
              <Pressable onPress={() => setMoveIds(selected)} disabled={selected.length === 0} accessibilityRole="button" accessibilityLabel={t('today.moveSelectedA11y')} hitSlop={6} style={styles.selectVerb}>
                <Text style={styles.selectAction}>{t('today.moveTo')}</Text>
              </Pressable>
              <Pressable onPress={() => markBig(selected, !allBig)} disabled={selected.length === 0} accessibilityRole="button" accessibilityLabel={allBig ? t('today.unmarkBigA11y') : t('today.markBigA11y')} hitSlop={6} style={styles.selectVerb}>
                <Text style={styles.selectAction}>{allBig ? t('today.notALot') : t('today.markAsALot')}</Text>
              </Pressable>
            </View>
            {/* Combine, the surface's one tinted hero, in a slot reserved in EVERY state: eligible
                it fades in; ineligible the slot rests as breathing room above the shelf. */}
            <View style={styles.combineSlot}>
              {combineEligible && (
                <Animated.View style={{ opacity: combineFade }}>
                  <Pressable onPress={() => void openCombine()} accessibilityRole="button" accessibilityLabel={t('today.combineA11y')} hitSlop={6} style={styles.combineHero}>
                    <Text style={styles.combineHeroLabel}>{t('today.combine')}</Text>
                    <Text style={styles.combineHeroSub}>{t('today.combineSub')}</Text>
                  </Pressable>
                </Animated.View>
              )}
            </View>
            {/* The shelf: Cancel in Close's seat, Remove far away. A lone repeating selection
                names its true, kinder consequence in two lines. */}
            <View style={styles.selectShelf}>
              <Pressable onPress={exitSelect} accessibilityRole="button" accessibilityLabel={t('today.cancelSelectionA11y')} hitSlop={6}>
                <Text style={styles.selectCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={bulkRemove}
                disabled={selected.length === 0}
                accessibilityRole="button"
                accessibilityLabel={
                  onlyTask && isRecurring(onlyTask)
                    ? t('repeat.skipTodayA11y', { title: onlyTask.title })
                    : t('today.removeCountA11y', { count: String(selected.length) })
                }
                hitSlop={6}
                style={selected.length === 0 ? styles.selectRowOff : undefined}
              >
                {onlyTask && isRecurring(onlyTask) ? (
                  <View style={styles.removeStack}>
                    <Text style={styles.selectRemove}>{t('repeat.skipToday')}</Text>
                    <Text style={styles.seriesContinues}>{t('today.seriesContinues')}</Text>
                  </View>
                ) : (
                  <Text style={styles.selectRemove}>{t('common.remove')}</Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <>
        {!isClosed && sortSummary && <Text style={styles.sortSummary}>{sortSummary}</Text>}
        {!isClosed && affirmation && <Text style={styles.affirmation}>{affirmation}</Text>}
        {!isClosed && !captureOpen && (
          <Pressable
            onPress={() => setCaptureOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('capture.addA11y')}
            style={({ pressed }) => [styles.addBar, pressed && styles.pressed]}
          >
            <Text style={styles.focusEntryText}>{t('today.addToToday')}</Text>
          </Pressable>
        )}
        {/* With the keyboard up over an open capture, the space above it belongs to the panel:
            the inscription and the footer links tuck away until the keyboard goes. */}
        {!(captureOpen && kbHeight > 0) && (
        <>
        <View style={styles.ethos}>
          {/* In the evening the rotating inscription yields to the wind-down line: the same single
              italic breath under capture, saying the one thing the hour actually calls for. It is
              no longer a separate element in the pile (the constant frame took the pile away). */}
          {windDown && !isClosed ? (
            <>
              <Text style={styles.windDown}>{t('closeDay.windDown')}</Text>
              {/* The Settle handoff's second door: one soft line on the evening surface. A
                  pressable sentence, not a button; the room is offered, never prescribed. */}
              <Pressable onPress={() => router.push('/settle')} accessibilityRole="button" accessibilityLabel={t('today.toolSettle')} hitSlop={8}>
                <Text style={styles.windDownSettle}>{t('today.windDownSettle')}</Text>
              </Pressable>
            </>
          ) : (
            <RotatingPhrase />
          )}
        </View>
        {/* The optional, low-priority links live below the marquee, calm and out of the way:
            who you're synced as (or the sync invite) and the daily-reminder toggle. */}
        <View style={styles.optionalLinks}>
          {isSyncConfigured &&
            (session ? (
              <>
                {syncOk === false ? (
                  <Text style={styles.optLink} numberOfLines={2}>
                    {t('today.syncPending')}
                  </Text>
                ) : (
                  <Text style={styles.optLink} numberOfLines={1}>
                    {t('today.syncedTo', { account: session.user.email ?? t('today.syncedFallbackAccount') })}
                  </Text>
                )}
                <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel={t('signIn.signOut')} hitSlop={6}>
                  <Text style={styles.optFaint}>{t('signIn.signOut')}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => router.push('/sign-in')} accessibilityRole="button" accessibilityLabel={t('signIn.syncAcrossDevices')} hitSlop={6}>
                <Text style={styles.optLink}>{t('signIn.syncAcrossDevices')}</Text>
              </Pressable>
            ))}
          <Pressable onPress={toggleReminder} accessibilityRole="button" accessibilityLabel={t('reminders.toggleA11y')} hitSlop={6}>
            <Text style={styles.optLink}>{reminderOn ? t('reminders.dailyOn') : t('reminders.turnOn')}</Text>
          </Pressable>
        </View>
        </>
        )}
          </>
        )}
      </View>

      <Modal visible={focusOpen} animationType="fade" onRequestClose={closeFocus}>
        <View style={styles.focusScreen}>
          {/* The content SCROLLS, the Exit button does not. The Exit is rendered AFTER this
              ScrollView (bottom of the modal), because stacking follows sibling order: when the
              scroll fix made the picker a full-bleed ScrollView, an Exit rendered BEFORE it sat
              UNDERNEATH the scroll surface and every click landed on the scroller instead, so Focus
              could not be left by mouse at all (Melroy, on web, 2026-07-25). The fix that freed the
              clipped list buried the door; order plus zIndex now keeps the door on top. */}
          <ScrollView contentContainerStyle={styles.focusScrollContent} showsVerticalScrollIndicator={false}>
          {focusTask ? (
            <View style={styles.focusBody}>
              <Text style={styles.focusLabel}>{t('today.focusLabel')}</Text>
              <Text style={styles.focusTitle}>{focusTask.title}</Text>
              {focusTask.slices ? (
                <Text style={styles.focusStep}>
                  {t('today.focusStepOf', { step: Math.min(focusTask.slices.done + 1, focusTask.slices.total), total: focusTask.slices.total })}
                </Text>
              ) : null}
              <View style={styles.focusActions}>
                <Pressable
                  onPress={() => setFocusPick(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('today.focusChooseAnother')}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Text style={styles.focusSkipText}>{t('today.focusChooseAnother')}</Text>
                </Pressable>
                <PrimaryButton
                  label={t('common.done')}
                  onPress={() => focusComplete(focusTask.id)}
                  accessibilityLabel={t('today.focusDoneA11y', { title: focusTask.title })}
                />
              </View>
            </View>
          ) : spreadable.length > 0 ? (
            <View style={styles.focusBody}>
              <Text style={styles.focusLabel}>{t('today.focusLabel')}</Text>
              <Text style={styles.focusTitle}>{t('today.focusWhichOne')}</Text>
              <View style={styles.focusPickList}>
                {aiEnabled && spreadable.length >= 2 && (
                  <Pressable
                    onPress={openEnergy}
                    accessibilityRole="button"
                    accessibilityLabel={t('today.energyEntryA11y')}
                    style={({ pressed }) => [styles.focusFitEntry, pressed && styles.pressed]}
                  >
                    <Text style={styles.focusFitText}>{t('today.energyEntry')}</Text>
                  </Pressable>
                )}
                {spreadable.map((task) => (
                  <Pressable
                    key={task.id}
                    onPress={() => setFocusPick(task.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('today.focusOnTaskA11y', { title: task.title })}
                    style={({ pressed }) => [styles.focusPickItem, pressed && styles.pressed]}
                  >
                    <Text style={styles.focusPickItemText}>{task.title}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.focusBody}>
              <Text style={styles.focusTitle}>{t('today.focusAllDone')}</Text>
              <Text style={styles.focusEmptyNote}>{t('today.focusEmptyNote')}</Text>
              <PrimaryButton label={t('common.backToToday')} onPress={closeFocus} accessibilityLabel={t('common.backToToday')} />
            </View>
          )}
          </ScrollView>
          <Pressable
            onPress={closeFocus}
            accessibilityRole="button"
            accessibilityLabel={t('today.focusExitA11y')}
            hitSlop={10}
            style={({ pressed }) => [styles.focusExit, pressed && styles.pressed]}
          >
            <Text style={styles.focusExitText}>{t('today.focusExit')}</Text>
          </Pressable>
        </View>
      </Modal>

      <ModalCard visible={didOpen} onClose={() => setDidOpen(false)}>
            <Text style={styles.didTitle}>{t('today.didTitle')}</Text>
            <Text style={styles.didHint}>{t('today.didHint')}</Text>
            <TextInput
              style={styles.didInput}
              value={didText}
              onChangeText={setDidText}
              placeholder={t('today.didPlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => logDidIt(didText)}
              accessibilityLabel={t('today.didInputA11y')}
            />
            <View style={styles.didActions}>
              <Pressable
                onPress={() => {
                  setDidText('');
                  setDidOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                hitSlop={8}
              >
                <Text style={styles.didCancel}>{t('common.cancel')}</Text>
              </Pressable>
              <PrimaryButton label={t('today.didAdd')} onPress={() => logDidIt(didText)} accessibilityLabel={t('today.didAdd')} />
            </View>
      </ModalCard>

      <ModalCard visible={combineOpen} onClose={() => setCombineOpen(false)}>
            <Text style={styles.didTitle}>{t('today.combineModalTitle')}</Text>
            <Text style={styles.didHint}>
              {t('today.combineHint', { count: beingCombined.length })}
            </Text>
            <TextInput
              style={styles.didInput}
              value={combineTitle}
              onChangeText={setCombineTitle}
              placeholder={t('today.combinePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              returnKeyType="done"
              onSubmitEditing={combineAccept}
              accessibilityLabel={t('today.combineInputA11y')}
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
                accessibilityLabel={t('common.cancel')}
                hitSlop={8}
              >
                <Text style={styles.didCancel}>{t('common.cancel')}</Text>
              </Pressable>
              <PrimaryButton
                label={t('today.combine')}
                onPress={combineAccept}
                disabled={!combineTitle.trim()}
                accessibilityLabel={t('today.combineConfirmA11y')}
              />
            </View>
      </ModalCard>

      <ModalCard visible={manualBdOpen} onClose={closeManualBreakdown}>
            <Text style={styles.didTitle}>{t('breakdown.manualTitle')}</Text>
            <Text style={styles.didHint}>
              {t('breakdown.manualHint', { title: manualBdTitle })}
            </Text>
            <TextInput
              style={styles.manualBdInput}
              value={manualBdText}
              onChangeText={setManualBdText}
              placeholder={t('breakdown.manualPlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              multiline
              accessibilityLabel={t('breakdown.manualInputA11y')}
            />
            <View style={styles.didActions}>
              <Pressable onPress={closeManualBreakdown} accessibilityRole="button" accessibilityLabel={t('common.notNow')} hitSlop={8}>
                <Text style={styles.didCancel}>{t('common.notNow')}</Text>
              </Pressable>
              <PrimaryButton
                label={t('actions.breakItDown')}
                onPress={manualBreakdownSubmit}
                disabled={manualBdText.trim().length === 0}
                accessibilityLabel={t('breakdown.manualSubmitA11y')}
              />
            </View>
      </ModalCard>

      <ModalCard visible={moveIds != null} onClose={() => setMoveIds(null)}>
            <Text style={styles.didTitle}>{t('today.moveTo')}</Text>
            <Text style={styles.didHint}>
              {fmt.plural(moveIds?.length ?? 0, { one: t('today.moveToHintOne'), other: t('today.moveToHintOther') })}
            </Text>
            <View style={styles.moveToPresets}>
              <Pressable
                onPress={() => bulkMoveTo(toISODate(today))}
                style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('common.today')}
              >
                <Text style={styles.moveChipText}>{t('common.today')}</Text>
              </Pressable>
              {/* Tomorrow: the common push kept one tap here, since the held card dropped its standalone
                  Tomorrow to reduce density (design 1a). Same semantics as the old card action. */}
              <Pressable
                onPress={() => bulkMoveTo(addDaysISO(today, 1))}
                style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('common.tomorrow')}
              >
                <Text style={styles.moveChipText}>{t('common.tomorrow')}</Text>
              </Pressable>
              <Pressable
                onPress={() => bulkMoveTo(presetDate(today, 'thisWeekend'))}
                style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('today.thisWeekend')}
              >
                <Text style={styles.moveChipText}>{t('today.thisWeekend')}</Text>
              </Pressable>
              <Pressable
                onPress={() => bulkMoveTo(presetDate(today, 'nextWeek'))}
                style={({ pressed }) => [styles.moveChip, pressed && styles.pressed]} hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('today.nextWeek')}
              >
                <Text style={styles.moveChipText}>{t('today.nextWeek')}</Text>
              </Pressable>
            </View>
            <DatePicker value={null} onChange={(iso) => bulkMoveTo(iso)} today={today} />
            <Pressable
              onPress={() => setMoveIds(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              hitSlop={8}
              style={styles.moveCancelWrap}
            >
              <Text style={styles.didCancel}>{t('common.cancel')}</Text>
            </Pressable>
      </ModalCard>

      {/* "Done on…": pick the earlier day a rolled-over task was actually finished (yesterday back to
          14 days; never today, since today is the normal tap). Quiet bookkeeping, so no bloom. */}
      <ModalCard visible={doneOnId != null} onClose={() => setDoneOnId(null)}>
            <Text style={styles.didTitle}>{t('today.doneOnTitle')}</Text>
            <DatePicker
              value={null}
              onChange={pickDoneOn}
              today={today}
              minIso={addDaysISO(today, -14)}
              maxIso={addDaysISO(today, -1)}
            />
            <Pressable
              onPress={() => setDoneOnId(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              hitSlop={8}
              style={styles.moveCancelWrap}
            >
              <Text style={styles.didCancel}>{t('common.cancel')}</Text>
            </Pressable>
      </ModalCard>

      <ModalCard visible={nudgeOpen} onClose={() => { setNudgeOpen(false); setNudgeId(null); }}>
            <Text style={styles.didTitle}>{t('reminders.nudgeTitle')}</Text>
            <Text style={styles.didHint}>{t('reminders.nudgeHint')}</Text>
            {nudgePresets.length === 0 ? (
              <Text style={styles.didHint}>{t('reminders.nudgeTooLate')}</Text>
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
              onPress={() => { setNudgeOpen(false); setNudgeId(null); }}
              accessibilityRole="button"
              accessibilityLabel={t('common.notNow')}
              hitSlop={8}
              style={styles.moveCancelWrap}
            >
              <Text style={styles.didCancel}>{t('common.notNow')}</Text>
            </Pressable>
      </ModalCard>

      <ModalCard visible={sliceEditOpen} onClose={() => setSliceEditOpen(false)}>
            <Text style={styles.didTitle}>{t('today.sliceTitle')}</Text>
            <Text style={styles.didHint}>{t('today.sliceHint')}</Text>
            <View style={styles.sliceEditStepper}>
              <Pressable
                onPress={() => setSliceEditCount((n) => Math.max(MIN_SLICES, n - 1))}
                disabled={sliceEditCount <= MIN_SLICES}
                accessibilityRole="button"
                accessibilityLabel={t('today.fewerStepsA11y')}
                hitSlop={8}
                style={({ pressed }) => [styles.sliceStepBtn, sliceEditCount <= MIN_SLICES && styles.sliceStepBtnOff, pressed && styles.pressed]}
              >
                <Text style={styles.sliceStepGlyph}>−</Text>
              </Pressable>
              <Text style={styles.sliceStepValue} accessibilityLabel={t('today.stepsCount', { count: sliceEditCount })}>
                {t('today.stepsCount', { count: sliceEditCount })}
              </Text>
              <Pressable
                onPress={() => setSliceEditCount((n) => Math.min(MAX_SLICES, n + 1))}
                disabled={sliceEditCount >= MAX_SLICES}
                accessibilityRole="button"
                accessibilityLabel={t('today.moreStepsA11y')}
                hitSlop={8}
                style={({ pressed }) => [styles.sliceStepBtn, sliceEditCount >= MAX_SLICES && styles.sliceStepBtnOff, pressed && styles.pressed]}
              >
                <Text style={styles.sliceStepGlyph}>+</Text>
              </Pressable>
            </View>
            <PrimaryButton label={t('common.done')} onPress={confirmSliceEdit} accessibilityLabel={t('today.saveStepsA11y')} />
            {sliceEditId != null && tasks.find((t) => t.id === sliceEditId)?.slices != null && (
              <Pressable
                onPress={makeWhole}
                accessibilityRole="button"
                accessibilityLabel={t('today.makeWholeA11y')}
                hitSlop={8}
                style={styles.moveCancelWrap}
              >
                <Text style={styles.didCancel}>{t('today.makeWhole')}</Text>
              </Pressable>
            )}
      </ModalCard>

      <Modal visible={closing} transparent animationType="fade" onRequestClose={() => setClosing(false)}>
        <View style={styles.closeRoot}>
          {/* The scrim is a SIBLING of the card (an absolute-fill dismiss layer behind it), so the card's
              buttons are never nested inside the scrim <button> (invalid HTML on web). */}
          <Pressable style={styles.backdrop} onPress={() => setClosing(false)} accessibilityRole="button" accessibilityLabel={t('common.dismiss')} />
          <Animated.View
            style={[
              styles.wrapAnim,
              {
                opacity: closeRise,
                transform: [{ translateY: closeRise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              },
            ]}
          >
            <View style={[styles.wrapCard, { maxHeight: winH * 0.9 }]}>
              <View style={styles.wrapArt}>
                <Image
                  source={closeDayArt}
                  style={styles.artFill}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  accessible
                  accessibilityLabel={t('closeDay.artAlt')}
                />
              </View>
              <Text style={styles.wrapTitle}>{t('closeDay.wrapTitle')}</Text>
              {todayDone.length > 0 ? (
                <>
                  <Text style={styles.wrapLine}>
                    {todayDone.some((c) => c.big)
                      ? fmt.plural(todayDone.length, { one: t('closeDay.finishedWithBigOne'), other: t('closeDay.finishedWithBigOther') })
                      : fmt.plural(todayDone.length, { one: t('closeDay.finishedPlainOne'), other: t('closeDay.finishedPlainOther') })}
                  </Text>
                  {/* Scrollable + flex-shrinking: a long finished day (16+ done) used to push the
                      goodnight button off-screen with no way to proceed. The card is capped to the
                      viewport (maxHeight above); this list shrinks to the space that remains and
                      scrolls inside it, so the roll-forward line, note, and button stay pinned and
                      reachable no matter how many things got done. */}
                  <ScrollView
                    style={[styles.wrapList, { flexShrink: 1 }]}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {todayDone.map((c) => (
                      <View key={c.id} style={styles.wrapItem}>
                        <Text style={styles.wrapCheck}>✓</Text>
                        <Text style={styles.wrapItemText}>{c.title}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <Text style={styles.wrapLine}>{t('closeDay.quietDay')}</Text>
              )}
              <Text style={styles.wrapRoll}>{t('closeDay.rollForward')}</Text>
              <Text style={styles.closeNoteLabel}>{t('closeDay.anythingElse')}</Text>
              <TextInput
                style={styles.didInput}
                value={closeNote}
                onChangeText={setCloseNote}
                placeholder={t('closeDay.notePlaceholder')}
                placeholderTextColor={theme.colors.inkFaint}
                returnKeyType="done"
                accessibilityLabel={t('closeDay.noteA11y')}
              />
              {(() => {
                const onGoodnight = () => {
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
                };
                // Quiet renders the close as a plain accent text link, matching the rest of
                // the borderless surface; Standard keeps the filled primary button.
                return theme.appearance === 'quiet' ? (
                  <Pressable
                    onPress={onGoodnight}
                    accessibilityRole="button"
                    accessibilityLabel={t('closeDay.goodnight')}
                    style={styles.wrapGoodnightQuiet}
                  >
                    <Text style={styles.wrapGoodnightQuietText}>{t('closeDay.goodnight')}</Text>
                  </Pressable>
                ) : (
                  <PrimaryButton
                    label={t('closeDay.goodnight')}
                    onPress={onGoodnight}
                    accessibilityLabel={t('closeDay.goodnight')}
                    style={styles.wrapBtn}
                  />
                );
              })()}
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Energy matching: one calm question, one pick, propose-only. The task title comes
          from the local list by id (the AI only ever returns an id we sent + a short line). */}
      <ModalCard visible={energyOpen} onClose={() => setEnergyOpen(false)}>
        {energyPick == null ? (
          <>
            <Text style={styles.wrapTitle}>{t('today.energyTitle')}</Text>
            <Text style={styles.wrapRoll}>{t('today.energyPrivacy')}</Text>
            {energyBusy ? (
              <Text style={styles.wrapLine}>{t('today.energyThinking')}</Text>
            ) : (
              <>
                {(
                  [
                    ['low', t('today.energyLow')],
                    ['medium', t('today.energyMedium')],
                    ['good', t('today.energyGood')],
                  ] as const
                ).map(([level, label]) => (
                  <Pressable
                    key={level}
                    onPress={() => void runEnergy(level)}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    style={({ pressed }) => [styles.energyChoice, pressed && styles.pressed]}
                  >
                    <Text style={styles.energyChoiceText}>{label}</Text>
                  </Pressable>
                ))}
              </>
            )}
            {energyErr != null && <Text style={styles.strategiseErr}>{energyErr}</Text>}
          </>
        ) : (
          <>
            <Text style={styles.wrapTitle}>{tasks.find((x) => x.id === energyPick.id)?.title ?? ''}</Text>
            {energyPick.line.length > 0 && <Text style={styles.wrapLine}>{energyPick.line}</Text>}
            {energyNote != null && <Text style={styles.wrapRoll}>{energyNote}</Text>}
            <PrimaryButton
              label={t('today.energyStart')}
              onPress={startEnergyPick}
              accessibilityLabel={t('today.energyStart')}
              style={styles.wrapBtn}
            />
            <Pressable onPress={() => setEnergyOpen(false)} accessibilityRole="button" accessibilityLabel={t('today.energyNotNow')} hitSlop={6}>
              <Text style={styles.energyNotNow}>{t('today.energyNotNow')}</Text>
            </Pressable>
          </>
        )}
      </ModalCard>

      <ModalCard visible={plan != null} onClose={() => setPlan(null)}>
            <Text style={styles.wrapTitle}>{t('today.spreadTitle')}</Text>
            <Text style={styles.wrapLine}>{t('today.spreadLine')}</Text>
            <View style={styles.wrapList}>
              {(plan ?? []).map((p) => {
                const task = tasks.find((x) => x.id === p.id);
                if (!task) return null;
                const when = p.dayOffset <= 0 ? t('common.today') : p.dayOffset === 1 ? t('common.tomorrow') : t('today.inDays', { days: p.dayOffset });
                return (
                  <View key={p.id} style={styles.planItem}>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Text style={styles.planWhen}>{when}</Text>
                  </View>
                );
              })}
            </View>
            <PrimaryButton
              label={t('today.useSpread')}
              onPress={acceptPlan}
              accessibilityLabel={t('today.useSpread')}
              style={styles.wrapBtn}
            />
            <Pressable onPress={() => setPlan(null)} accessibilityRole="button" accessibilityLabel={t('common.notNow')}>
              <Text style={styles.planDismiss}>{t('common.notNow')}</Text>
            </Pressable>
      </ModalCard>

      {/* The ask, before the sort. Three optional questions about the day the person is actually
          having, so the order fits it. No question is required and none has a default: skipping
          simply sends nothing, and the sort behaves exactly as it always did. */}
      <ModalCard visible={planAskOpen} onClose={() => setPlanAskOpen(false)}>
        <Text style={styles.wrapTitle}>{t('today.planAskTitle')}</Text>
        <Text style={styles.wrapRoll}>{t('today.planAskHint')}</Text>
        {(
          [
            ['planAskEnergy', 'energy', [['low', 'today.energyLow'], ['medium', 'today.energyMedium'], ['good', 'today.energyGood']]],
            ['planAskDay', 'day', [['work', 'today.planDayWork'], ['off', 'today.planDayOff']]],
            ['planAskSetting', 'setting', [['indoors', 'today.planSettingIn'], ['out', 'today.planSettingOut'], ['either', 'today.planSettingEither']]],
          ] as const
        )
          // Energy is READ, never asked twice (Melroy, reaffirmed 2026-07-25): when the pill was
          // touched today the sheet already knows, so its energy question simply does not appear
          // and the pill's answer rides the request instead (see the runSequence call below).
          .filter(([, field]) => field !== 'energy' || dayEnergySel == null)
          .map(([question, field, options]) => (
          <View key={field} style={styles.planAskGroup}>
            <Text style={styles.planAskLabel}>{t(`today.${question}`)}</Text>
            <View style={styles.planAskRow}>
              {options.map(([value, labelKey]) => {
                const on = dayContext[field] === value;
                return (
                  <Pressable
                    key={value}
                    // Tapping the chosen answer again clears it, so a mis-tap is undone the same
                    // way it was made and nobody is stuck with a fact they did not mean to state.
                    onPress={() => setDayContext((c) => ({ ...c, [field]: on ? undefined : value }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(labelKey)}
                    style={({ pressed }) => [styles.planChip, on && styles.planChipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.planChipText, on && styles.planChipTextOn]}>{t(labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <PrimaryButton
          label={t('today.planAskGo')}
          onPress={() => void runSequence(dayEnergySel != null ? { ...dayContext, energy: planEnergyFromDay(dayEnergySel) } : dayContext)}
          accessibilityLabel={t('today.planAskGo')}
          style={styles.wrapBtn}
        />
        <Pressable onPress={() => setPlanAskOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.notNow')}>
          <Text style={styles.planDismiss}>{t('common.notNow')}</Text>
        </Pressable>
      </ModalCard>

      <ModalCard visible={order != null} onClose={() => setOrder(null)}>
            <Text style={styles.wrapTitle}>{t('today.orderTitle')}</Text>
            <Text style={styles.wrapLine}>{t('today.orderLine')}</Text>
            <Text style={styles.wrapRoll}>{t('today.planEditHint')}</Text>
            <View style={styles.wrapList}>
              {(order ?? []).map((o, i) => {
                const task = tasks.find((x) => x.id === o.id);
                if (!task) return null;
                return (
                  <View key={o.id} style={styles.seqItem}>
                    <Text style={styles.seqNum}>{i + 1}</Text>
                    <View style={styles.seqText}>
                      <Text style={styles.planTitle} numberOfLines={1}>
                        {task.title}
                      </Text>
                      <Text style={styles.seqReason} numberOfLines={2}>
                        {o.reason}
                      </Text>
                    </View>
                    {/* Disagreeing with the suggestion has to be as easy as taking it. Up/down
                        rather than drag: dragging is fiddly for shaky hands and unusable with a
                        screen reader, and nobody should need to be dextrous to say "not that one
                        first". The arrows are disabled at the ends rather than hidden, so the row
                        never changes shape as things move. */}
                    <View style={styles.seqEdit}>
                      <Pressable
                        onPress={() => movePlanItem(i, -1)}
                        disabled={i === 0}
                        accessibilityRole="button"
                        accessibilityLabel={t('today.planMoveUpA11y', { title: task.title })}
                        hitSlop={8}
                        style={({ pressed }) => [pressed && styles.pressed]}
                      >
                        <Text style={[styles.seqEditGlyph, i === 0 && styles.seqEditOff]}>↑</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => movePlanItem(i, 1)}
                        disabled={i === (order ?? []).length - 1}
                        accessibilityRole="button"
                        accessibilityLabel={t('today.planMoveDownA11y', { title: task.title })}
                        hitSlop={8}
                        style={({ pressed }) => [pressed && styles.pressed]}
                      >
                        <Text style={[styles.seqEditGlyph, i === (order ?? []).length - 1 && styles.seqEditOff]}>↓</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => dropPlanItem(i)}
                        accessibilityRole="button"
                        accessibilityLabel={t('today.planDropA11y', { title: task.title })}
                        hitSlop={8}
                        style={({ pressed }) => [pressed && styles.pressed]}
                      >
                        <Text style={styles.seqEditGlyph}>×</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
            {/* Editing every task out of the plan is a legitimate answer, not an error state. */}
            {(order ?? []).length === 0 && <Text style={styles.wrapLine}>{t('today.planEmpty')}</Text>}
            {(order ?? []).length > 0 && (
              <PrimaryButton
                label={t('today.useOrder')}
                onPress={acceptOrder}
                accessibilityLabel={t('today.useOrder')}
                style={styles.wrapBtn}
              />
            )}
            <Pressable onPress={() => setOrder(null)} accessibilityRole="button" accessibilityLabel={t('common.notNow')}>
              <Text style={styles.planDismiss}>{t('common.notNow')}</Text>
            </Pressable>
      </ModalCard>

      {/* After "Plan my day" orders a heavy day, offer the Lighten-today re-spread (Melroy's "push a few
          out?" follow-up). Only on a heavy day, and only after ordering, so it never nags a calm day. */}
      <ModalCard visible={offerDefer} onClose={() => setOfferDefer(false)}>
            <Text style={styles.wrapTitle}>{t('today.offerDeferTitle')}</Text>
            <Text style={styles.wrapLine}>{t('today.offerDeferLine')}</Text>
            <PrimaryButton
              label={t('today.offerDeferYes')}
              onPress={() => {
                setOfferDefer(false);
                runStrategise();
              }}
              accessibilityLabel={t('today.offerDeferYesA11y')}
              style={styles.wrapBtn}
            />
            <Pressable
              onPress={() => {
                setOfferDefer(false);
                affirm(t('today.gentleOrderAffirm'));
              }}
              accessibilityRole="button"
              accessibilityLabel={t('today.offerDeferNo')}
            >
              <Text style={styles.planDismiss}>{t('today.offerDeferNo')}</Text>
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
        onEditSeries={editSeries}
        onRemoveSeries={removeSeries}
        onRestoreSeries={restoreSeries}
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
        onPremium={() => {
          track('premium.menu_open');
          router.push('/premium');
        }}
        onSettings={() => router.push('/settings')}
        premium={premium}
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
    // Quiet drops the pill chrome to a plain accent text button (the dots hide in the JSX); the 44px
    // touch target stays via the existing hitSlop, and the height matches so the topBar never shifts.
    roomsPill:
      t.appearance === 'quiet'
        ? { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.two, paddingHorizontal: 6 }
        : {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.two,
            borderWidth: border.hair,
            borderColor: rgba(t.colors.ink, t.scheme === 'dark' ? 0.14 : 0.1), // derived so the Menu pill follows the active theme, not a baked-in Dusk tint
            backgroundColor: rgba(t.colors.surface, 0.6),
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
    // The select shelf card (congruency pass): the held-card-v2 family. Standard wears the
    // card surface + hairline + shadow; Quiet keeps its single accentSoft wash, no chrome.
    selectShelfCard:
      t.appearance === 'quiet'
        ? { backgroundColor: t.quiet.pressWash, borderRadius: radius.md, padding: spacing.four, gap: spacing.one }
        : { backgroundColor: t.colors.surfaceCard, borderRadius: radius.md, borderWidth: border.hair, borderColor: t.colors.line, padding: spacing.four, gap: spacing.one, boxShadow: cardShadow(t) },
    selectCount: { color: t.colors.ink, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    selectHintText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    // Select all in the rail grammar (bordered = act-and-stay); Quiet keeps the underline.
    selectAllPill:
      t.appearance === 'quiet'
        ? { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.two }
        : { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.four, borderWidth: border.hair, borderColor: t.colors.line, borderRadius: radius.pill },
    selectAllPillText:
      t.appearance === 'quiet'
        ? { color: t.colors.ink, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', textDecorationLine: 'underline' }
        : { color: t.colors.ink, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    selectDimText: { color: t.colors.inkFaint },
    selectRowOff: { opacity: 0.4 },
    // The verbs SPREAD across the card's width (Melroy's live look: left-packed read as
    // clustered): space-between with a small padding so the outer verbs align with the
    // count above and the shelf's corners below. Wrapped lines (FR/IT) distribute too.
    selectVerbRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.four, minHeight: 44, paddingHorizontal: spacing.one },
    selectVerb: { minHeight: 44, justifyContent: 'center' },
    // Combine's reserved slot: 48px in EVERY state, so the bar never changes height.
    combineSlot: { minHeight: 48, justifyContent: 'center' },
    combineHero:
      t.appearance === 'quiet'
        ? { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three, paddingHorizontal: spacing.two }
        : { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three, paddingHorizontal: spacing.three, borderRadius: radius.sm, backgroundColor: t.colors.accentSoft },
    combineHeroLabel: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    combineHeroSub: { color: t.colors.inkSoft, fontSize: 12 * t.scale, fontFamily: fonts.body, textAlign: 'right', flexShrink: 1 },
    // The shelf: the same floor as the held card (band + hairline, rounded into the corners).
    selectShelf:
      t.appearance === 'quiet'
        ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three, borderTopWidth: border.hair, borderColor: t.quiet.hairline, paddingTop: spacing.three, paddingHorizontal: spacing.two, marginTop: spacing.one, minHeight: 44 }
        : {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.three,
            minHeight: 52,
            marginTop: spacing.one,
            marginHorizontal: -spacing.four,
            marginBottom: -spacing.four,
            paddingHorizontal: spacing.four,
            borderTopWidth: border.hair,
            borderColor: t.colors.line,
            borderBottomLeftRadius: radius.md,
            borderBottomRightRadius: radius.md,
            backgroundColor: t.scheme === 'dark' ? 'rgba(0,0,0,0.16)' : 'rgba(43,39,34,0.035)',
          },
    selectCancelText: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    removeStack: { alignItems: 'flex-end' },
    seriesContinues: { color: t.colors.inkSoft, fontSize: 11 * t.scale, fontFamily: fonts.body },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: spacing.four },
    selectAction: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    sliceEditStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.four, marginVertical: spacing.four },
    sliceStepBtn: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: border.hair, borderColor: t.colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface },
    sliceStepBtnOff: { opacity: 0.4 },
    sliceStepGlyph: { fontSize: 26 * t.scale, lineHeight: 30 * t.scale, color: t.colors.accent, fontFamily: fonts.body },
    sliceStepValue: { ...t.type.heading, color: t.colors.ink, minWidth: 110, textAlign: 'center' },
    selectDone: { color: t.colors.doneText, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    selectRemove: { color: t.colors.danger, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', textAlign: 'right' },
    sortSummary: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginBottom: spacing.two },
    affirmation: { color: t.colors.doneText, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center', marginBottom: spacing.two },
    holdHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.three,
      marginBottom: spacing.three,
      // Quiet drops the soft-filled pill for a faint inline line (a 5px accent dot
      // marks it, see holdHintDot); Standard keeps the reassuring accentSoft card.
      ...(t.appearance === 'quiet'
        ? { paddingVertical: spacing.two, paddingHorizontal: 2 }
        : { backgroundColor: t.colors.accentSoft, borderRadius: radius.md, paddingVertical: spacing.three, paddingHorizontal: spacing.four }),
    },
    holdHintDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.colors.accent },
    holdHintText: { flex: 1, color: t.appearance === 'quiet' ? t.quiet.secondary : t.colors.ink, fontSize: 14 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale },
    holdHintDismiss: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
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
    weightTrack: {
      flexDirection: 'row',
      // Quiet keeps the gauge but halves it to a 3px hairline on the faint quiet line, so the
      // day's weight still reads at a glance without a loud filled bar.
      height: t.appearance === 'quiet' ? 3 : 6,
      borderRadius: radius.pill,
      backgroundColor: t.appearance === 'quiet' ? t.quiet.hairline : t.colors.line,
      overflow: 'hidden',
    },
    weightFill: { backgroundColor: t.colors.accent },
    weightLabel: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    // The Energy pills: a segmented day-state beside the gauge. Selected = accent on accent-tint
    // with a soft accent border; unselected = plain soft ink, no border (the design's own spec).
    // The pills' visible header, in the same overline voice as RIGHT NOW: without it, three bare
    // words under the greeting read as lost text (real-user report, 2026-07-26).
    energyOverline: {
      color: t.colors.inkFaint,
      fontSize: 10.5 * t.scale,
      fontFamily: fonts.bodyBold,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: spacing.one,
    },
    energyRow: { flexDirection: 'row', gap: spacing.two, marginBottom: spacing.four, flexWrap: 'wrap' },
    energyPill: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.one,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: 'transparent',
    },
    energyPillOn: { backgroundColor: t.colors.accentSoft, borderColor: rgba(t.colors.accent, 0.4) },
    energyPillText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    energyPillTextOn: { color: t.colors.accent, fontFamily: fonts.bodyBold, fontWeight: '600' },
    // The constant frame's fixed layer: the Right-now slot + caret, docked above capture, and the
    // caret panel that grows UPWARD from it. The panel is a calm card, hairline-bordered; the slot
    // occupant is the one accent-weight thing at the thumb.
    rightNowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, marginBottom: spacing.two },
    rightNowSlot: { flex: 1, paddingVertical: spacing.one },
    rightNowOverline: {
      color: t.colors.inkFaint,
      fontSize: 10.5 * t.scale,
      fontFamily: fonts.bodyBold,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    rightNowName: { color: t.colors.accent, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', marginTop: 2 },
    caretBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    caretText: { color: t.colors.inkSoft, fontSize: 18 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    toolsPanel: {
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.lg,
      paddingVertical: spacing.two,
      paddingHorizontal: spacing.four,
      marginBottom: spacing.three,
    },
    toolRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
    toolName: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', flexShrink: 1 },
    // Quiet-unavailable: lowered contrast, no lock, no border, no strikethrough. Present, resting.
    toolNameQuiet: { color: t.colors.inkFaint, fontFamily: fonts.body, fontWeight: '400' },
    toolNowTag: { color: t.colors.accent, fontSize: 12 * t.scale, fontFamily: fonts.body },
    toolHintLine: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginBottom: spacing.two },
    toolsScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
    windDown: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    // The evening door to Settle: a soft pressable sentence under the wind-down line.
    windDownSettle: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.one },
    // What's New: the hold-hint card's shape with a small title over its lines.
    whatsNewBody: { flex: 1, gap: spacing.one },
    whatsNewTitle: { color: t.colors.inkFaint, fontSize: 11 * t.scale, fontFamily: fonts.body, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
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
    // The forward-view door on the rested screen: quiet soft ink, underlined like every other
    // tappable text action (TOD-18), a reassuring count that never becomes a list.
    restedWaiting: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body, textAlign: 'center', textDecorationLine: 'underline' },
    restedReopen: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.three },
    reminderOffer: {
      alignSelf: 'stretch',
      alignItems: 'center',
      gap: spacing.three,
      marginTop: spacing.five,
      paddingTop: spacing.four,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.line,
    },
    reminderOfferText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 21 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    reminderOfferRow: { flexDirection: 'row', gap: spacing.five, alignItems: 'center' },
    reminderOfferYes: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    reminderOfferNo: { color: t.colors.inkFaint, fontSize: 15 * t.scale, fontFamily: fonts.body },
    strategiseErr: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
    disabledBtn: { opacity: 0.5 },
    planItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
    planTitle: { color: t.colors.ink, fontSize: 16 * t.scale, flexShrink: 1, fontFamily: fonts.body },
    planWhen: { color: t.colors.accent, fontSize: 14 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    // "Plan my order" (premium): the big PremiumButton (the DoubleDone Premium gradient), the premium signal on Today.
    // Quiet's replacement for the PremiumButton gradient: "Plan my day" as a plain accent text action.
    seqItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.three },
    seqNum: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', minWidth: 16, textAlign: 'center', marginTop: 1 },
    seqText: { flex: 1, gap: 1 },
    // The per-row edit controls. Quiet by default (soft ink, not the accent) so the proposal still
    // reads as a plan rather than a form, and content-sized so a long title never squeezes them out.
    seqEdit: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, paddingLeft: spacing.two },
    seqEditGlyph: { color: t.colors.inkSoft, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', minWidth: 18, textAlign: 'center' },
    seqEditOff: { color: t.colors.inkFaint, opacity: 0.4 },
    // The pre-sort questions: one group per question, chips that toggle.
    planAskGroup: { gap: spacing.two, marginTop: spacing.three, alignSelf: 'stretch' },
    planAskLabel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    planAskRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
    planChip: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.pill,
      paddingVertical: spacing.two,
      paddingHorizontal: spacing.three,
      minHeight: 44,
      justifyContent: 'center',
    },
    planChipOn: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
    planChipText: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body },
    planChipTextOn: { color: t.colors.accent, fontFamily: fonts.bodyBold, fontWeight: '700' },
    seqReason: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 18 * t.scale },
    planDismiss: { color: t.colors.inkSoft, fontSize: 15 * t.scale, textAlign: 'center', marginTop: spacing.two, fontFamily: fonts.body },
    pressed: { opacity: PRESSED_OPACITY },
    // Quiet: the bordered box becomes a capture line (a 1px underline, left-aligned faint text).
    addBar:
      t.appearance === 'quiet'
        ? { borderBottomWidth: border.hair, borderColor: t.quiet.captureUnderline, paddingVertical: spacing.four, paddingHorizontal: 2, alignItems: 'flex-start' }
        : { borderWidth: border.hair, borderColor: t.colors.accent, borderRadius: radius.md, paddingVertical: spacing.four, alignItems: 'center' },
    capturePanel: { gap: spacing.two },
    // display none (not unmount): BrainDump keeps its typed text while the panel is away.
    capturePanelHidden: { display: 'none' },
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
    manualBdInput: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      fontSize: 17 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      backgroundColor: t.colors.surface,
      minHeight: 110,
      maxHeight: 200,
      textAlignVertical: 'top',
      lineHeight: 26 * t.scale,
      marginTop: spacing.one,
      marginBottom: spacing.one,
    },
    didActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.five, marginTop: spacing.two },
    didCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusEntry: {
      // Quiet drops the accent outline for a plain text action (the text is already quieted below).
      ...(t.appearance === 'quiet' ? {} : { borderWidth: border.hair, borderColor: t.colors.accent }),
      borderRadius: radius.md,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      marginBottom: spacing.four,
      alignItems: 'center',
    },
    focusEntryText: {
      color: t.appearance === 'quiet' ? t.colors.inkFaint : t.colors.accent,
      fontSize: 16 * t.scale,
      fontFamily: t.appearance === 'quiet' ? fonts.body : fonts.bodyBold,
      fontWeight: t.appearance === 'quiet' ? '400' : '700',
    },
    // Energy matching: a quiet text door under Focus (no chrome in either appearance),
    // and the three plain choice rows inside its modal.
    energyChoice: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      alignItems: 'center',
    },
    energyChoiceText: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    energyNotNow: { color: t.colors.inkFaint, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center', paddingVertical: spacing.two },
    alsoDidUnderList: { marginTop: spacing.three, marginBottom: spacing.two, alignItems: 'center' },
    selectTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.four, minHeight: 44 },
    moveToPresets:{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two, justifyContent: 'center', marginBottom: spacing.three },
    moveChip: { borderWidth: border.hair, borderColor: t.colors.line, borderRadius: radius.pill, paddingVertical: spacing.three, paddingHorizontal: spacing.three },
    moveChipText: { color: t.colors.ink, fontFamily: fonts.body, fontSize: 14 * t.scale },
    moveCancelWrap: { marginTop: spacing.three, alignItems: 'center' },
    combineList: { gap: spacing.one, marginTop: spacing.one, marginBottom: spacing.one },
    combineItem: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    focusPickList: { marginTop: spacing.five, gap: spacing.four, alignItems: 'center' },
    focusPickItem: { paddingVertical: spacing.two, paddingHorizontal: spacing.three },
    focusPickItemText: { color: t.colors.accent, fontFamily: fonts.sans, fontSize: 22 * t.scale, textAlign: 'center' },
    // The "not sure?" helper in the Focus picker: softer than the task choices, so it reads
    // as an offer beside them, not another task. The hairline pill (Melroy, device round:
    // plain italic text wasn't dynamic enough) makes it read as tappable without shouting.
    focusFitEntry: { paddingVertical: spacing.two, paddingHorizontal: spacing.four, borderWidth: border.hair, borderColor: t.colors.line, borderRadius: radius.pill },
    focusFitText: { color: t.colors.inkSoft, fontFamily: fonts.body, fontSize: 17 * t.scale, textAlign: 'center', fontStyle: 'italic' },
    closeNoteLabel: { color: t.colors.inkSoft, fontFamily: fonts.body, fontSize: 14 * t.scale, marginTop: spacing.three, marginBottom: spacing.two, textAlign: 'center' },
    // The screen is now just the backdrop; the centring and padding moved to the ScrollView's CONTENT
    // container (focusScrollContent) so a long list can scroll instead of being clipped at both ends.
    focusScreen: { flex: 1, backgroundColor: t.colors.bg },
    focusScrollContent: { flexGrow: 1, padding: spacing.six, justifyContent: 'center', alignItems: 'center' },
    // zIndex belts the sibling-order braces: this button must ALWAYS beat the scroller.
    focusExit: { position: 'absolute', top: spacing.seven, left: spacing.five, zIndex: 1 },
    focusExitText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusBody: { alignItems: 'center', gap: spacing.four, maxWidth: 440, width: '100%' },
    focusLabel: { ...t.type.eyebrow, color: t.colors.accent, textTransform: 'uppercase' },
    focusTitle: { color: t.colors.ink, fontSize: 30 * t.scale, lineHeight: 38 * t.scale, fontFamily: fonts.sans, fontWeight: '600', textAlign: 'center', letterSpacing: -0.3 },
    focusStep: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body },
    focusEmptyNote: { color: t.colors.inkSoft, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    focusActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.six, marginTop: spacing.four },
    focusSkipText: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    closeRoot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.five,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // Quiet drops the dim scrim for the plain page colour, so the wrap reads as
      // text on the page rather than a card floating over a darkened Today. The
      // card itself is already page-coloured, so the two blend into one calm surface.
      backgroundColor: t.appearance === 'quiet' ? t.colors.bg : t.colors.scrim,
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
    wrapCheck: { color: t.colors.doneText, fontSize: 16 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    wrapItemText: { color: t.colors.inkSoft, fontSize: 16 * t.scale, flexShrink: 1, fontFamily: fonts.body },
    wrapRoll: { color: t.colors.inkFaint, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, marginTop: spacing.two, fontFamily: fonts.body },
    wrapBtn: { marginTop: spacing.three },
    wrapGoodnightQuiet: { marginTop: spacing.four, alignItems: 'flex-start', paddingVertical: spacing.two },
    wrapGoodnightQuietText: { color: t.colors.accent, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  });
