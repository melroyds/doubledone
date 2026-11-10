import { describe, expect, it } from 'vitest';

import { buildGlance, GLANCE_SETTLE_MS, glanceExpiry } from './glance';
import {
  dailyNudgeHour,
  emptyGlanceMemory,
  forgetGlanceSigns,
  forgetUnlandedGlance,
  glanceArrivalMissed,
  glanceData,
  type GlanceMemory,
  glanceRequestContent,
  type GlanceRefreshInput,
  type GlanceRefreshPlan,
  glanceTimeoutVerdict,
  halfDoneGlanceMemory,
  parseGlanceMemory,
  planGlanceRefresh,
  readShownGlance,
  serializeGlanceMemory,
  settleGlanceMemory,
  type ShownGlance,
  wipedGlanceMemory,
} from './glance-refresh';
import { GLANCE_ID } from './reminders-types';
import type { Task } from './tasks';

// Local-time constructors, as in glance.test.ts: 10 Nov 2026 unless told otherwise.
const at = (h: number, m = 0, d = 10, mo = 10, y = 2026) => new Date(y, mo, d, h, m);
const ISO = '2026-11-10';
const YESTERDAY = '2026-11-09';
const TOMORROW = '2026-11-11';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, title: id, done: false, createdAt: 1, updatedAt: 1, ...over };
}
const doneToday = (id: string) => task(id, { done: true, completedAt: at(8).getTime() });

/** A refresh with the glance chosen at 9, permitted, two open tasks, nothing showing and nothing remembered. */
function input(over: Partial<GlanceRefreshInput> = {}): GlanceRefreshInput {
  return {
    now: at(10),
    on: true,
    style: 'glance',
    hour: 9,
    permitted: true,
    tasks: [task('Water the plants'), task('Call the bank')],
    closedISO: null,
    heldId: null,
    shown: null,
    arrivalPending: false,
    nudgeScheduled: false,
    memory: emptyGlanceMemory(),
    ...over,
  };
}

/** What the shade shows after a post of `plan` (its day and key, as the data carries them). */
const shownFrom = (plan: GlanceRefreshPlan): ShownGlance => ({ day: plan.content.day, key: plan.content.key });

/** One whole refresh as the seam runs it, every phone call succeeding: plan, then settle what went out. */
function refresh(o: GlanceRefreshInput): { plan: GlanceRefreshPlan; memory: GlanceMemory } {
  const plan = planGlanceRefresh(o);
  const done = { posted: plan.action === 'post', scheduled: plan.arrival !== null, removed: plan.action === 'remove' };
  return { plan, memory: settleGlanceMemory(plan, o.now, done) };
}

describe('planGlanceRefresh: when the glance is not the chosen reminder', () => {
  it('takes down anything showing and plans nothing when the reminder is off, the nudge is chosen, or the hour leaves no window', () => {
    const shown = { day: ISO, key: 'k' };
    for (const over of [{ on: false }, { style: 'nudge' as const }, { hour: 21 }, { hour: 23 }]) {
      const plan = planGlanceRefresh(input({ ...over, shown, memory: { ...emptyGlanceMemory(), hour: 9, postedAt: at(9).getTime() } }));
      expect(plan.action).toBe('remove');
      expect(plan.arrival).toBeNull();
      expect(plan.memory).toEqual(emptyGlanceMemory());
    }
  });

  it('does nothing at all when nothing is showing', () => {
    const plan = planGlanceRefresh(input({ on: false }));
    expect(plan.action).toBe('none');
    expect(plan.arrival).toBeNull();
  });

  it('cancels the nudge only when the glance is the chosen style (it replaces the nudge, never both)', () => {
    expect(planGlanceRefresh(input({ nudgeScheduled: true })).cancelNudge).toBe(true);
    // Chosen with an hour too late for a window: the glance shows nothing, and still the nudge must not run.
    expect(planGlanceRefresh(input({ hour: 22, nudgeScheduled: true })).cancelNudge).toBe(true);
    expect(planGlanceRefresh(input({ style: 'nudge', nudgeScheduled: true })).cancelNudge).toBe(false);
    expect(planGlanceRefresh(input({ on: false, nudgeScheduled: true })).cancelNudge).toBe(false);
    expect(planGlanceRefresh(input({ nudgeScheduled: false })).cancelNudge).toBe(false);
  });
});

