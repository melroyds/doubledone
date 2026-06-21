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
const ACCOUNT_KEY = 'doubledone.account.v1';

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

/** Persist scrapbooks. Best effort: the base64 images are large, so a quota
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
