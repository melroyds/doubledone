import AsyncStorage from '@react-native-async-storage/async-storage';

import { type Scrapbook } from './scrapbook';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from './settings';
import { deserialize, SEED, serialize, type Task } from './tasks';
import { track } from './telemetry';

// Versioned so a future shape change can migrate rather than silently drop data.
const STORAGE_KEY = 'doubledone.tasks.v1';
const REMINDER_KEY = 'doubledone.reminder.v1';
const SETTINGS_KEY = 'doubledone.settings.v1';
const SCRAPBOOKS_KEY = 'doubledone.scrapbooks.v1';
const CLOSED_KEY = 'doubledone.closed.v1';

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