describe('planGlanceRefresh: posting, leaving it, replacing it', () => {
  it('posts today inside the window, with 21:30 today as its expiry, and plans tomorrow at the hour', () => {
    const { plan, memory } = refresh(input());
    expect(plan.action).toBe('post');
    expect(plan.content.day).toBe(ISO);
    expect(plan.content.collapsed).toBe('Water the plants, and more');
    expect(plan.expiresAt.getTime()).toBe(at(21, 30).getTime());
    expect(plan.arrival?.at.getTime()).toBe(at(9, 0, 11).getTime());
    expect(plan.arrival?.content.day).toBe(TOMORROW);
    expect(memory).toEqual({ hour: 9, postedAt: at(10).getTime(), seenAt: null, arrivalAt: at(9, 0, 11).getTime(), dismissedOn: null });
  });

  it('before the window posts nothing and plans today at the hour, with today computed now', () => {
    const { plan } = refresh(input({ now: at(7) }));
    expect(plan.action).toBe('none');
    expect(plan.arrival?.at.getTime()).toBe(at(9).getTime());
    expect(plan.arrival?.content.day).toBe(ISO);
  });

  it('leaves an unchanged glance alone (no re-post) and notes it was seen', () => {
    const first = refresh(input());
    const plan = planGlanceRefresh(input({ now: at(11), shown: shownFrom(first.plan), memory: first.memory }));
    expect(plan.action).toBe('none');
    expect(plan.memory.seenAt).toBe(at(11).getTime());
  });

  it('replaces it in place when what it says changed', () => {
    const first = refresh(input());
    const plan = planGlanceRefresh(input({ now: at(11), tasks: [task('Call the bank')], shown: shownFrom(first.plan), memory: first.memory }));
    expect(plan.action).toBe('post');
    expect(plan.content.collapsed).toBe('Call the bank');
  });

  it('replaces a glance left from yesterday, never keeps it', () => {
    const plan = planGlanceRefresh(input({ shown: { day: YESTERDAY, key: 'old' }, memory: { ...emptyGlanceMemory(), hour: 9 } }));
    expect(plan.action).toBe('post');
    expect(plan.memory.seenAt).toBeNull(); // yesterday's being up says nothing about today
  });

  it("takes yesterday's down before the window opens, and comes at the hour", () => {
    const plan = planGlanceRefresh(input({ now: at(7), shown: { day: YESTERDAY, key: 'old' }, memory: { ...emptyGlanceMemory(), hour: 9 } }));
    expect(plan.action).toBe('remove');
    expect(plan.arrival?.at.getTime()).toBe(at(9).getTime());
  });

  it('takes it down at 21:30, where the window ends, even if its own expiry failed', () => {
    const first = refresh(input());
    const plan = planGlanceRefresh(input({ now: at(21, 30), shown: shownFrom(first.plan), memory: first.memory }));
    expect(plan.action).toBe('remove');
    expect(plan.arrival?.content.day).toBe(TOMORROW);
  });
});

