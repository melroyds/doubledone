import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_NAMES,
  type ActiveDeps,
  type ActiveMemory,
  type ActiveName,
  activeBeats,
  activeCounter,
  BEFORE_COUNT,
  isAutomatedBrowser,
  parseActiveMemory,
  stillOwed,
  utcDay,
  utcWeek,
} from './active';
import { BEACON_EVENTS } from './telemetry';

// Active devices (2026-11-27): bare once-a-day, once-a-week and once-ever counts. The claim is stored before anything is
// sent, so a second open never makes a second claim, and a name that gets no answer stays owed until it does (which, when
// a request arrived but its answer was lost, sends it twice: the one accepted double).

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');
/** A moment in UTC: month, day, hour, in 2026 unless a year is given. */
const at = (month: number, day: number, hour = 9, year = 2026) => new Date(Date.UTC(year, month - 1, day, hour));

describe('the names', () => {
  it('are four, all on the beacon allowlist, and shaped like every other stored name (no digits)', () => {
    expect([...ACTIVE_NAMES]).toEqual(['day.opened', 'week.opened', 'device.new', 'week.six.opened']);
    for (const name of ACTIVE_NAMES) {
      expect(BEACON_EVENTS.has(name), name).toBe(true);
      expect(name).toMatch(/^[a-z]+(\.[a-z]+)+$/);
    }
  });

  it('the Worker stores exactly the same four', () => {
    const server = read('../../../server/src/events.ts');
    expect(server).toContain("export const ACTIVE_EVENTS = ['day.opened', 'week.opened', 'device.new', 'week.six.opened'] as const;");
    expect(server).toContain('...ACTIVE_EVENTS,');
  });
});

describe('utcDay and utcWeek', () => {
  it('read the UTC calendar, not the phone’s, so the device and the Worker agree on the day', () => {
    // 8:30am on Saturday 28 November in Melbourne is still Friday the 27th in UTC.
    const melbourneSaturdayMorning = new Date('2026-11-27T21:30:00Z');
    expect(utcDay(melbourneSaturdayMorning)).toBe('2026-11-27');
    expect(utcWeek(melbourneSaturdayMorning)).toBe('2026-11-23');
  });

  it('start the week on Monday, and keep Sunday in the week before', () => {
    expect(utcWeek(at(11, 23, 0))).toBe('2026-11-23'); // Monday
    expect(utcWeek(at(11, 29, 23))).toBe('2026-11-23'); // Sunday, last hour
    expect(utcWeek(at(11, 30, 0))).toBe('2026-11-30'); // the next Monday
    expect(utcWeek(at(1, 1, 12))).toBe('2025-12-29'); // across a year
  });
});

describe('parseActiveMemory', () => {
  it('reads a stored memory back, what is still owed included', () => {
    const mem: ActiveMemory = { day: '2026-11-27', week: '2026-11-23', start: '2026-11-20', six: true, pending: ['day.opened', 'week.six.opened'] };
    expect(parseActiveMemory(JSON.stringify(mem))).toEqual(mem);
    expect(parseActiveMemory(JSON.stringify({ start: BEFORE_COUNT }))).toEqual({ start: BEFORE_COUNT });
  });

  it('reads nothing, junk and the wrong shape as an empty memory', () => {
    for (const raw of [null, '', 'not json', '[]', '42', 'null', '"2026-11-27"']) expect(parseActiveMemory(raw), String(raw)).toEqual({});
  });

  it('drops a bad field on its own and keeps the good ones', () => {
    expect(parseActiveMemory(JSON.stringify({ day: '2026-02-30', week: '2026-11-23', start: 'soon', six: 'yes' }))).toEqual({
      week: '2026-11-23',
    });
    expect(parseActiveMemory(JSON.stringify({ day: 20261127, start: '2026-11-20T00:00:00Z' }))).toEqual({});
  });

  it('keeps only real names in what is owed, once each, in their usual order', () => {
    expect(parseActiveMemory(JSON.stringify({ pending: ['week.six.opened', 'app.opened', 7, 'day.opened', 'day.opened'] }))).toEqual({
      pending: ['day.opened', 'week.six.opened'],
    });
    expect(parseActiveMemory(JSON.stringify({ pending: ['nothing.real'] }))).toEqual({});
    expect(parseActiveMemory(JSON.stringify({ pending: 'day.opened' }))).toEqual({});
  });
});

