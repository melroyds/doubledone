import AsyncStorage from '@react-native-async-storage/async-storage';

import { type SharedTask } from './ours-merge';
import { deserializeRoutines, type Routine, serializeRoutines } from './routines';
import { type Scrapbook } from './scrapbook';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from './settings';
import { deserialize, SEED, serialize, type Task } from './tasks';
import { track } from './telemetry';
import { NO_RENEWAL_MEMORY, type RenewalMemory } from './renewal';

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
const WIDGETOFFER_KEY = 'doubledone.widgetoffer.v1'; // one-time "offer the home-screen widget" on the rested screen
const SCRAPBOOKOFFER_KEY = 'doubledone.scrapbookoffer.v1'; // one-time "your week could be a keepsake" mention, the ladder's last rung
const SETTLEGUIDE_KEY = 'doubledone.settleguide.v1'; // the breathing room's ONE remembered toggle (never a settings screen)
const RENEWAL_KEY = 'doubledone.renewal.v1'; // what this device knows about an annual subscription's shape (see lib/renewal)
const WHATSNEW_KEY = 'doubledone.whatsnew.v1'; // the last What's New content id this device has seen
const REMINDERHOUR_KEY = 'doubledone.reminderhour.v1'; // the hour (0-23) the daily reminder fires; default 9am
const DEV_PREMIUM_KEY = 'doubledone.devPremium.v1'; // DEV/preview only: the premium-flag override (see premium-flag.ts)
const ENERGY_USES_KEY = 'doubledone.energyUses.v1'; // energy-match use timestamps (the freemium meter, see lib/energy.ts)
const OURS_KEY = 'doubledone.ours.v1'; // shared lists, keyed BY PAIR (see loadOursCache); holds another person's words
const OURS_TUCKED_KEY = 'doubledone.oursTucked.v1'; // closed lists you have put away, by pair id
// v2: v1 values could be POISONED. Before the server-clock correction landed, the last-look was
// stamped with max(device clock, newest row), so a device running fast wrote a time in the future,
// and `markOursSeen` never moves backwards by design. Any device that did this could never wash a
// row again. Rather than teach the setter to walk backwards (which would reopen the very re-wash
// problem the guard exists for), the key moves and the bad values are simply abandoned. The cost is
// one quiet first visit per device, which is the same thing a new install already sees.
const OURS_SEEN_KEY = 'doubledone.oursSeen.v2'; // when you last looked at each shared list, by pair id
const OURS_MINE_KEY = 'doubledone.oursMine.v1'; // shared rows YOU changed from outside the room, by pair id
const UPDATE_MENTIONED_KEY = 'doubledone.updateMentioned.v1'; // when the goodnight screen last mentioned a newer build

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

// The Energy day-state (the constant frame, 2026-07-25): {date, level} as JSON. A record from a
// PAST day is simply ignored by the reader, which is how "resets to Normal each morning" works
// without a scheduler: the reset is a read-side rule, not a write that has to run at midnight.
const DAYENERGY_KEY = 'doubledone.dayenergy.v1';

export type DayEnergyRecord = { date: string; level: 'low' | 'normal' | 'high' };

/** Today's stated energy, or null when the pills have not been touched today (= Normal, unset). */
export async function loadDayEnergy(todayISO: string): Promise<DayEnergyRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(DAYENERGY_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as DayEnergyRecord;
    if (rec == null || rec.date !== todayISO) return null; // yesterday's energy is not today's
    return rec.level === 'low' || rec.level === 'normal' || rec.level === 'high' ? rec : null;
  } catch {
    return null;
  }
}