describe('planGlanceRefresh: it leaves when the day is done, and comes back if that changes', () => {
  it('leaves on Goodnight, and Reopen brings it back the same day (the app took it down, nobody swiped)', () => {
    const first = refresh(input());
    const closed = refresh(input({ now: at(20), closedISO: ISO, shown: shownFrom(first.plan), memory: first.memory }));
    expect(closed.plan.action).toBe('remove');
    expect(closed.plan.arrival?.content.day).toBe(TOMORROW);
    expect(closed.memory.postedAt).toBeNull(); // the take-down forgot every sign it went up
    expect(closed.memory.seenAt).toBeNull();
    const reopened = refresh(input({ now: at(20, 5), closedISO: null, shown: null, memory: closed.memory }));
    expect(reopened.plan.action).toBe('post');
    expect(reopened.memory.dismissedOn).toBeNull();
  });

  it('leaves when every task is done, and a task added afterwards brings it back that day', () => {
    const first = refresh(input());
    const done = refresh(input({ now: at(12), tasks: [doneToday('a'), doneToday('b')], shown: shownFrom(first.plan), memory: first.memory }));
    expect(done.plan.action).toBe('remove');
    expect(done.plan.content.state).toBe('done');
    // The look again ten seconds after the take-down finds nothing showing and nothing to show: still no verdict.
    const settled = refresh(input({ now: new Date(at(12).getTime() + GLANCE_SETTLE_MS), tasks: [doneToday('a'), doneToday('b')], memory: done.memory }));
    expect(settled.plan.action).toBe('none');
    expect(settled.memory.dismissedOn).toBeNull();
    const added = refresh(input({ now: at(13), tasks: [doneToday('a'), task('New thing')], shown: null, memory: settled.memory }));
    expect(added.plan.action).toBe('post');
    expect(added.plan.content.collapsed).toBe('New thing');
  });

  it('an untick after the last tick brings it back that day', () => {
    const first = refresh(input({ tasks: [task('only')] }));
    const done = refresh(input({ now: at(12), tasks: [doneToday('only')], shown: shownFrom(first.plan), memory: first.memory }));
    expect(done.plan.action).toBe('remove');
    expect(refresh(input({ now: at(12, 1), tasks: [task('only')], shown: null, memory: done.memory })).plan.action).toBe('post');
  });

  it('once back, a swipe still means not today', () => {
    const first = refresh(input());
    const closed = refresh(input({ now: at(14), closedISO: ISO, shown: shownFrom(first.plan), memory: first.memory }));
    const reopened = refresh(input({ now: at(15), shown: null, memory: closed.memory }));
    expect(reopened.plan.action).toBe('post');
    const swiped = refresh(input({ now: at(16), shown: null, memory: reopened.memory }));
    expect(swiped.plan.action).toBe('none');
    expect(swiped.memory.dismissedOn).toBe(ISO);
  });

  it('leaves when the day is empty', () => {
    const first = refresh(input());
    expect(planGlanceRefresh(input({ now: at(12), tasks: [], shown: shownFrom(first.plan), memory: first.memory })).action).toBe('remove');
  });

  it('a day empty at the hour never had it up, so a task added later still brings it', () => {
    const morning = refresh(input({ now: at(9, 30), tasks: [] }));
    expect(morning.plan.action).toBe('none');
    expect(planGlanceRefresh(input({ now: at(11), memory: morning.memory })).action).toBe('post');
  });

  it('plans no arrival for a tomorrow with nothing to show', () => {
    // Due on Tuesdays only (10 Nov 2026 is a Tuesday): up today, nothing on Wednesday. An undone one-off would carry
    // over, so it would not do here.
    const tuesdays = task('Bins out', { recurrence: { kind: 'weekly', weekdays: [2] } });
    const plan = planGlanceRefresh(input({ tasks: [tuesdays] }));
    expect(plan.action).toBe('post');
    expect(plan.arrival).toBeNull();
  });
});

