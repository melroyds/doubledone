import AsyncStorage from '@react-native-async-storage/async-storage';

import { deserializeRoutines, type Routine, serializeRoutines } from './routines';
import { type Scrapbook } from './scrapbook';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from './settings';
import { deserialize, SEED, serialize, type Task } from './tasks';
import { track } from './telemetry';

// Versioned so a future shape change can migrate rather than silently drop data.
const STORAGE_KEY = 'doubledone.tasks.v1';
const REMINDER_KEY = 'doubledone.reminder.v1';
const SETTINGS_KEY = 'doubledone.settings.v1';
const SCRAPBOOKS_KEY = 'doubledone.scrapbooks.v1';
const ROUTINES_KEY = 'doubledone.routines.v1';
const CLOSED_KEY = 'doubledone.closed.v1';
const LOWDAY_KEY = 'doubledone.lowday.v1';
const LASTOPEN_KEY = 'doubledone.lastopen.v1';
const ONBOARDED_KEY = 'doubledone.onboarded.v1';
const HOLDHINT_KEY = 'doubledone.holdhint.v1'; // one-time "hold a task for more" coachmark
const ACCOUNT_KEY = 'doubledone.account.v1';
const SYNCOK_KEY = 'doubledone.syncok.v1'; // result of the last sync attempt, so the footer can tell the truth
const REMINDEROFFER_KEY = 'doubledone.reminderoffer.v1'; // one-time "offer the reminder after the first close-day"
const REMINDERHOUR_KEY = 'doubledone.reminderhour.v1'; // the hour (0-23) the daily reminder fires; default 9am
const DEV_PREMIUM_KEY = 'doubledone.devPremium.v1'; // DEV/preview only: the premium-flag override (see premium-flag.ts)

/**
 * Load Today's tasks. On a brand-new install (nothing ever stored) seed once so
 * the first open is not an empty void. An explicit empty list, the user cleared
 * everything, is respected and never re-seeded.
 */
export async function loadTasks(): Promise<Task[]> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    track('store.load_failed');
    return [];
  }
  if (raw === null) {
    await saveTasks(SEED);
    return SEED;
  }
  return deserialize(raw);
}

/** Persist Today's tasks. Storage failures are logged, never thrown at the UI. */
export async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, serialize(tasks));
  } catch {
    track('store.save_failed', { count: tasks.length });
  }
}

/** Whether the daily reminder is on (persisted toggle). */
export async function loadReminderOn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REMINDER_KEY)) === 'on';
  } catch {
    return false;
  }
}

/** Persist the daily-reminder toggle. */
export async function saveReminderOn(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDER_KEY, on ? 'on' : 'off');
  } catch {
    // best effort
  }
}

/** The hour (0-23) the daily reminder fires. Defaults to 9am; clamped so a corrupt value never schedules nonsense. */
export async function loadReminderHour(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(REMINDERHOUR_KEY);
    const n = raw == null ? 9 : parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(23, n)) : 9;
  } catch {
    return 9;
  }
}

/** Persist the daily-reminder hour (0-23). Best effort. */
export async function saveReminderHour(hour: number): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDERHOUR_KEY, String(Math.max(0, Math.min(23, Math.round(hour)))));
  } catch {
    // best effort
  }
}

/**
 * DEV / preview only: the premium-flag override ('on' / 'off'), or null to use the real
 * entitlement. Lets the premium and free states be tested locally without a live subscription.
 * Only takes effect where premium-flag's DEV_PREMIUM_ALLOWED is true, never in production.
 */
export async function loadDevPremium(): Promise<'on' | 'off' | null> {
  try {
    const v = await AsyncStorage.getItem(DEV_PREMIUM_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

/** Persist (or clear, when null) the dev premium override. Best effort. */
export async function saveDevPremium(v: 'on' | 'off' | null): Promise<void> {
  try {
    if (v) await AsyncStorage.setItem(DEV_PREMIUM_KEY, v);
    else await AsyncStorage.removeItem(DEV_PREMIUM_KEY);
  } catch {
    // best effort
  }
}

/** The ISO date (YYYY-MM-DD) the user closed the day on, or null. Drives the calm
 *  "rested" Today state; it self-clears when the date rolls over (a new day's ISO
 *  no longer matches). */
export async function loadClosedDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLOSED_KEY);
  } catch {
    return null;
  }
}

/** Persist (or clear, when null) the closed-day date. Best effort. */
export async function saveClosedDate(iso: string | null): Promise<void> {
  try {
    if (iso) await AsyncStorage.setItem(CLOSED_KEY, iso);
    else await AsyncStorage.removeItem(CLOSED_KEY);
  } catch {
    // best effort
  }
}

/** The ISO date the user marked a low-capacity day on, or null. Per-day, like the
 *  closed-day flag: it self-clears when the date rolls over, never a persistent setting. */
export async function loadLowDayDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LOWDAY_KEY);
  } catch {
    return null;
  }
}

/** Persist (or clear, when null) the low-capacity-day date. Best effort. */
export async function saveLowDayDate(iso: string | null): Promise<void> {
  try {
    if (iso) await AsyncStorage.setItem(LOWDAY_KEY, iso);
    else await AsyncStorage.removeItem(LOWDAY_KEY);
  } catch {
    // best effort
  }
}

/** The ISO date the app was last opened, or null (brand-new install). Drives the
 *  shame-free "welcome back" card after a multi-day gap. */
export async function loadLastOpen(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LASTOPEN_KEY);
  } catch {
    return null;
  }
}

/** Stamp today as the last-open date. Best effort. */
export async function saveLastOpen(iso: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LASTOPEN_KEY, iso);
  } catch {
    // best effort
  }
}