describe('activeBeats', () => {
  it('a new install’s first open sends all three and remembers its start', () => {
    const { names, next } = activeBeats({}, at(11, 27), true);
    expect(names).toEqual(['day.opened', 'week.opened', 'device.new']);
    expect(next).toEqual({ day: '2026-11-27', week: '2026-11-23', start: '2026-11-27' });
  });

  it('a device in use before the count is never a new device, and never in a week-six cohort', () => {
    const first = activeBeats({}, at(11, 27), false);
    expect(first.names).toEqual(['day.opened', 'week.opened']);
    expect(first.next.start).toBe(BEFORE_COUNT);
    // Forty days on, it still sends no week six, and a fresh flag cannot reopen its start.
    const later = activeBeats(first.next, at(1, 6, 9, 2027), true);
    expect(later.names).toEqual(['day.opened', 'week.opened']);
    expect(later.next.start).toBe(BEFORE_COUNT);
    expect(later.next.six).toBeUndefined();
  });

  it('sends nothing again the same day, a day later only day.opened, and a new week both', () => {
    const mem = activeBeats({}, at(11, 23), true).next; // a Monday
    expect(activeBeats(mem, at(11, 23, 22), true)).toEqual({ names: [], next: mem });
    expect(activeBeats(mem, at(11, 24), true).names).toEqual(['day.opened']);
    expect(activeBeats(mem, at(11, 30), true).names).toEqual(['day.opened', 'week.opened']);
  });

  it('sends week.six.opened once, on the first open from day 35 to day 41', () => {
    const start: ActiveMemory = { day: '2026-11-01', week: '2026-10-26', start: '2026-11-01' };
    // Day 34 (5 December) is still week five.
    expect(activeBeats(start, at(12, 5), false).names).not.toContain('week.six.opened');
    // Day 35 opens it.
    const opened = activeBeats(start, at(12, 6), false);
    expect(opened.names).toContain('week.six.opened');
    expect(opened.next.six).toBe(true);
    // Never twice.
    expect(activeBeats(opened.next, at(12, 7), false).names).not.toContain('week.six.opened');
    // Day 41 is the window's last day.
    expect(activeBeats(start, at(12, 12), false).names).toContain('week.six.opened');
  });

  it('a device that skips the whole sixth week is settled without a count', () => {
    const start: ActiveMemory = { day: '2026-11-01', week: '2026-10-26', start: '2026-11-01' };
    const missed = activeBeats(start, at(12, 14), false); // day 43, a Monday
    expect(missed.names).toEqual(['day.opened', 'week.opened']);
    expect(missed.next.six).toBe(true);
    expect(activeBeats(missed.next, at(12, 15), false).names).toEqual(['day.opened']);
  });

  it('a clock that went backwards counts its day again rather than going quiet', () => {
    const fromTheFuture: ActiveMemory = { day: '2027-03-01', week: '2027-03-01', start: BEFORE_COUNT };
    expect(activeBeats(fromTheFuture, at(11, 27), false).names).toEqual(['day.opened', 'week.opened']);
  });
});