describe('planGlanceRefresh: a swipe means not today', () => {
  it('a glance seen showing and then missing was put away: no re-post today, tomorrow at the hour', () => {
    const first = refresh(input({ now: at(9, 5) }));
    const seen = refresh(input({ now: at(9, 30), shown: shownFrom(first.plan), memory: first.memory }));
    const swiped = refresh(input({ now: at(12), shown: null, memory: seen.memory }));
    expect(swiped.plan.action).toBe('none');
    expect(swiped.memory.dismissedOn).toBe(ISO);
    expect(swiped.plan.arrival?.at.getTime()).toBe(at(9, 0, 11).getTime());
  });

  it('the verdict holds all day, even after the memory forgot the post', () => {
    const plan = planGlanceRefresh(input({ now: at(15), memory: { ...emptyGlanceMemory(), hour: 9, dismissedOn: ISO } }));
    expect(plan.action).toBe('none');
    expect(plan.memory.dismissedOn).toBe(ISO);
  });

  it('a post still landing is not a swipe: re-posted rather than put away', () => {
    const first = refresh(input({ now: at(10) }));
    const soon = new Date(at(10).getTime() + GLANCE_SETTLE_MS - 1000);
    expect(planGlanceRefresh(input({ now: soon, shown: null, memory: first.memory })).action).toBe('post');
    const later = new Date(at(10).getTime() + GLANCE_SETTLE_MS);
    expect(planGlanceRefresh(input({ now: later, shown: null, memory: first.memory })).action).toBe('none');
  });

  it("an arrival that fired with the app closed and is gone by the time the app opens was put away (or rebooted away)", () => {
    const night = refresh(input({ now: at(22, 0, 9) })); // last night planned this morning's arrival
    expect(night.memory.arrivalAt).toBe(at(9).getTime());
    const plan = planGlanceRefresh(input({ now: at(12), shown: null, arrivalPending: false, memory: night.memory }));
    expect(plan.action).toBe('none');
    expect(plan.memory.dismissedOn).toBe(ISO);
  });

  it('an arrival still waiting to fire (a late, inexact alarm) is not a swipe: the app posts it now', () => {
    const night = refresh(input({ now: at(22, 0, 9) }));
    const plan = planGlanceRefresh(input({ now: at(12), shown: null, arrivalPending: true, memory: night.memory }));
    expect(plan.action).toBe('post');
    expect(plan.arrival?.content.day).toBe(TOMORROW);
    expect(plan.memory.arrivalAt).toBeNull(); // the late one is cancelled by the seam before the post
  });

  it('a new hour is a new choice: it starts fresh and can show at once', () => {
    const plan = planGlanceRefresh(input({ now: at(11), hour: 8, memory: { ...emptyGlanceMemory(), hour: 9, seenAt: at(9, 30).getTime(), dismissedOn: ISO } }));
    expect(plan.action).toBe('post');
    expect(plan.memory.hour).toBe(8);
    expect(plan.memory.dismissedOn).toBeNull();
  });

  it("forgets an older day's verdict", () => {
    const plan = planGlanceRefresh(input({ memory: { ...emptyGlanceMemory(), hour: 9, dismissedOn: YESTERDAY } }));
    expect(plan.action).toBe('post');
    expect(plan.memory.dismissedOn).toBeNull();
  });
});

describe('planGlanceRefresh: without permission', () => {
  it('posts nothing and schedules nothing, so a refusal is never mistaken for a swipe', () => {
    const { plan, memory } = refresh(input({ permitted: false }));
    expect(plan.action).toBe('none');
    expect(plan.arrival).toBeNull();
    expect(memory.postedAt).toBeNull();
    // Once allowed again, the next refresh posts at once.
    expect(planGlanceRefresh(input({ now: at(10, 5), memory })).action).toBe('post');
  });

  it('still takes down what should not be showing', () => {
    expect(planGlanceRefresh(input({ permitted: false, closedISO: ISO, shown: { day: ISO, key: 'k' } })).action).toBe('remove');
  });
});