/** Persist today's stated energy. Best effort; the pill state is already on screen either way. */
export async function saveDayEnergy(rec: DayEnergyRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(DAYENERGY_KEY, JSON.stringify(rec));
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

/** Load the energy-match use timestamps (the freemium meter's local record). Defensive: junk yields []. */
export async function loadEnergyUses(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(ENERGY_USES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  } catch {
    return [];
  }
}

/** Persist the energy-match use timestamps. Best effort. */
export async function saveEnergyUses(uses: number[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ENERGY_USES_KEY, JSON.stringify(uses));
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
/** Whether the one-time home-screen widget offer has been shown (accepted or dismissed). The widget
 *  is a real lifeline that no user was ever told about; this makes sure they are told exactly once. */
export async function loadWidgetOfferMade(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WIDGETOFFER_KEY)) === 'yes';
  } catch {
    return true; // unknown: stay quiet rather than risk an unwanted ask
  }
}

/** Mark the widget offer made, so it never shows again whatever the answer was. Best effort. */
export async function saveWidgetOfferMade(): Promise<void> {
  try {
    await AsyncStorage.setItem(WIDGETOFFER_KEY, 'yes');
  } catch {
    // best effort
  }
}

/** Whether the one-time scrapbook mention has been shown. The free monthly scrapbook was advertised
 *  nowhere but the premium page, so the funnel depended on stumbling into the Calendar; this makes
 *  sure it is mentioned exactly once, at the earned moment (a week with real finishes in it). */
export async function loadScrapbookOfferMade(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SCRAPBOOKOFFER_KEY)) === 'yes';
  } catch {
    return true; // unknown: stay quiet rather than risk an unwanted ask
  }
}

/** Mark the scrapbook mention made, so it never shows again whatever the answer was. Best effort. */
export async function saveScrapbookOfferMade(): Promise<void> {
  try {
    await AsyncStorage.setItem(SCRAPBOOKOFFER_KEY, 'yes');
  } catch {
    // best effort
  }
}

/** The Settle room's breathing-guide toggle. Defaults ON: the first visit teaches the rhythm,
 *  and the person who needs no teaching turns it off exactly once, forever. */
export async function loadSettleGuide(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SETTLEGUIDE_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function saveSettleGuide(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTLEGUIDE_KEY, on ? 'on' : 'off');
  } catch {
    // best effort
  }
}

/** The last What's New content id seen on this device, or null if never recorded (a device
 *  from before the feature existed, or a fresh install before onboarding stamps it). */
