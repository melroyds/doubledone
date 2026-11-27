// Active devices (2026-11-27). The Analytics Centre could count Premium accounts but not the people who simply use
// the app, free or paid, because nothing on a plain day ever reaches the Worker. Four bare names close that, through
// the same names-only beacon as every other count (lib/telemetry, server/src/events.ts), so the Worker still learns
// nothing but a name and the day it arrived:
//
//   day.opened       once per device per UTC day it opens: the day's distinct devices (daily active)
//   week.opened      once per device per UTC week, Monday to Sunday: the week's distinct devices (weekly active)
//   device.new       once per install, on its first open: the size of each week's new cohort
//   week.six.opened  once per install, on its first open in its sixth week (days 35 to 41): the retention bar in the
//                    product spec, "is an ADHD person still opening this in week six", as a number
//
// No device id, ever. Nothing in a count says which device sent it, so the server has no key to follow a device from one
// count to the next: day.opened says "some device opened today" and nothing about which. At low volume counts can still
// be matched by their dates (a lone new device in a week and a sixth-week return 35 days later), and the host's request
// log keeps addresses for a week, as the privacy page says. We never try. It is also why a week's figure must come
// from its own count (week.opened) rather than from adding up days.
//
// UTC on purpose: the Worker files each count under its own date('now'), which is UTC. With the device claiming UTC
// days too, a device counts once in each of the server's days it opens on, so a day's figure is its distinct devices,
// give or take a request that crosses midnight UTC on its way, a phone whose clock is off, or the resend below.
//
// The device writes its claim BEFORE sending, so the cold open and the return to the foreground can never both count,
// and an unreadable memory sends nothing. A name that gets no answer (no signal, a timeout) stays owed in the memory
// and goes again on the next foreground or, on the web, when the connection comes back: a day's count only within its
// UTC day, a week's within its week, the two once-ever names until they arrive. Without that, one open on a train would
// lose the device's whole day, and a first sixth-week open made offline would lose its return for good, which reads
// retention low. The price is a rare double, when a request arrived but its answer was lost. No react-native import,
// so it is node-tested.

/** The four names, in the order a first open sends them. */
export const ACTIVE_NAMES = ['day.opened', 'week.opened', 'device.new', 'week.six.opened'] as const;
export type ActiveName = (typeof ACTIVE_NAMES)[number];

/** `start` for a device that was in use before the count existed: its first open is unknown, so it is never part of a
 *  week-six cohort and never sends device.new. */
export const BEFORE_COUNT = 'before';

/** The sixth week, counted from the first open as day 0: days 35 to 41. */
export const WEEK_SIX_FIRST_DAY = 35;
export const WEEK_SIX_LAST_DAY = 41;

/**
 * What this device remembers about its own counts. Device bookkeeping, never content: the account wipe leaves it, as it
 * leaves widget.placed's day, because a deleted account does not make the phone a new device.
 */