describe('settleGlanceMemory', () => {
  it('counts the post and the arrival only when each went out', () => {
    const plan = planGlanceRefresh(input());
    expect(settleGlanceMemory(plan, at(10), { posted: false, scheduled: false })).toEqual({ ...plan.memory, postedAt: null, arrivalAt: null });
    expect(settleGlanceMemory(plan, at(10), { posted: true, scheduled: true })).toEqual({ ...plan.memory, postedAt: at(10).getTime(), arrivalAt: at(9, 0, 11).getTime() });
  });

  it('a take-down forgets every sign it went up, and still records the next arrival', () => {
    const first = refresh(input());
    const plan = planGlanceRefresh(input({ now: at(12), closedISO: ISO, shown: shownFrom(first.plan), memory: first.memory }));
    expect(plan.action).toBe('remove');
    const m = settleGlanceMemory(plan, at(12), { posted: false, scheduled: true, removed: true });
    expect(m.postedAt).toBeNull();
    expect(m.seenAt).toBeNull();
    expect(m.arrivalAt).toBe(at(9, 0, 11).getTime());
    expect(m.dismissedOn).toBeNull();
    expect(m.hour).toBe(9);
  });

  it('forgetGlanceSigns keeps the hour and a verdict already made (a swipe judged today still means not today)', () => {
    expect(forgetGlanceSigns({ hour: 9, postedAt: 1, seenAt: 2, arrivalAt: 3, dismissedOn: ISO })).toEqual({
      hour: 9,
      postedAt: null,
      seenAt: null,
      arrivalAt: null,
      dismissedOn: ISO,
    });
  });

  // An hour moved later takes the showing glance down before the new window; the new hour's arrival then fires late
  // (no "Alarms & reminders") as the app opens and the handler drops it. With a sighting left over from before the
  // take-down, the forget kept the verdict and the retry posted nothing, so the day was lost without a swipe.
  it('a late arrival after a take-down, dropped by the handler, still gets its one retry', () => {
    const down = refresh(input({ now: at(8), shown: { day: ISO, key: 'old' }, memory: { ...emptyGlanceMemory(), hour: 9 } }));
    expect(down.plan.action).toBe('remove');
    expect(down.memory.seenAt).toBeNull();
    expect(down.memory.arrivalAt).toBe(at(9).getTime());
    const open = refresh(input({ now: at(9, 40), shown: null, arrivalPending: false, memory: down.memory }));
    expect(open.memory.dismissedOn).toBe(ISO);
    const forgot = forgetUnlandedGlance(open.memory, at(9, 40).getTime() + 3000);
    expect(forgot.dismissedOn).toBeNull();
    expect(planGlanceRefresh(input({ now: new Date(at(9, 40).getTime() + 4000), shown: null, memory: forgot })).action).toBe('post');
  });

  it('keeps an earlier post when this refresh posted nothing', () => {
    const first = refresh(input());
    const plan = planGlanceRefresh(input({ now: at(11), shown: shownFrom(first.plan), memory: first.memory }));
    expect(settleGlanceMemory(plan, at(11), { posted: false, scheduled: true }).postedAt).toBe(at(10).getTime());
  });

  it('a memory with nothing chosen stays empty whatever went out', () => {
    const plan = planGlanceRefresh(input({ on: false }));
    expect(settleGlanceMemory(plan, at(10), { posted: true, scheduled: true })).toEqual(emptyGlanceMemory());
  });
});

describe('the account wipe and a half-done Off', () => {
  const seen: GlanceMemory = { hour: 9, postedAt: at(9).getTime(), seenAt: at(10).getTime(), arrivalAt: at(9, 0, 11).getTime(), dismissedOn: null };

  it('a glance showing at the wipe was taken down by the app: every sign goes, and a verdict the shade overturned', () => {
    const forgotten = { hour: 9, postedAt: null, seenAt: null, arrivalAt: null, dismissedOn: null };
    expect(wipedGlanceMemory({ ...seen, dismissedOn: ISO }, { day: ISO, key: 'k' }, at(11).getTime())).toEqual(forgotten);
    expect(wipedGlanceMemory({ ...seen, dismissedOn: ISO }, { day: null, key: null }, at(11).getTime())).toEqual(forgotten);
  });

  it("yesterday's glance showing at the wipe does not overturn today's verdict", () => {
    expect(wipedGlanceMemory({ ...seen, dismissedOn: ISO }, { day: YESTERDAY, key: 'k' }, at(11).getTime()).dismissedOn).toBe(ISO);
  });

  it('an unreadable shade counts as showing for the signs, but keeps a verdict already made', () => {
    expect(wipedGlanceMemory({ ...seen, dismissedOn: ISO }, 'unknown', at(11).getTime())).toEqual({
      hour: 9,
      postedAt: null,
      seenAt: null,
      arrivalAt: null,
      dismissedOn: ISO,
    });
  });

  it('a glance not showing keeps its signs, so a swipe nobody judged yet still means not today, but never the cancelled arrival', () => {
    const kept = wipedGlanceMemory(seen, null, at(11).getTime());
    expect(kept).toEqual({ ...seen, arrivalAt: null });
    expect(planGlanceRefresh(input({ now: at(11, 30), shown: null, memory: kept })).action).toBe('none');
  });

  it('a post still landing at the wipe can never have been swiped, so it is not kept', () => {
    const landing = { ...seen, seenAt: null, postedAt: at(11).getTime() - 300 };
    const m = wipedGlanceMemory(landing, null, at(11).getTime());
    expect(m.postedAt).toBeNull();
    expect(planGlanceRefresh(input({ now: at(11, 30), shown: null, memory: m })).action).toBe('post');
  });

  it('a memory with nothing set up stays as it was', () => {
    expect(wipedGlanceMemory(emptyGlanceMemory(), { day: ISO, key: 'k' }, at(11).getTime())).toEqual(emptyGlanceMemory());
  });

  it('a half-done Off forgets every sign and any verdict, so choosing it again the same day shows it at once', () => {
    const half = halfDoneGlanceMemory({ ...seen, dismissedOn: ISO });
    expect(half).toEqual({ hour: 9, postedAt: null, seenAt: null, arrivalAt: null, dismissedOn: null });
    expect(planGlanceRefresh(input({ now: at(12, 5), shown: null, memory: half })).action).toBe('post');
    // Kept as it was, the old sighting would read as a swipe.
    expect(planGlanceRefresh(input({ now: at(12, 5), shown: null, memory: seen })).action).toBe('none');
  });
});

