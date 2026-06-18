import AsyncStorage from '@react-native-async-storage/async-storage';

import { deserialize, SEED, serialize, type Task } from './tasks';
import { track } from './telemetry';

// Versioned so a future shape change can migrate rather than silently drop data.
const STORAGE_KEY = 'doubledone.tasks.v1';
const REMINDER_KEY = 'doubledone.reminder.v1';

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