/** Whether the one-time welcome has been completed or skipped. On a storage failure
 *  returns true, never trap a user in onboarding because the disk hiccupped. */
export async function loadOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'yes';
  } catch {
    return true;
  }
}

/** Mark the welcome as done (or clear it). Best effort. */
export async function saveOnboarded(done: boolean): Promise<void> {
  try {
    if (done) await AsyncStorage.setItem(ONBOARDED_KEY, 'yes');
    else await AsyncStorage.removeItem(ONBOARDED_KEY);
  } catch {
    // best effort
  }
}

/** Whether the one-time "hold a task for more" coachmark has been seen / dismissed. The long-press is the
 *  only door to half the app (pin, remind, combine, make-it-tiny, bulk), so a first-timer needs telling. */
export async function loadHoldHintSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HOLDHINT_KEY)) === 'yes';
  } catch {
    return false;
  }
}

/** Mark the hold coachmark seen, so it never shows again. Best effort. */
export async function saveHoldHintSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(HOLDHINT_KEY, 'yes');
  } catch {
    // best effort
  }
}

/** Load the user's settings (theme / text size / motion). Defaults on any failure. */
export async function loadSettings(): Promise<Settings> {
  try {
    return parseSettings(await AsyncStorage.getItem(SETTINGS_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Persist the user's settings. Best effort, never thrown at the UI. */
export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
  } catch {
    // best effort
  }
}

/** Load saved AI scrapbooks. Defensive: any unreadable / malformed blob yields []. */
export async function loadScrapbooks(): Promise<Scrapbook[]> {
  try {
    const raw = await AsyncStorage.getItem(SCRAPBOOKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is Scrapbook =>
        b != null &&
        typeof (b as Scrapbook).weekStart === 'string' &&
        typeof (b as Scrapbook).image === 'string' &&
        typeof (b as Scrapbook).caption === 'string',
    );
  } catch {
    return [];
  }
}

/** Persist scrapbooks. Best effort: the image is normally a small R2 URL, but a base64 fallback can be large, so a quota
 *  failure must be swallowed, never crash the app. */
export async function saveScrapbooks(books: Scrapbook[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SCRAPBOOKS_KEY, JSON.stringify(books));
  } catch {
    // best effort
  }
}

/** Load saved routines (Cluster D). Defensive: any unreadable / malformed blob yields []. */
export async function loadRoutines(): Promise<Routine[]> {
  try {
    return deserializeRoutines(await AsyncStorage.getItem(ROUTINES_KEY));
  } catch {
    return [];
  }
}

/** Persist routines. Best effort, never thrown at the UI. */
export async function saveRoutines(routines: Routine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ROUTINES_KEY, serializeRoutines(routines));
  } catch {
    // best effort
  }
}

/** The user id the local task store was last synced with, or null (anonymous / never
 *  synced). Drives the cross-account guard: a sign-in as a different user must not
 *  inherit or migrate the previous user's local tasks. */
export async function loadSyncedOwner(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACCOUNT_KEY);
  } catch {
    return null;
  }
}

/** Record (or clear, when null) the account the local store belongs to. Best effort. */
export async function saveSyncedOwner(userId: string | null): Promise<void> {
  try {
    if (userId) await AsyncStorage.setItem(ACCOUNT_KEY, userId);
    else await AsyncStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // best effort
  }
}

/** The result of the last sync attempt: true (reached the account), false (a non-fatal failure, the tasks are
 *  saved on this device only), or null (never synced / unknown). Lets the UI stop claiming "Synced" when it
 *  could not reach the account, which would be a false promise of cross-device safety. */
export async function loadLastSyncOk(): Promise<boolean | null> {
  try {
    const v = await AsyncStorage.getItem(SYNCOK_KEY);
    return v === 'yes' ? true : v === 'no' ? false : null;
  } catch {
    return null;
  }
}

/** Record whether the last sync attempt reached the account. Best effort. */
export async function saveLastSyncOk(ok: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SYNCOK_KEY, ok ? 'yes' : 'no');
  } catch {
    // best effort
  }
}

/** Whether the one-time daily-reminder offer (shown after the first close-the-day) has been made. The reminder
 *  is the named lever against the week-three retention cliff, so it is offered once at a concrete moment. */
export async function loadReminderOfferMade(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REMINDEROFFER_KEY)) === 'yes';
  } catch {
    return false;
  }
}

/** Mark the one-time reminder offer as made (accepted or declined), so it never shows again. Best effort. */
export async function saveReminderOfferMade(): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDEROFFER_KEY, 'yes');
  } catch {
    // best effort
  }
}

/**
 * Erase everything tied to the person from this device, for account deletion: both the
 * explicit in-app delete and the detected remote-deletion path call this. One key list,
 * so neither path can quietly forget one again, which is exactly how the scrapbook used
 * to survive a delete. Clears the user content and history (tasks, scrapbooks, routines)
 * and the per-day / sync state; keeps only device-level display prefs (theme / text size /
 * motion, the reminder toggle, the onboarded flag), which are not personal content. Tasks
 * are set to an explicit empty rather than removed, so loadTasks does not re-seed the
 * welcome examples onto a just-cleared device.
 */
export async function wipeLocalData(): Promise<void> {
  await saveTasks([]);
  await saveSyncedOwner(null);
  try {
    await AsyncStorage.multiRemove([SCRAPBOOKS_KEY, ROUTINES_KEY, CLOSED_KEY, LOWDAY_KEY, LASTOPEN_KEY, DEV_PREMIUM_KEY, SYNCOK_KEY]);
  } catch {
    // best effort, like the per-key savers above
  }
}