describe('the stored memory', () => {
  it('round-trips', () => {
    const m: GlanceMemory = { hour: 9, postedAt: 1, seenAt: 2, arrivalAt: 3, dismissedOn: ISO };
    expect(parseGlanceMemory(serializeGlanceMemory(m))).toEqual(m);
    // A field this version does not keep (an earlier draft's takenDownAt) is read past, never carried.
    expect(parseGlanceMemory(JSON.stringify({ ...m, takenDownAt: 4 }))).toEqual(m);
    expect(parseGlanceMemory(serializeGlanceMemory(emptyGlanceMemory()))).toEqual(emptyGlanceMemory());
  });

  it('reads anything unreadable as empty, field by field, never a crash', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', 'null', '42', '"x"']) expect(parseGlanceMemory(raw)).toEqual(emptyGlanceMemory());
    expect(parseGlanceMemory(JSON.stringify({ hour: 'nine', postedAt: 'x', seenAt: Infinity, arrivalAt: null, dismissedOn: 'Tuesday' }))).toEqual(emptyGlanceMemory());
    expect(parseGlanceMemory(JSON.stringify({ hour: 30, postedAt: 5 }))).toEqual({ ...emptyGlanceMemory(), hour: 23, postedAt: 5 });
  });

  it('hands out a fresh empty memory each time', () => {
    const a = emptyGlanceMemory();
    a.hour = 9;
    expect(emptyGlanceMemory().hour).toBeNull();
  });
});

describe('readShownGlance', () => {
  it('reads the day and the key from the data, and nothing else', () => {
    expect(readShownGlance({ glance: true, day: ISO, key: 'k', expiresAtMs: 1 })).toEqual({ day: ISO, key: 'k' });
    for (const data of [null, undefined, 'x', 5, {}, { day: 5, key: null }]) expect(readShownGlance(data)).toEqual({ day: null, key: null });
  });
});

describe('the request a glance is posted with', () => {
  const content = buildGlance([task('Water the plants'), task('Call the bank'), task('a'), task('b'), task('c')], at(10), null);
  const expiresAt = glanceExpiry(at(10));

  it('is sticky, never auto-dismissed (a tap opens the app and it stays), silent and at default priority', () => {
    const req = glanceRequestContent(content, expiresAt);
    expect(req.sticky).toBe(true);
    expect(req.autoDismiss).toBe(false);
    expect(req.sound).toBe(false);
    expect(req.priority).toBe('default');
    expect(req.vibrate).toBeUndefined();
    expect(req.badge).toBeUndefined();
  });

  it('says "Today" over the collapsed line, and carries the expanded list for the patched builder', () => {
    const req = glanceRequestContent(content, expiresAt);
    expect(req.title).toBe('Today');
    expect(req.body).toBe('Water the plants, and more');
    expect(req.data).toEqual({
      glance: true,
      day: ISO,
      key: content.key,
      expiresAtMs: at(21, 30).getTime(),
      bigText: 'Water the plants\nCall the bank\na\nb\nand more',
    });
  });

  it('marks only the retry as a retry', () => {
    expect(glanceData(content, expiresAt)).not.toHaveProperty('retry');
    expect(glanceData(content, expiresAt, true).retry).toBe(true);
    expect(glanceRequestContent(content, expiresAt, true).data).toMatchObject({ retry: true });
  });

  it('never carries a digit in what it shows', () => {
    const req = glanceRequestContent(content, expiresAt);
    expect(`${req.title} ${req.body} ${(req.data as { bigText: string }).bigText}`).not.toMatch(/\d/);
  });
});