describe('stillOwed', () => {
  const owed: ActiveMemory = { day: '2026-11-27', week: '2026-11-23', start: '2026-11-27', pending: [...ACTIVE_NAMES] };

  it('keeps every unanswered name within the day and the week it was claimed for', () => {
    expect(stillOwed(owed, at(11, 27, 23))).toEqual([...ACTIVE_NAMES]);
  });

  it('lets a day’s count go once its UTC day has passed, which would land it beside the next day’s own', () => {
    expect(stillOwed(owed, at(11, 28))).toEqual(['week.opened', 'device.new', 'week.six.opened']);
  });

  it('lets a week’s count go once its week has passed, and keeps the once-ever names until they arrive', () => {
    expect(stillOwed(owed, at(12, 1))).toEqual(['device.new', 'week.six.opened']);
    expect(stillOwed(owed, at(3, 1, 9, 2027))).toEqual(['device.new', 'week.six.opened']);
  });

  it('owes nothing when nothing is pending', () => {
    expect(stillOwed({ day: '2026-11-27' }, at(11, 27))).toEqual([]);
  });
});

describe('activeCounter', () => {
  /** A device's memory in a box, with a Worker that answers or does not. */
  function device(stored: ActiveMemory | null = {}, opts: { fresh?: boolean; saves?: boolean } = {}) {
    let mem = stored;
    let online = true;
    const arrived: ActiveName[] = [];
    const deps = {
      load: vi.fn(async () => (mem ? { ...mem } : null)),
      save: vi.fn(async (next: ActiveMemory) => {
        if (opts.saves === false) return false;
        mem = next;
        return true;
      }),
      isFresh: vi.fn(async () => opts.fresh ?? false),
      send: vi.fn(async (name: ActiveName) => {
        if (!online) return false;
        arrived.push(name);
        return true;
      }),
    } satisfies ActiveDeps;
    return {
      deps,
      memory: () => mem,
      arrived,
      goOffline: () => {
        online = false;
      },
      goOnline: () => {
        online = true;
      },
    };
  }

  it('stores the claim, then sends, then forgets what arrived', async () => {
    const d = device({}, { fresh: true });
    expect(await activeCounter(d.deps)(at(11, 27))).toEqual(['day.opened', 'week.opened', 'device.new']);
    expect(d.arrived).toEqual(['day.opened', 'week.opened', 'device.new']);
    // The first write holds the claim with everything owed, before a single send.
    expect(d.deps.save.mock.calls[0][0]).toEqual({ day: '2026-11-27', week: '2026-11-23', start: '2026-11-27', pending: ['day.opened', 'week.opened', 'device.new'] });
    expect(d.deps.save.mock.invocationCallOrder[0]).toBeLessThan(d.deps.send.mock.invocationCallOrder[0]);
    expect(d.memory()).toEqual({ day: '2026-11-27', week: '2026-11-23', start: '2026-11-27' });
  });

  it('never runs twice at once, so the cold open and the foreground event cannot both count', async () => {
    const d = device({}, { fresh: true });
    const count = activeCounter(d.deps);
    const both = await Promise.all([count(at(11, 27, 9)), count(at(11, 27, 9))]);
    expect(both.filter((names) => names.length > 0)).toHaveLength(1);
    expect(await count(at(11, 27, 23))).toEqual([]);
    expect(d.deps.load).toHaveBeenCalledTimes(1);
    expect(d.arrived).toHaveLength(3);
  });

  it('a return to the app while a send is stalled is not dropped: the claim goes once more when the send ends', async () => {
    const d = device({ day: '2026-11-26', week: '2026-11-23', start: BEFORE_COUNT });
    let release!: (answered: boolean) => void;
    d.deps.send.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    const count = activeCounter(d.deps);
    const first = count(at(11, 27, 10));
    await vi.waitFor(() => expect(d.deps.send).toHaveBeenCalledTimes(1));
    expect(await count(at(11, 27, 10))).toEqual([]); // the return, while the weak-signal send hangs
    release(false); // the stalled send gives up
    expect(await first).toEqual(['day.opened']); // and the claim runs again at once, answered this time
    expect(d.arrived).toEqual(['day.opened']);
    expect(d.memory()?.pending).toBeUndefined();
  });

  it('reads the clock as each claim starts, so the run after a stalled one counts the day it really runs on', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-27T23:59:50Z'));
      const d = device({ day: '2026-11-26', week: '2026-11-23', start: BEFORE_COUNT });
      let release!: (answered: boolean) => void;
      d.deps.send.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      );
      const count = activeCounter(d.deps);
      const first = count();
      await vi.waitFor(() => expect(d.deps.send).toHaveBeenCalledTimes(1));
      vi.setSystemTime(new Date('2026-11-28T00:00:10Z'));
      void count();
      release(false);
      // Friday's count could not be sent and Friday is over, so Saturday's own goes, once.
      expect(await first).toEqual(['day.opened']);
      expect(d.memory()).toEqual({ day: '2026-11-28', week: '2026-11-23', start: BEFORE_COUNT });
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts again on the next UTC day', async () => {
    const d = device({}, { fresh: true });
    const count = activeCounter(d.deps);
    await count(at(11, 27, 23));
    expect(await count(at(11, 28, 0))).toEqual(['day.opened']);
  });

  it('an open with no answer keeps its names owed, and the next foreground sends them, once', async () => {
    const d = device({}, { fresh: true });
    const count = activeCounter(d.deps);
    d.goOffline();
    expect(await count(at(11, 27, 8))).toEqual([]);
    expect(d.memory()?.pending).toEqual(['day.opened', 'week.opened', 'device.new']);
    // Still no signal at the next foreground: nothing lost, nothing doubled.
    expect(await count(at(11, 27, 9))).toEqual([]);
    d.goOnline();
    expect(await count(at(11, 27, 10))).toEqual(['day.opened', 'week.opened', 'device.new']);
    expect(d.memory()?.pending).toBeUndefined();
    expect(await count(at(11, 27, 11))).toEqual([]);
    expect(d.arrived).toEqual(['day.opened', 'week.opened', 'device.new']);
  });

  it('a new run of the app picks up what an offline run left owed', async () => {
    const d = device({}, { fresh: true });
    d.goOffline();
    await activeCounter(d.deps)(at(11, 27, 8));
    d.goOnline();
    expect(await activeCounter(d.deps)(at(11, 27, 18))).toEqual(['day.opened', 'week.opened', 'device.new']);
  });

  it('a day’s count left owed past midnight UTC is dropped for the new day’s own, never sent twice', async () => {
    const d = device({}, { fresh: true });
    d.goOffline();
    await activeCounter(d.deps)(at(11, 27, 23));
    d.goOnline();
    // The next day (a Saturday, the same week): today's day.opened once, and the week and the new install still owed.
    expect(await activeCounter(d.deps)(at(11, 28, 9))).toEqual(['day.opened', 'week.opened', 'device.new']);
    expect(d.arrived.filter((n) => n === 'day.opened')).toHaveLength(1);
  });

  it('a sixth-week return first made offline still arrives on a later day, outside its window', async () => {
    const d = device({ day: '2026-12-05', week: '2026-11-30', start: '2026-11-01' });
    d.goOffline();
    await activeCounter(d.deps)(at(12, 6)); // day 35
    expect(d.memory()).toMatchObject({ six: true, pending: ['day.opened', 'week.six.opened'] });
    d.goOnline();
    expect(await activeCounter(d.deps)(at(12, 20))).toEqual(['day.opened', 'week.opened', 'week.six.opened']); // day 49
  });

  it('keeps only what got no answer when some names arrive and some do not', async () => {
    const d = device({}, { fresh: true });
    d.deps.send.mockImplementation(async (name: ActiveName) => name !== 'week.opened');
    expect(await activeCounter(d.deps)(at(11, 27))).toEqual(['day.opened', 'device.new']);
    expect(d.memory()?.pending).toEqual(['week.opened']);
  });

  it('asks whether the install is new only while its start is undecided', async () => {
    const decided = device({ start: BEFORE_COUNT });
    await activeCounter(decided.deps)(at(11, 27));
    expect(decided.deps.isFresh).not.toHaveBeenCalled();
    const open = device({});
    await activeCounter(open.deps)(at(11, 27));
    expect(open.deps.isFresh).toHaveBeenCalledTimes(1);
  });

  it('an earlier run that already counted today sends nothing and writes nothing', async () => {
    const d = device({ day: '2026-11-27', week: '2026-11-23', start: BEFORE_COUNT });
    expect(await activeCounter(d.deps)(at(11, 27, 15))).toEqual([]);
    expect(d.deps.save).not.toHaveBeenCalled();
    expect(d.deps.send).not.toHaveBeenCalled();
  });

  it('sends nothing when the memory cannot be read or stored, or anything throws, and does not retry that day', async () => {
    const unreadable = device(null);
    const count = activeCounter(unreadable.deps);
    expect(await count(at(11, 27))).toEqual([]);
    expect(await count(at(11, 27, 20))).toEqual([]);
    expect(unreadable.deps.load).toHaveBeenCalledTimes(1);

    const unwritable = device({}, { saves: false });
    expect(await activeCounter(unwritable.deps)(at(11, 27))).toEqual([]);
    expect(unwritable.deps.send).not.toHaveBeenCalled();

    const broken = device({});
    broken.deps.load.mockRejectedValueOnce(new Error('disk'));
    const brokenCount = activeCounter(broken.deps);
    expect(await brokenCount(at(11, 27))).toEqual([]);
    expect(await brokenCount(at(11, 27, 12))).toEqual([]);
    expect(broken.deps.load).toHaveBeenCalledTimes(1);
    broken.deps.isFresh.mockRejectedValueOnce(new Error('disk'));
    expect(await activeCounter(broken.deps)(at(11, 27))).toEqual([]);
    expect(broken.deps.send).not.toHaveBeenCalled();
  });

  it('doubles only when the write after a send fails, and says so: the arrived names go again', async () => {
    const d = device({}, { fresh: true });
    // The second write, the one after the sends, fails.
    const real = d.deps.save.getMockImplementation()!;
    let writes = 0;
    d.deps.save.mockImplementation(async (next: ActiveMemory) => (++writes === 2 ? false : real(next)));
    await activeCounter(d.deps)(at(11, 27));
    expect(d.memory()?.pending).toEqual(['day.opened', 'week.opened', 'device.new']);
    await activeCounter(d.deps)(at(11, 27, 12));
    expect(d.arrived).toEqual(['day.opened', 'week.opened', 'device.new', 'day.opened', 'week.opened', 'device.new']);
  });

  it('runs the whole claim inside the cross-window lock when there is one', async () => {
    const d = device({}, { fresh: true });
    const order: string[] = [];
    const exclusive = async <T,>(run: () => Promise<T>): Promise<T> => {
      order.push('lock');
      const out = await run();
      order.push('unlock');
      return out;
    };
    d.deps.load.mockImplementation(async () => {
      order.push('load');
      return {};
    });
    await activeCounter({ ...d.deps, exclusive })(at(11, 27));
    expect(order.filter((step) => step === 'lock')).toHaveLength(1);
    expect(order[0]).toBe('lock');
    expect(order[1]).toBe('load');
    expect(order.at(-1)).toBe('unlock');
    expect(d.deps.send).toHaveBeenCalled();
  });
});