export type ActiveMemory = {
  /** The last UTC day (YYYY-MM-DD) this device claimed day.opened for. */
  day?: string;
  /** The UTC Monday (YYYY-MM-DD) of the last week this device claimed week.opened for. */
  week?: string;
  /** The UTC day of this install's first open, or BEFORE_COUNT. Absent until the first count decides it. */
  start?: string;
  /** The week-six question is settled: claimed, or the window passed without an open. */
  six?: true;
  /** Names claimed here that never got an answer, owed until they do (see stillOwed). */
  pending?: ActiveName[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NAME_SET: ReadonlySet<string> = new Set(ACTIVE_NAMES);

function isRealDay(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

/** Read a stored memory. Anything malformed reads as absent, field by field, so a damaged value costs at most a
 *  repeated count for today, and never a false new device (an absent start is decided again, by the onboarded flag). */
export function parseActiveMemory(raw: string | null): ActiveMemory {
  if (!raw) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const mem: ActiveMemory = {};
  if (isRealDay(o.day)) mem.day = o.day;
  if (isRealDay(o.week)) mem.week = o.week;
  if (o.start === BEFORE_COUNT || isRealDay(o.start)) mem.start = o.start as string;
  if (o.six === true) mem.six = true;
  if (Array.isArray(o.pending)) {
    const owed = new Set(o.pending.filter((n) => typeof n === 'string' && NAME_SET.has(n)));
    const names = ACTIVE_NAMES.filter((n) => owed.has(n));
    if (names.length > 0) mem.pending = names;
  }
  return mem;
}

/** The UTC day of `now`, as YYYY-MM-DD. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The Monday that starts `now`'s UTC week, as YYYY-MM-DD. */
export function utcWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Whole days from UTC day `from` to UTC day `to` (both YYYY-MM-DD). */
function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The counts an open at `now` owes, and the memory to store before sending them. `fresh` says whether this device is a
 * new install (the welcome not yet done), and is read only while `start` is undecided: an existing device meeting the
 * count for the first time is marked BEFORE_COUNT instead, so the day this ships never reads as a wave of new devices.
 * A clock that moves backwards counts its day again rather than going quiet until the old date comes round.
 */
export function activeBeats(mem: ActiveMemory, now: Date, fresh: boolean): { names: ActiveName[]; next: ActiveMemory } {
  const day = utcDay(now);
  const week = utcWeek(now);
  const names: ActiveName[] = [];
  const next: ActiveMemory = { ...mem };
  if (mem.day !== day) {
    names.push('day.opened');
    next.day = day;
  }
  if (mem.week !== week) {
    names.push('week.opened');
    next.week = week;
  }
  if (next.start === undefined) {
    if (fresh) {
      names.push('device.new');
      next.start = day;
    } else {
      next.start = BEFORE_COUNT;
    }
  }
  if (next.start !== BEFORE_COUNT && !next.six) {
    const age = daysFrom(next.start, day);
    if (age >= WEEK_SIX_FIRST_DAY && age <= WEEK_SIX_LAST_DAY) {
      names.push('week.six.opened');
      next.six = true;
    } else if (age > WEEK_SIX_LAST_DAY) {
      next.six = true;
    }
  }
  return { names, next };
}

/**
 * The earlier claims still worth sending at `now`: a day's count only within the UTC day it was claimed for, and a
 * week's within its week, because the Worker files a count under the day it ARRIVES, so a day's count sent the next day
 * would land beside that day's own and count the device twice there. The once-ever names go until they arrive, filed a
 * little late at worst.
 */
export function stillOwed(mem: ActiveMemory, now: Date): ActiveName[] {
  return (mem.pending ?? []).filter((name) => {
    if (name === 'day.opened') return mem.day === utcDay(now);
    if (name === 'week.opened') return mem.week === utcWeek(now);
    return true;
  });
}

function withPending(mem: ActiveMemory, names: readonly ActiveName[]): ActiveMemory {
  const out: ActiveMemory = { ...mem };
  delete out.pending;
  if (names.length > 0) out.pending = [...names];
  return out;
}

function sameMemory(a: ActiveMemory, b: ActiveMemory): boolean {
  return (
    a.day === b.day &&
    a.week === b.week &&
    a.start === b.start &&
    a.six === b.six &&
    (a.pending ?? []).join() === (b.pending ?? []).join()
  );
}

export type ActiveDeps = {
  /** The stored memory, or null when it cannot be read (then nothing is sent). */
  load: () => Promise<ActiveMemory | null>;
  /** Store the memory; true only when the write landed (the counts go only after it). */
  save: (mem: ActiveMemory) => Promise<boolean>;
  /** Whether this is a new install. Asked only while the device's start is undecided. */
  isFresh: () => Promise<boolean>;
  /** Send one name; true once the Worker has answered it (lib/telemetry's trackSent). Never throws. */
  send: (name: ActiveName) => Promise<boolean>;
  /** Run one whole claim, read to last write, with no other window of this browser inside it (navigator.locks on the
   *  web). Optional: a phone runs one app at a time. */
  exclusive?: <T>(run: () => Promise<T>) => Promise<T>;
};

/**
 * A counter for the app's opens. A call reads the memory, works out what is owed (today's names plus any earlier claim
 * that never got an answer), stores the claim, sends, and stores what is still owed. It never runs twice at once: a
 * call that arrives while a claim is running (the return to the app while a send is stalled on a weak signal, or held
 * by another window's lock) is not dropped, it makes the running claim go once more when it ends, at that moment's
 * time. Once a UTC day has nothing left to send it stops before storage until the next day. A send without an answer
 * leaves the day open, so the next foreground (or the web's return online) tries again. A storage failure sends
 * nothing and is not retried that day. `now` is for tests; the app reads the clock as each claim starts. Resolves to
 * the names that arrived. Never throws.
 */
export function activeCounter(deps: ActiveDeps): (now?: Date) => Promise<ActiveName[]> {
  let running = false;
  let again = false;
  let settledOn: string | null = null;

  const attempt = async (now: Date): Promise<ActiveName[]> => {
    const day = utcDay(now);
    if (settledOn === day) return [];
    const mem = await deps.load();
    if (!mem) {
      settledOn = day;
      return [];
    }
    const fresh = mem.start === undefined ? await deps.isFresh() : false;
    const { names, next } = activeBeats(mem, now, fresh);
    const owed = new Set<ActiveName>([...stillOwed(mem, now), ...names]);
    const toSend = ACTIVE_NAMES.filter((name) => owed.has(name));
    const claimed = withPending(next, toSend);
    if (!sameMemory(mem, claimed) && !(await deps.save(claimed))) {
      settledOn = day;
      return [];
    }
    if (toSend.length === 0) {
      settledOn = day;
      return [];
    }
    const answered = await Promise.all(toSend.map((name) => deps.send(name)));
    const sent = toSend.filter((_, i) => answered[i]);
    const left = toSend.filter((_, i) => !answered[i]);
    // Best effort: if this write fails, the names that arrived stay owed and go again, which doubles them.
    if (sent.length > 0) await deps.save(withPending(claimed, left));
    if (left.length === 0) settledOn = day;
    return sent;
  };

  return async (at?: Date) => {
    if (running) {
      again = true;
      return [];
    }
    running = true;
    const sent: ActiveName[] = [];
    try {
      do {
        again = false;
        // The clock is read inside the claim, so a claim that waited (for a lock, or behind a stalled one) counts the
        // day it really runs on.
        const pass = async (): Promise<ActiveName[]> => {
          const now = at ?? new Date();
          return attempt(now).catch((): ActiveName[] => {
            settledOn = utcDay(now);
            return [];
          });
        };
        sent.push(...(await (deps.exclusive ? deps.exclusive(pass) : pass())));
      } while (again);
    } catch {
      settledOn = utcDay(at ?? new Date());
    } finally {
      running = false;
    }
    return sent;
  };
}

// Automation and crawlers on the web. The capture scripts already block the beacon, and a store build's own test
// devices cannot be told apart from here, but a browser that SAYS it is driven (navigator.webdriver, which Playwright,
// Puppeteer and Selenium all set) or names itself a crawler is never a person opening their day. Deliberately not a
// bare /bot/: a phone brand (CUBOT) carries those letters in its user agent.
const CRAWLER_UA =
  /googlebot|google-inspectiontool|storebot-google|bingbot|applebot|yandexbot|duckduckbot|petalbot|ahrefsbot|semrushbot|gptbot|claudebot|ccbot|bytespider|perplexitybot|headlesschrome|lighthouse|crawler|spider/i;

/** Whether a browser is automation or a crawler, by what it says about itself. Never true for a missing navigator. */
export function isAutomatedBrowser(nav: { webdriver?: boolean; userAgent?: string } | undefined | null): boolean {
  if (!nav) return false;
  if (nav.webdriver === true) return true;
  return typeof nav.userAgent === 'string' && CRAWLER_UA.test(nav.userAgent);
}