describe('glanceTimeoutVerdict and forgetUnlandedGlance (a foreground handler that timed out)', () => {
  const timeout = (data: unknown) => ({ code: 'ERR_NOTIFICATION_TIMEOUT', info: { id: GLANCE_ID, notification: { request: { content: { data } } } } });

  it('retries a glance timeout once, and only forgets when the timed-out post was the retry', () => {
    expect(glanceTimeoutVerdict(GLANCE_ID, timeout({ glance: true }))).toBe('retry');
    expect(glanceTimeoutVerdict(GLANCE_ID, timeout({ glance: true, retry: true }))).toBe('forget');
    expect(glanceTimeoutVerdict(GLANCE_ID, { code: 'ERR_NOTIFICATION_TIMEOUT' })).toBe('retry');
  });

  it('ignores every other notification and every other error', () => {
    expect(glanceTimeoutVerdict('doubledone-daily', timeout({}))).toBeNull();
    expect(glanceTimeoutVerdict(GLANCE_ID, new Error('already handled'))).toBeNull();
    expect(glanceTimeoutVerdict(GLANCE_ID, { code: 'ERR_NOTIFICATION_PRESENTATION_FAILED' })).toBeNull();
    expect(glanceTimeoutVerdict(GLANCE_ID, null)).toBeNull();
    expect(glanceTimeoutVerdict(GLANCE_ID, 'timeout')).toBeNull();
  });

  it('forgets the post and the fired arrival, keeps what was seen, the verdict and a future arrival', () => {
    const now = at(12).getTime();
    const m: GlanceMemory = { hour: 9, postedAt: at(12).getTime() - 3000, seenAt: at(10).getTime(), arrivalAt: at(9).getTime(), dismissedOn: null };
    expect(forgetUnlandedGlance(m, now)).toEqual({ ...m, postedAt: null, arrivalAt: null });
    const future = { ...m, arrivalAt: at(9, 0, 11).getTime() };
    expect(forgetUnlandedGlance(future, now).arrivalAt).toBe(at(9, 0, 11).getTime());
  });

  it("drops today's verdict unless today's glance was seen showing (then the verdict was a fact)", () => {
    const now = at(12).getTime();
    const judged: GlanceMemory = { ...emptyGlanceMemory(), hour: 9, arrivalAt: at(9, 0, 11).getTime(), dismissedOn: ISO };
    expect(forgetUnlandedGlance(judged, now).dismissedOn).toBeNull();
    expect(forgetUnlandedGlance({ ...judged, seenAt: at(20, 0, 9).getTime() }, now).dismissedOn).toBeNull(); // seen yesterday
    expect(forgetUnlandedGlance({ ...judged, seenAt: at(10).getTime() }, now).dismissedOn).toBe(ISO); // seen today
    expect(forgetUnlandedGlance({ ...judged, dismissedOn: YESTERDAY }, now).dismissedOn).toBe(YESTERDAY); // not today's
  });

  it('so a dropped arrival or post is posted again, never read as a swipe', () => {
    const night = refresh(input({ now: at(22, 0, 9) }));
    const fired = at(9).getTime(); // this morning's arrival fired with the app open, and the handler timed out
    const later = new Date(fired + 3 * GLANCE_SETTLE_MS);
    // Without the forget, its absence reads as put away. With it, the retry posts.
    expect(planGlanceRefresh(input({ now: later, shown: null, memory: night.memory })).action).toBe('none');
    const dropped = forgetUnlandedGlance(night.memory, fired + 3000);
    expect(planGlanceRefresh(input({ now: later, shown: null, memory: dropped })).action).toBe('post');
  });
});