describe('isAutomatedBrowser', () => {
  const ANDROID_CHROME =
    'Mozilla/5.0 (Linux; Android 14; SM-S916B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const CUBOT = 'Mozilla/5.0 (Linux; Android 13; CUBOT KINGKONG 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

  it('knows a driven browser and the crawlers that run scripts', () => {
    expect(isAutomatedBrowser({ webdriver: true, userAgent: ANDROID_CHROME })).toBe(true);
    expect(isAutomatedBrowser({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).toBe(true);
    expect(isAutomatedBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/131.0.0.0 Safari/537.36' })).toBe(true);
    expect(isAutomatedBrowser({ userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' })).toBe(true);
  });

  it('never mistakes a person’s browser for one, the phone brand with "bot" in its name included', () => {
    for (const ua of [ANDROID_CHROME, IPHONE, CUBOT]) expect(isAutomatedBrowser({ webdriver: false, userAgent: ua }), ua).toBe(false);
    expect(isAutomatedBrowser(null)).toBe(false);
    expect(isAutomatedBrowser(undefined)).toBe(false);
    expect(isAutomatedBrowser({})).toBe(false);
  });
});

describe('the wiring', () => {
  it('the root layout draws the counter once, as a component that renders nothing, so the path never re-renders the navigator', () => {
    const layout = read('../app/_layout.tsx');
    expect(layout.match(/<ActiveCount \/>/g)).toHaveLength(1);
    expect(layout).not.toContain('useActiveCount');
    expect(layout).not.toContain('usePathname');
  });

  it('counts the foreground only, never the landing page at "/", never automation, and calls an unknown flag existing', () => {
    const src = read('./active-watch.ts');
    expect(src).toContain("const counts = Platform.OS !== 'web' || pathname !== '/';");
    expect(src).toContain("if (Platform.OS === 'web' && isAutomatedBrowser(");
    expect(src).toContain("if (AppState.currentState !== 'background') void countActive();");
    expect(src).toContain("if (state === 'active') void countActive();");
    expect(src).toContain('isFresh: async () => !(await loadOnboarded()),');
  });

  it('sends through trackSent, tries again when the web comes back online, and claims under one lock across windows', () => {
    const src = read('./active-watch.ts');
    expect(src).toContain('send: trackSent,');
    expect(src).toContain("window.addEventListener('online', tryNow);");
    expect(src).toContain("window.removeEventListener('online', tryNow);");
    expect(src).toContain("locks.request('doubledone.active', run)");
    expect(src).toContain('exclusive: acrossWindows,');
  });

  it('both privacy copies say opening the app is counted, and how, in the same words', () => {
    const flat = (s: string) => s.replace(/\{'\\n\\n'\}/g, ' ').replace(/’/g, "'").replace(/\s+/g, ' ');
    for (const path of ['../../public/privacy.html', '../app/privacy.tsx']) {
      const copy = flat(read(path));
      expect(copy, path).toContain('and a bare count when you open the app or use certain features.');
      expect(copy, path).toContain(
        'When you open the app, it tells our server that it was opened: once a day and once a week on each device, once when a device opens it for the very first time, and once more if that device opens it again in its sixth week.',
      );
      expect(copy, path).toContain('If one of these reaches us but our reply is lost on its way back, the app sends it again, so very rarely one arrives twice.');
      expect(copy, path).toContain("Days and weeks here run on UTC, the world's standard time, so a new one can begin partway through your own day.");
      expect(copy, path).toContain(
        'Nothing in these says which device sent them, so what we see is how many devices opened DoubleDone on a day or in a week, and how many were still opening it six weeks on.',
      );
      expect(copy, path).toContain('While only a few devices are new in a week, a sixth-week count could be matched back to one of them, and we never try to.');
      expect(copy, path).toContain(
        'To keep to these limits, the app keeps a small note on your device: the day it was first opened, the last day and week it counted, whether its sixth week has been counted, and any count still waiting to be sent. The note is never sent to us.',
      );
      expect(copy, path).toContain(
        "On Android, your phone's own backup can include it with the rest of the app's data, so a phone restored from that backup carries on as the same device.",
      );
      // The widget's own clause rightly keeps "at most once a day" (it never resends), so only the open counts' is checked.
      expect(copy, path).not.toContain('it was opened: at most once a day');
      expect(copy, path).not.toContain('The note never leaves your device');
      expect(copy, path).toContain("Reading the website's front page is not counted this way, only opening the app.");
      expect(copy, path).toContain('what we keep is how many of each arrived on each day, nothing finer.');
      expect(copy, path).not.toContain('we can never follow one');
    }
  });
});