export async function loadWhatsNewSeen(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(WHATSNEW_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** What this device has worked out about an annual renewal. Never throws; a lost value only means
 *  the notice is re-derived, and the ANNUAL judgement is re-learned on the next far-out look. */
export async function loadRenewalMemory(): Promise<RenewalMemory> {
  try {
    const raw = await AsyncStorage.getItem(RENEWAL_KEY);
    if (!raw) return NO_RENEWAL_MEMORY;
    const p = JSON.parse(raw) as Partial<RenewalMemory>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return { annualPeriodEnd: num(p.annualPeriodEnd), noticedPeriodEnd: num(p.noticedPeriodEnd) };
  } catch {
    return NO_RENEWAL_MEMORY;
  }
}

export async function saveRenewalMemory(m: RenewalMemory): Promise<void> {
  try {
    await AsyncStorage.setItem(RENEWAL_KEY, JSON.stringify(m));
  } catch {
    // best effort
  }
}

export async function saveWhatsNewSeen(id: number): Promise<void> {
  try {
    await AsyncStorage.setItem(WHATSNEW_KEY, String(id));
  } catch {
    // best effort
  }
}

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
 * The offline copy of the shared lists, keyed BY PAIR from day one.
 *
 * Keyed rather than flat even though only one pair can exist today, because the schema already
 * allows many (`pair_members`' key is `(pair_id, user_id)`; the cap is a constant in one function)
 * and a flat cache would silently blend two households' rows together the day that number changes.
 * Cheap now, a data-corruption bug later.
 *
 * This is the one thing on the device holding ANOTHER PERSON's words, which is why it is in
 * `wipeLocalData` and why `pruneOursCache` exists: a list you are no longer in must not linger in
 * a file on your phone.
 */
export type OursCache = Record<string, SharedTask[]>;

export async function loadOursCache(): Promise<OursCache> {
  try {
    const raw = await AsyncStorage.getItem(OURS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Defensive: anything on disk can be from an older build or half-written. Keep only the
    // entries that are actually arrays, rather than handing a screen something it will crash on.
    const out: OursCache = {};
    for (const [pairId, rows] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(rows)) out[pairId] = rows as SharedTask[];
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveOursCache(cache: OursCache): Promise<void> {
  try {
    await AsyncStorage.setItem(OURS_KEY, JSON.stringify(cache));
  } catch {
    // best effort, like every other saver here
  }
}

/** One pair's rows. Returns empty for a pair this device has never cached, which is not an error. */
export async function loadOursTasks(pairId: string): Promise<SharedTask[]> {
  return (await loadOursCache())[pairId] ?? [];
}

export async function saveOursTasks(pairId: string, tasks: SharedTask[]): Promise<void> {
  const cache = await loadOursCache();
  cache[pairId] = tasks;
  await saveOursCache(cache);
}

/**
 * Drop every cached pair that is not in `keep`, which is the caller's CONFIRMED memberships.
 *
 * Called after each membership read, so leaving a list, being removed from one, or having one
 * killed all converge on the same outcome without a special path each: the rows stop being on this
 * device. Passing an empty list is meaningful and clears everything, so a caller that genuinely
 * belongs to nothing is not a no-op.
 */
export async function pruneOursCache(keep: string[]): Promise<void> {
  const cache = await loadOursCache();
  const allowed = new Set(keep);
  let changed = false;
  for (const pairId of Object.keys(cache)) {
    if (!allowed.has(pairId)) {
      delete cache[pairId];
      changed = true;
    }
  }
  if (changed) await saveOursCache(cache);
}

/**
 * The closed lists you have PUT AWAY, by pair id.
 *
 * "Put it away" is the design's ordinary exit from a closed list, and it deliberately supersedes
 * the destructive `forget_pair`: it tucks the list into the archive, where it stays readable
 * forever, rather than deleting anything. Deleting survives only as the one irreversible action,
 * behind the delete window.
 *
 * LOCAL, and that is a real trade-off rather than an oversight. Putting a list away on your phone
 * does not put it away on your laptop, because doing it server-side would mean another column,
 * another migration and another dashboard trip. It is a per-person acknowledgement of a closure,
 * not shared state, and the cost of getting it wrong is seeing a quiet archive row twice. If that
 * ever grates, `pair_members` is the natural home and it is one nullable timestamptz.
 *
 * It stores an ACKNOWLEDGEMENT, never content: a set of pair ids and nothing else. Which is also
 * why it belongs in wipeLocalData: it says which relationships you had.
 */
export async function loadTuckedPairs(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(OURS_TUCKED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * When you last looked at each shared list, by pair id. Local for the same reason the tuck is:
 * "since I last looked" is a fact about a PERSON at a DEVICE, and syncing it would let your laptop
 * clear the wash on your phone, which is the opposite of what it is for.
 *
 * It stores a TIME per pair and never content, and it belongs in wipeLocalData for the same reason
 * the tuck does: a list of pair ids is a list of which relationships you had.
 */
export async function loadOursSeen(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(OURS_SEEN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * When the goodnight screen last mentioned that a newer build exists.
 *
 * The only thing standing between one quiet line and a nag. Deliberately NOT in `wipeLocalData`:
 * it is not personal data, it says nothing about which relationships you had, and clearing it on
 * account deletion would mean the very next goodnight screen mentioned an update again.
 */
export async function loadUpdateMentioned(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(UPDATE_MENTIONED_KEY);
    const at = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export async function saveUpdateMentioned(at: number): Promise<void> {
  if (!Number.isFinite(at)) return;
  try {
    await AsyncStorage.setItem(UPDATE_MENTIONED_KEY, String(at));
  } catch {
    // best effort, like every other saver here
  }
}

/**
 * Shared rows you changed from OUTSIDE the room, per pair.
 *
 * The quiet wash subtracts the rows you wrote yourself, because a wash on a row you just ticked
 * reads as "your person touched this too". The room could only ever know about writes made IN the
 * room, so ticking a brought copy on Today came back tinted as your partner's change: the room
 * announcing a change that was your own.
 *
 * The obvious cheap fix, advancing the last-look when you write from Today, is wrong in a way that
 * is easy to miss: it would also clear the wash on THEIR changes that arrived before your write and
 * that you have not looked at yet. So this records the specific ids instead, and nothing else. Ids,
 * never titles: a row id says which relationships you had, exactly like the tuck, and no more.
 */
export async function loadOursMine(pairId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(OURS_MINE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
    const mine = (parsed as Record<string, unknown>)[pairId];
    return Array.isArray(mine) ? mine.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** The most ids one pair keeps. A wash is a courtesy, so an unbounded list of them is not worth a
 *  byte more; oldest fall off first, and the room clears the list every time it marks itself seen. */
const OURS_MINE_MAX = 200;

/** Remember that you wrote these rows. Idempotent and capped. */
export async function noteOursMine(pairId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(OURS_MINE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const all: Record<string, string[]> = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string[]>) : {};
    const current = Array.isArray(all[pairId]) ? all[pairId].filter((id) => typeof id === 'string') : [];
    const next = [...current.filter((id) => !ids.includes(id)), ...ids].slice(-OURS_MINE_MAX);
    await AsyncStorage.setItem(OURS_MINE_KEY, JSON.stringify({ ...all, [pairId]: next }));
  } catch {
    // best effort, like every other saver here
  }
}

/** Forget them, which the room does the moment it has marked itself seen: from then on the
 *  last-look covers those writes and the list is only taking up space. */
export async function clearOursMine(pairId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OURS_MINE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
    const all = { ...(parsed as Record<string, string[]>) };
    if (!(pairId in all)) return;
    delete all[pairId];
    await AsyncStorage.setItem(OURS_MINE_KEY, JSON.stringify(all));
  } catch {
    // best effort
  }
}

/** Mark a list as looked at. Never moves BACKWARDS, so a device whose clock runs behind cannot
 *  re-wash rows you have already read by storing an older "last looked" than the one already there. */
export async function markOursSeen(pairId: string, at: number): Promise<void> {
  if (!Number.isFinite(at)) return;
  const seen = await loadOursSeen();
  if ((seen[pairId] ?? 0) >= at) return;
  try {
    await AsyncStorage.setItem(OURS_SEEN_KEY, JSON.stringify({ ...seen, [pairId]: at }));
  } catch {
    // best effort, like every other saver here
  }
}

/** Put a closed list away. Idempotent, so a double tap is one tuck. */
export async function tuckPair(pairId: string): Promise<void> {
  const tucked = await loadTuckedPairs();
  if (tucked.includes(pairId)) return;
  try {
    await AsyncStorage.setItem(OURS_TUCKED_KEY, JSON.stringify([...tucked, pairId]));
  } catch {
    // best effort, like every other saver here
  }
}

/** Bring one back out, which the archive needs so putting away is never a one-way door either. */
export async function untuckPair(pairId: string): Promise<void> {
  const tucked = await loadTuckedPairs();
  if (!tucked.includes(pairId)) return;
  try {
    await AsyncStorage.setItem(OURS_TUCKED_KEY, JSON.stringify(tucked.filter((id) => id !== pairId)));
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
    // OURS_KEY belongs here more than anything else on the list: it is the only key holding words
    // ANOTHER person wrote. A delete that left it behind would leave a household's list sitting on
    // the phone of someone whose account no longer exists.
    await AsyncStorage.multiRemove([SCRAPBOOKS_KEY, ROUTINES_KEY, CLOSED_KEY, LOWDAY_KEY, DAYENERGY_KEY, LASTOPEN_KEY, DEV_PREMIUM_KEY, SYNCOK_KEY, OURS_KEY, OURS_TUCKED_KEY, OURS_SEEN_KEY, OURS_MINE_KEY]);
  } catch {
    // best effort, like the per-key savers above
  }
}