// Android 14+ without "Alarms & reminders" (its default) delivers the arrival inexactly and often releases it as the
// app comes forward. Hour 9, the app first opened at 9:40: the alarm fires during the cold open, and the cold open's
// refresh can read the shade while that arrival is still in the foreground handler.
describe('a late arrival still in the foreground handler when the cold open looks', () => {
  const t0 = at(9, 40).getTime(); // the late alarm fires
  const after = (ms: number) => new Date(t0 + ms);
  const lastNight = () => refresh(input({ now: at(22, 0, 9) })); // planned this morning's arrival at 9

  it('the timeout clears the verdict its absence caused, and the one retry posts', () => {
    const r1 = refresh(input({ now: after(1000), shown: null, arrivalPending: false, memory: lastNight().memory }));
    expect(r1.plan.action).toBe('none'); // judged by its own absence, for now
    expect(r1.memory.dismissedOn).toBe(ISO);
    const dropped = forgetUnlandedGlance(r1.memory, t0 + 3000); // the handler timed out
    expect(dropped.dismissedOn).toBeNull();
    const retry = refresh(input({ now: after(4000), shown: null, arrivalPending: true, memory: dropped }));
    expect(retry.plan.action).toBe('post');
    expect(retry.plan.content.day).toBe(ISO);
    expect(retry.memory.dismissedOn).toBeNull();
  });

  it('a delivery that lands after that verdict stays up, is never taken down for it, and the verdict goes', () => {
    const night = lastNight();
    const r1 = refresh(input({ now: after(1000), shown: null, memory: night.memory }));
    const landed: ShownGlance = { day: ISO, key: night.plan.arrival!.content.key };
    const r2 = refresh(input({ now: after(60_000), shown: landed, memory: r1.memory }));
    expect(r2.plan.action).toBe('none'); // the same words are already up
    expect(r2.memory.dismissedOn).toBeNull();
    expect(r2.memory.seenAt).toBe(t0 + 60_000);
    // A tick afterwards updates it in place, never removes it.
    const r3 = planGlanceRefresh(input({ now: after(120_000), tasks: [task('Call the bank')], shown: landed, memory: r2.memory }));
    expect(r3.action).toBe('post');
    // And a real swipe after that still counts at once.
    expect(planGlanceRefresh(input({ now: after(180_000), shown: null, memory: r2.memory })).memory.dismissedOn).toBe(ISO);
  });
});

describe('glanceArrivalMissed (an arrival scheduled in the last moments before the hour)', () => {
  it('is missed when the phone took it at or after its moment, and fine while it is still ahead', () => {
    const plan = planGlanceRefresh(input({ now: new Date(at(9).getTime() - 100), shown: null }));
    expect(plan.arrival?.at.getTime()).toBe(at(9).getTime());
    expect(glanceArrivalMissed(plan, at(9).getTime() - 1)).toBe(false);
    expect(glanceArrivalMissed(plan, at(9).getTime())).toBe(true);
    expect(glanceArrivalMissed(plan, at(9).getTime() + 50)).toBe(true);
    expect(glanceArrivalMissed(planGlanceRefresh(input({ on: false })), at(9).getTime())).toBe(false); // nothing planned
  });

  it('once not recorded, the next refresh posts it instead of reading it as fired and swiped', () => {
    const before = new Date(at(9).getTime() - 100);
    const plan = planGlanceRefresh(input({ now: before, shown: null }));
    expect(plan.action).toBe('none'); // the window was not open yet
    const memory = settleGlanceMemory(plan, before, { posted: false, scheduled: false });
    expect(memory.arrivalAt).toBeNull();
    expect(planGlanceRefresh(input({ now: new Date(at(9).getTime() + 1500), shown: null, memory })).action).toBe('post');
    // Recorded as if it would fire, the same refresh would have lost the day.
    const recorded = settleGlanceMemory(plan, before, { posted: false, scheduled: true });
    expect(planGlanceRefresh(input({ now: new Date(at(9).getTime() + GLANCE_SETTLE_MS + 1500), shown: null, memory: recorded })).action).toBe('none');
  });
});

describe('dailyNudgeHour (the glance replaces the nudge, never both)', () => {
  it('re-arms the nudge only when the reminder is on and the nudge is its style', () => {
    expect(dailyNudgeHour(true, 'nudge', 9)).toBe(9);
    expect(dailyNudgeHour(true, 'glance', 9)).toBeNull();
    expect(dailyNudgeHour(false, 'nudge', 9)).toBeNull();
    expect(dailyNudgeHour(false, 'glance', 9)).toBeNull();
  });

  it('keeps the hour valid', () => {
    expect(dailyNudgeHour(true, 'nudge', 30)).toBe(23);
  });
});
