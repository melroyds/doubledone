import { describe, expect, it } from 'vitest';

import { toISODate } from './day';
import { buildGlance, GLANCE_SETTLE_MS, glanceAction, glanceExpiry, inGlanceWindow } from './glance';
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
  glanceStatus,
  type GlanceStatusInput,
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
import { formatReminderTime, GLANCE_ID } from './reminders-types';
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

/** A refresh with the glance chosen at 9, permitted (its category on), two open tasks, nothing showing and nothing
 *  remembered. */
function input(over: Partial<GlanceRefreshInput> = {}): GlanceRefreshInput {
  return {
    now: at(10),
    on: true,
    style: 'glance',
    hour: 9,
    permitted: true,
    channelOff: false,
    tasks: [task('Water the plants'), task('Call the bank')],
    closedISO: null,
    heldId: null,
    shown: null,
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

  // Its own expiry takes it down at 21:30 now that the patched builder ships, with no refresh to see it go. Seen at
  // 20:00 and gone at 21:45 is the window's end, never a swipe: no verdict, and Settings names tomorrow's arrival.
  it("gone after 21:30 by its own expiry is no swipe: no verdict, and the line says it comes tomorrow", () => {
    const seen = refresh(input({ now: at(20), shown: { day: ISO, key: 'k' }, memory: { ...emptyGlanceMemory(), hour: 9, postedAt: at(19).getTime() } }));
    expect(seen.memory.seenAt).toBe(at(20).getTime());
    const after = refresh(input({ now: at(21, 45), shown: null, memory: seen.memory }));
    expect(after.plan.action).toBe('none');
    expect(after.plan.memory.dismissedOn).toBeNull();
    expect(after.plan.arrival?.at.getTime()).toBe(at(9, 0, 11).getTime());
    const line = glanceStatus({ now: at(21, 45), hour: 9, memory: seen.memory, shown: null, tasks: input().tasks, closedISO: null, permitted: true, channelOff: false, exactAlarms: true });
    expect(line?.kind).toBe('tomorrow');
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

  // The 2026-11-12 no-show, as it happened: chosen at 23:30 with the hour at 8, nothing at 8:00 with the app closed,
  // nothing after opening at 11:00. This morning's arrival had left the schedule without reaching the shade (an
  // inexact alarm released and dropped in the app's cold start, or a restart that discarded it), and the open read its
  // absence as a swipe and kept the glance away all day. Nobody saw it, so it counts for nothing: the open posts it.
  it("last night's arrival gone, nothing showing and never seen: the open posts it, and it stays for the day", () => {
    const night = refresh(input({ now: at(23, 30, 9), hour: 8 }));
    expect(night.plan.action).toBe('none'); // after 9:30 pm: nothing tonight
    expect(night.memory.arrivalAt).toBe(at(8).getTime());
    const open = refresh(input({ now: at(11), hour: 8, shown: null, memory: night.memory }));
    expect(open.plan.action).toBe('post');
    expect(open.plan.content.day).toBe(ISO);
    expect(open.memory.dismissedOn).toBeNull();
    expect(open.plan.arrival?.at.getTime()).toBe(at(8, 0, 11).getTime());
    // The look again sees it up, and a task added in the afternoon updates it in place: no lost day.
    const look = refresh(input({ now: new Date(at(11).getTime() + GLANCE_SETTLE_MS), hour: 8, shown: shownFrom(open.plan), memory: open.memory }));
    expect(look.plan.action).toBe('none');
    expect(look.memory.seenAt).toBe(at(11).getTime() + GLANCE_SETTLE_MS);
    const tasks = [...input().tasks, task('New thing')];
    const added = refresh(input({ now: at(14), hour: 8, tasks, shown: shownFrom(open.plan), memory: look.memory }));
    expect(added.plan.action).toBe('post');
    expect(added.memory.dismissedOn).toBeNull();
  });

  it('an arrival nobody saw is posted by the open whatever became of it, and the seam cancels a late one first', () => {
    // Still held (a late, inexact alarm), fired unseen, or discarded by a restart: the open's inputs are the same.
    const night = refresh(input({ now: at(22, 0, 9) }));
    const plan = planGlanceRefresh(input({ now: at(12), shown: null, memory: night.memory }));
    expect(plan.action).toBe('post');
    expect(plan.arrival?.content.day).toBe(TOMORROW);
    expect(plan.memory.arrivalAt).toBeNull(); // every refresh cancels the old arrival before it posts
  });

  // The cost, accepted 2026-11-12: a swipe made before any refresh has seen the glance looks exactly like a lost arrival,
  // so that glance comes back once, at the next refresh. A second swipe sticks, because by then a refresh has seen it.
  // In practice that is a swipe before the day's first open (here), or one that arrives with the app open (no refresh
  // runs for an arrival) and is swiped before the next save or return to the app (the next test).
  it('the accepted cost: swiped before the first open, it comes back once at the open, and a second swipe sticks', () => {
    const night = refresh(input({ now: at(22, 0, 9) }));
    // It arrived at 9:00 with the app closed and was swiped at 9:05. Nothing saw either.
    const open = refresh(input({ now: at(12), shown: null, memory: night.memory }));
    expect(open.plan.action).toBe('post'); // back, once
    const look = refresh(input({ now: new Date(at(12).getTime() + GLANCE_SETTLE_MS), shown: shownFrom(open.plan), memory: open.memory }));
    expect(look.memory.seenAt).toBe(at(12).getTime() + GLANCE_SETTLE_MS);
    const swipedAgain = refresh(input({ now: at(12, 30), shown: null, memory: look.memory }));
    expect(swipedAgain.plan.action).toBe('none');
    expect(swipedAgain.memory.dismissedOn).toBe(ISO);
    expect(swipedAgain.plan.arrival?.at.getTime()).toBe(at(9, 0, 11).getTime());
    expect(refresh(input({ now: at(17), shown: null, memory: swipedAgain.memory })).plan.action).toBe('none'); // all day
  });

  it('the same cost with the app open at the hour: no refresh runs for the arrival, so a swipe before the next save comes back once', () => {
    const night = refresh(input({ now: at(22, 0, 9) }));
    // DoubleDone is open at 9:00, the arrival lands and is swiped at 9:05; the next refresh is a save at 9:10.
    const save = refresh(input({ now: at(9, 10), shown: null, memory: night.memory }));
    expect(save.plan.action).toBe('post');
    // Once a refresh has seen it, a swipe sticks.
    const look = refresh(input({ now: new Date(at(9, 10).getTime() + GLANCE_SETTLE_MS), shown: shownFrom(save.plan), memory: save.memory }));
    expect(refresh(input({ now: at(9, 30), shown: null, memory: look.memory })).plan.action).toBe('none');
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
    expect(planGlanceRefresh(input({ channelOff: true, closedISO: ISO, shown: { day: ISO, key: 'k' } })).action).toBe('remove');
  });

  // Its category turned off in Android's settings: Android drops every post to it, so nothing is posted and nothing is
  // counted as posted. The next arrival stays armed (dropped unseen while off, which counts for nothing), so turned back
  // on in Android's settings it comes at the hour without the app being opened first.
  it("with its category off it posts nothing and counts nothing, and still arms the next arrival", () => {
    const off = refresh(input({ channelOff: true }));
    expect(off.plan.action).toBe('none');
    expect(off.memory.postedAt).toBeNull();
    expect(off.plan.arrival?.at.getTime()).toBe(at(9, 0, 11).getTime());
    expect(off.memory.arrivalAt).toBe(at(9, 0, 11).getTime());
    // Back on: the next refresh posts at once, and an arrival that fired unseen while it was off counts for nothing.
    expect(planGlanceRefresh(input({ now: at(10, 5), memory: off.memory })).action).toBe('post');
    expect(planGlanceRefresh(input({ now: at(9, 30, 11), memory: off.memory })).action).toBe('post');
  });

  // Turning notifications (or the glance's category) off takes a showing glance down. Judged while blocked, "seen and
  // now gone" would read as a swipe and keep it away for the rest of the day once turned back on. While blocked, a
  // missing glance is never judged: the signs are forgotten and no verdict is made.
  it('seen, then blocked: gone while blocked is no swipe, and turned back on the same day it shows', () => {
    const seen = refresh(input({ now: at(10), shown: { day: ISO, key: 'k' }, memory: { ...emptyGlanceMemory(), hour: 9, postedAt: at(9, 30).getTime() } }));
    expect(seen.memory.seenAt).toBe(at(10).getTime());
    for (const blocked of [{ permitted: false }, { channelOff: true }]) {
      const whileOff = refresh(input({ ...blocked, now: at(12), shown: null, memory: seen.memory }));
      expect(whileOff.plan.action).toBe('none');
      expect(whileOff.memory.dismissedOn).toBeNull();
      expect(whileOff.memory.seenAt).toBeNull();
      expect(whileOff.memory.postedAt).toBeNull();
      const backOn = refresh(input({ now: at(12, 5), shown: null, memory: whileOff.memory }));
      expect(backOn.plan.action).toBe('post');
      expect(backOn.memory.dismissedOn).toBeNull();
    }
    // Off and on again with no refresh in between cannot be seen: that still reads as a swipe.
    expect(planGlanceRefresh(input({ now: at(12, 5), shown: null, memory: seen.memory })).action).toBe('none');
  });

  it('a verdict made before the block stands through it, and a glance still showing while blocked is still seen', () => {
    const judged: GlanceMemory = { ...emptyGlanceMemory(), hour: 9, dismissedOn: ISO };
    for (const blocked of [{ permitted: false }, { channelOff: true }]) {
      const whileOff = refresh(input({ ...blocked, now: at(12), shown: null, memory: judged }));
      expect(whileOff.memory.dismissedOn).toBe(ISO);
      expect(planGlanceRefresh(input({ now: at(12, 5), shown: null, memory: whileOff.memory })).action).toBe('none');
      expect(planGlanceRefresh(input({ ...blocked, now: at(12), shown: { day: ISO, key: 'k' }, memory: emptyGlanceMemory() })).memory.seenAt).toBe(
        at(12).getTime(),
      );
    }
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
  // (no "Alarms & reminders") as the app opens, and the handler drops it. Nobody saw it, so the open posts it itself,
  // and a post the handler drops as well is forgotten and retried, never read as a swipe once its settle time is up.
  it('a late arrival after a take-down, dropped by the handler, never loses the day', () => {
    const down = refresh(input({ now: at(8), shown: { day: ISO, key: 'old' }, memory: { ...emptyGlanceMemory(), hour: 9 } }));
    expect(down.plan.action).toBe('remove');
    expect(down.memory.seenAt).toBeNull();
    expect(down.memory.arrivalAt).toBe(at(9).getTime());
    const open = refresh(input({ now: at(9, 40), shown: null, memory: down.memory }));
    expect(open.plan.action).toBe('post');
    expect(open.memory.dismissedOn).toBeNull();
    const forgot = forgetUnlandedGlance(open.memory, at(9, 40).getTime() + 3000); // the handler dropped that post too
    expect(forgot.postedAt).toBeNull();
    const retryAt = new Date(at(9, 40).getTime() + GLANCE_SETTLE_MS + 4000);
    expect(planGlanceRefresh(input({ now: retryAt, shown: null, memory: forgot })).action).toBe('post');
    // Kept, the dropped post would have read as put away by then.
    expect(planGlanceRefresh(input({ now: retryAt, shown: null, memory: open.memory })).action).toBe('none');
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

  it('forgets the post and a past arrival, keeps what was seen, the verdict and a future arrival', () => {
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

  it('so a dropped post is posted again, never read as a swipe, and a dropped arrival never needed it', () => {
    // The app posted at 10:00 with the app open, and the handler timed out: nothing reached the shade.
    const posted = refresh(input({ now: at(10) }));
    const later = new Date(at(10).getTime() + 3 * GLANCE_SETTLE_MS);
    // Without the forget, the post's absence reads as put away. With it, the retry posts.
    expect(planGlanceRefresh(input({ now: later, shown: null, memory: posted.memory })).action).toBe('none');
    const dropped = forgetUnlandedGlance(posted.memory, at(10).getTime() + 3000);
    expect(planGlanceRefresh(input({ now: later, shown: null, memory: dropped })).action).toBe('post');
    // This morning's arrival dropped the same way counts for nothing either way: nobody saw it.
    const night = refresh(input({ now: at(22, 0, 9) }));
    const fired = at(9).getTime();
    const afterFired = new Date(fired + 3 * GLANCE_SETTLE_MS);
    expect(planGlanceRefresh(input({ now: afterFired, shown: null, memory: night.memory })).action).toBe('post');
    expect(planGlanceRefresh(input({ now: afterFired, shown: null, memory: forgetUnlandedGlance(night.memory, fired + 3000) })).action).toBe('post');
  });
});

// Android 14+ without "Alarms & reminders" (its default) delivers the arrival inexactly and often releases it as the
// app comes forward. Hour 9, the app first opened at 9:40: the alarm fires during the cold open, and the cold open's
// refresh reads the shade while that arrival is still in the foreground handler, or after the cold start dropped it.
describe('a late arrival still in the foreground handler when the cold open looks', () => {
  const t0 = at(9, 40).getTime(); // the late alarm fires
  const after = (ms: number) => new Date(t0 + ms);
  const lastNight = () => refresh(input({ now: at(22, 0, 9) })); // planned this morning's arrival at 9

  it('the cold open never judges it by its own absence: it posts at once, and a timed-out delivery gets its retry', () => {
    const r1 = refresh(input({ now: after(1000), shown: null, memory: lastNight().memory }));
    expect(r1.plan.action).toBe('post'); // nobody has seen it, so its absence is no swipe
    expect(r1.plan.content.day).toBe(ISO);
    expect(r1.memory.dismissedOn).toBeNull();
    const dropped = forgetUnlandedGlance(r1.memory, t0 + 3000); // the handler timed out
    expect(dropped.dismissedOn).toBeNull();
    const retry = refresh(input({ now: after(4000), shown: null, memory: dropped }));
    expect(retry.plan.action).toBe('post');
    expect(retry.plan.content.day).toBe(ISO);
    expect(retry.memory.dismissedOn).toBeNull();
  });

  it('a delivery that lands stays up and is seen, a tick updates it in place, and a real swipe after that counts at once', () => {
    const night = lastNight();
    const r1 = refresh(input({ now: after(1000), shown: null, memory: night.memory }));
    const landed: ShownGlance = { day: ISO, key: night.plan.arrival!.content.key };
    const r2 = refresh(input({ now: after(60_000), shown: landed, memory: r1.memory }));
    expect(r2.plan.action).toBe('none'); // the same words are already up
    expect(r2.memory.dismissedOn).toBeNull();
    expect(r2.memory.seenAt).toBe(t0 + 60_000);
    const r3 = planGlanceRefresh(input({ now: after(120_000), tasks: [task('Call the bank')], shown: landed, memory: r2.memory }));
    expect(r3.action).toBe('post');
    expect(planGlanceRefresh(input({ now: after(180_000), shown: null, memory: r2.memory })).memory.dismissedOn).toBe(ISO);
  });

  it("a verdict made all the same is overturned the moment today's glance shows: it stays up, seen, and the verdict goes", () => {
    const judged: GlanceMemory = { ...emptyGlanceMemory(), hour: 9, dismissedOn: ISO };
    const landed: ShownGlance = { day: ISO, key: lastNight().plan.arrival!.content.key };
    const r = refresh(input({ now: after(60_000), shown: landed, memory: judged }));
    expect(r.plan.action).toBe('none');
    expect(r.memory.dismissedOn).toBeNull();
    expect(r.memory.seenAt).toBe(t0 + 60_000);
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

  it('is not recorded, and the refresh the seam then asks for posts it; recorded or not, it can no longer lose the day', () => {
    const before = new Date(at(9).getTime() - 100);
    const plan = planGlanceRefresh(input({ now: before, shown: null }));
    expect(plan.action).toBe('none'); // the window was not open yet
    const memory = settleGlanceMemory(plan, before, { posted: false, scheduled: false });
    expect(memory.arrivalAt).toBeNull();
    expect(planGlanceRefresh(input({ now: new Date(at(9).getTime() + 1500), shown: null, memory })).action).toBe('post');
    // Recorded as if it would fire, it once read as fired and swiped, and lost the day. An arrival nobody saw now counts
    // for nothing, so even recorded, the next refresh posts it.
    const recorded = settleGlanceMemory(plan, before, { posted: false, scheduled: true });
    expect(planGlanceRefresh(input({ now: new Date(at(9).getTime() + GLANCE_SETTLE_MS + 1500), shown: null, memory: recorded })).action).toBe('post');
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

describe('glanceStatus: the quiet line under the choice in Settings', () => {
  const open = () => [task('Water the plants'), task('Call the bank')];
  /** Settings looking at 10:00 with the glance chosen at 9, allowed, two open tasks, nothing showing, nothing
   *  remembered, and exact alarms allowed. */
  const status = (over: Partial<GlanceStatusInput> = {}) =>
    glanceStatus({
      now: at(10),
      hour: 9,
      memory: emptyGlanceMemory(),
      shown: null,
      tasks: open(),
      closedISO: null,
      permitted: true,
      channelOff: false,
      exactAlarms: true,
      ...over,
    });
  const nine = formatReminderTime(9, 0);
  const kept = (over: Partial<GlanceMemory>): GlanceMemory => ({ ...emptyGlanceMemory(), hour: 9, ...over });
  const today: ShownGlance = { day: ISO, key: 'k' };

  it('says each state in its own words, with the time in the device convention', () => {
    expect(status({ shown: today })).toEqual({ kind: 'showing', line: 'Showing now.', alarmDoor: false, lookAgain: false });
    expect(status({ now: at(7) })).toEqual({ kind: 'today', line: `Comes at ${nine}.`, alarmDoor: false, lookAgain: false });
    expect(status({ now: at(22) })).toEqual({ kind: 'tomorrow', line: `Comes tomorrow at ${nine}.`, alarmDoor: false, lookAgain: false });
    expect(status({ memory: kept({ dismissedOn: ISO }) })).toEqual({
      kind: 'putAway',
      line: `Put away for today. Back tomorrow at ${nine}.`,
      alarmDoor: false,
      lookAgain: false,
    });
    // Put away with nothing for tomorrow: no arrival is planned, so the line never promises one.
    const todayOnly = [task('Bins out', { recurrence: { kind: 'weekly', weekdays: [2] } })];
    expect(status({ tasks: todayOnly, memory: kept({ dismissedOn: ISO }) })).toEqual({
      kind: 'putAway',
      line: 'Put away for today.',
      alarmDoor: false,
      lookAgain: false,
    });
    expect(status({ closedISO: ISO })).toEqual({ kind: 'resting', line: 'Resting while today is clear.', alarmDoor: false, lookAgain: false });
    expect(status({ channelOff: true })).toEqual({
      kind: 'off',
      line: "Turned off in Android's settings for DoubleDone.",
      alarmDoor: false,
      lookAgain: false,
    });
    expect(status({ now: at(7) })?.line.replace(/ /g, ' ')).toBe('Comes at 9:00 am.');
    // Never a count, whatever is open: the one number is the time.
    const many = Array.from({ length: 12 }, (_, i) => task(`t${i}`));
    for (const now of [at(7), at(10), at(22)]) expect(status({ now, tasks: many })?.line.replace(nine, '')).not.toMatch(/\d/);
  });

  it("showing: inside the window with something open, whether it is up already or the open's refresh is putting it up", () => {
    expect(status({ shown: today })?.kind).toBe('showing');
    expect(status({ shown: null })?.kind).toBe('showing');
    expect(status({ shown: { day: YESTERDAY, key: 'old' } })?.kind).toBe('showing'); // the refresh replaces it
    expect(status({ now: at(9) })?.kind).toBe('showing'); // the hour itself
    expect(status({ now: at(21, 29) })?.kind).toBe('showing');
  });

  // "Showing now." over an empty shade would be the silent failure this line exists to end. While today's is not in
  // the shade yet, Settings reads once more after a post has had time to land (and the seam retries a failed post).
  it('asks to be read once more only when it says showing and today’s is not in the shade yet', () => {
    expect(status({ shown: null })?.lookAgain).toBe(true);
    expect(status({ shown: { day: YESTERDAY, key: 'old' } })?.lookAgain).toBe(true);
    expect(status({ shown: today })?.lookAgain).toBe(false);
    expect(status({ shown: { day: null, key: null } })?.lookAgain).toBe(false);
    for (const over of [{ now: at(7) }, { now: at(22) }, { closedISO: ISO }, { memory: kept({ dismissedOn: ISO }) }, { channelOff: true }]) {
      expect(status({ ...over, shown: null })?.lookAgain).toBe(false);
    }
    // A post that never landed: once it has had time to land, the second read says put away, not showing.
    const posted = kept({ postedAt: at(10).getTime() });
    expect(status({ now: new Date(at(10).getTime() + 1000), memory: posted })).toMatchObject({ kind: 'showing', lookAgain: true });
    expect(status({ now: new Date(at(10).getTime() + 1000 + GLANCE_SETTLE_MS + 1500), memory: posted })?.kind).toBe('putAway');
  });

  // The 2026-11-12 no-show: an arrival nobody saw must never read as put away, here any more than in the refresh.
  it("last night's arrival gone, never seen and nothing showing reads as showing, never put away", () => {
    const night = refresh(input({ now: at(23, 30, 9), hour: 8 }));
    expect(status({ now: at(11), hour: 8, memory: night.memory })).toMatchObject({ kind: 'showing', line: 'Showing now.' });
  });

  it('put away: seen and gone, or a post that had time to land and is gone, for the rest of the day, then back', () => {
    expect(status({ now: at(12), memory: kept({ seenAt: at(9, 30).getTime() }) })?.kind).toBe('putAway');
    expect(status({ now: at(12), memory: kept({ postedAt: at(10).getTime() }) })?.kind).toBe('putAway');
    // A post still landing is not put away.
    expect(status({ now: new Date(at(10).getTime() + 2000), memory: kept({ postedAt: at(10).getTime() }) })?.kind).toBe('showing');
    // A verdict holds all day, after the window too, and the next morning is a new day.
    expect(status({ now: at(23), memory: kept({ dismissedOn: ISO }) })?.kind).toBe('putAway');
    expect(status({ now: at(7, 0, 11), memory: kept({ dismissedOn: ISO }) })).toMatchObject({ kind: 'today', line: `Comes at ${nine}.` });
  });

  it('resting: inside the window with the day closed, done or empty, and outside it whenever nothing is coming', () => {
    for (const over of [{ closedISO: ISO }, { tasks: [doneToday('a'), doneToday('b')] }, { tasks: [] }]) {
      expect(status(over)?.kind).toBe('resting');
    }
    // Closed with open tasks: they carry over, so tomorrow's arrival is coming and its time is named.
    expect(status({ closedISO: ISO, now: at(7) })?.kind).toBe('tomorrow');
    expect(status({ closedISO: ISO, now: at(22) })?.kind).toBe('tomorrow');
    // Done or empty with nothing for tomorrow: no arrival is planned, so no time is promised.
    for (const tasks of [[doneToday('a'), doneToday('b')], []]) {
      expect(status({ tasks, now: at(7) })?.kind).toBe('resting');
      expect(status({ tasks, now: at(22) })?.kind).toBe('resting');
    }
  });

  // A time is named only for an arrival the refresh plans: "Comes tomorrow at 8:00 am." over a tomorrow that holds
  // nothing would be the same broken promise this feature was built to end.
  it('names tomorrow only when tomorrow holds something, and a task added for it brings the time back', () => {
    const allDone = [doneToday('a')];
    const night = refresh(input({ now: at(22), tasks: allDone }));
    expect(night.plan.arrival).toBeNull();
    expect(status({ now: at(22), tasks: allDone, memory: night.memory })).toMatchObject({ kind: 'resting', line: 'Resting while today is clear.' });
    // Something for tomorrow: an undated task (it carries over), one dated for it, or one that repeats then.
    const wednesdays = task('Bins in', { recurrence: { kind: 'weekly', weekdays: [3] } });
    for (const extra of [task('Undated'), task('Dated', { due: TOMORROW }), wednesdays]) {
      const tasks = [...allDone, extra];
      expect(refresh(input({ now: at(22), tasks })).plan.arrival?.content.day).toBe(TOMORROW);
      expect(status({ now: at(22), tasks })).toMatchObject({ kind: 'tomorrow', line: `Comes tomorrow at ${nine}.` });
    }
    // Before the hour with nothing today and nothing tomorrow, it rests too.
    expect(status({ now: at(7), tasks: [] })?.kind).toBe('resting');
  });

  it('today until the hour, showing from it until 9:30 pm, tomorrow from then until midnight, and today again after', () => {
    expect(status({ now: at(0, 0) })?.kind).toBe('today');
    expect(status({ now: at(8, 59) })?.kind).toBe('today');
    expect(status({ now: at(9, 0) })?.kind).toBe('showing');
    expect(status({ now: at(21, 30) })?.kind).toBe('tomorrow');
    expect(status({ now: at(23, 59) })?.kind).toBe('tomorrow');
    expect(status({ now: at(0, 0, 11) })?.kind).toBe('today');
    // A one-off due tomorrow only: nothing to show today, so before the hour it is tomorrow's.
    expect(status({ now: at(7), tasks: [task('later', { due: TOMORROW })] })?.kind).toBe('tomorrow');
    // The time named follows the hour.
    expect(status({ now: at(7), hour: 8 })?.line).toBe(`Comes at ${formatReminderTime(8, 0)}.`);
    expect(status({ now: at(22), hour: 20 })?.line).toBe(`Comes tomorrow at ${formatReminderTime(20, 0)}.`);
  });

  it('the late hour: no window, no status, so the late-hour line speaks alone, whatever else is true', () => {
    for (const hour of [21, 22, 23]) {
      expect(status({ hour })).toBeNull();
      expect(status({ hour, channelOff: true, exactAlarms: false })).toBeNull();
      expect(status({ hour, memory: kept({ dismissedOn: ISO }), shown: today })).toBeNull();
    }
    // 20 still leaves a window, 8:00 pm to 9:30 pm.
    expect(status({ hour: 20 })).toMatchObject({ kind: 'today', line: `Comes at ${formatReminderTime(20, 0)}.` });
    expect(status({ hour: 20, now: at(20, 30) })?.kind).toBe('showing');
  });

  it("off: the glance's channel turned off, or notifications off for DoubleDone, wins over every other state", () => {
    const off = { kind: 'off', line: "Turned off in Android's settings for DoubleDone.", alarmDoor: false, lookAgain: false };
    for (const blocked of [{ channelOff: true }, { permitted: false }, { channelOff: true, permitted: false }]) {
      expect(status(blocked)).toEqual(off);
      expect(status({ ...blocked, shown: today })).toEqual(off);
      expect(status({ ...blocked, memory: kept({ dismissedOn: ISO }) })).toEqual(off);
      expect(status({ ...blocked, now: at(7) })).toEqual(off);
      expect(status({ ...blocked, now: at(22), exactAlarms: false })).toEqual(off);
      expect(status({ ...blocked, closedISO: ISO, exactAlarms: null })).toEqual(off);
    }
  });

  it("put away wins over resting, and today's glance in the shade overturns a verdict", () => {
    expect(status({ closedISO: ISO, memory: kept({ dismissedOn: ISO }) })?.kind).toBe('putAway');
    expect(status({ memory: kept({ dismissedOn: ISO }), shown: today })?.kind).toBe('showing');
    expect(status({ memory: kept({ dismissedOn: ISO }), shown: { day: null, key: null } })?.kind).toBe('showing');
    // Yesterday's left showing does not overturn today's verdict.
    expect(status({ memory: kept({ dismissedOn: ISO }), shown: { day: YESTERDAY, key: 'old' } })?.kind).toBe('putAway');
  });

  it('a new hour is a new choice: nothing kept under the old hour counts', () => {
    const old = kept({ seenAt: at(9, 30).getTime(), dismissedOn: ISO });
    expect(status({ now: at(12), memory: old })?.kind).toBe('putAway');
    expect(status({ now: at(12), hour: 8, memory: old })?.kind).toBe('showing');
  });

  it('offers the "Alarms & reminders" door while exact alarms are not allowed or cannot be told, never once they are, never while off', () => {
    for (const over of [{}, { now: at(7) }, { now: at(22) }, { memory: kept({ dismissedOn: ISO }) }, { closedISO: ISO }]) {
      expect(status({ ...over, exactAlarms: false })?.alarmDoor).toBe(true);
      expect(status({ ...over, exactAlarms: null })?.alarmDoor).toBe(true);
      expect(status({ ...over, exactAlarms: true })?.alarmDoor).toBe(false);
      expect(status({ ...over, exactAlarms: false, channelOff: true })?.alarmDoor).toBe(false);
      expect(status({ ...over, exactAlarms: false, permitted: false })?.alarmDoor).toBe(false);
    }
  });

  it('names the real arrival on a night whose hour does not exist (spring forward), never a time that never comes', () => {
    const original = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = 'Australia/Melbourne';
    try {
      // 2:00 does not exist on 4 Oct 2026 in Melbourne: that arrival is at 3:00.
      expect(new Date(2026, 9, 4, 2, 0).getHours()).toBe(3); // the zone switch really took effect
      const eve = status({ now: new Date(2026, 9, 3, 22, 0), hour: 2 });
      expect(eve?.line).toBe(`Comes tomorrow at ${formatReminderTime(3, 0)}.`);
      const night = status({ now: new Date(2026, 9, 4, 0, 30), hour: 2 });
      expect(night?.line).toBe(`Comes at ${formatReminderTime(3, 0)}.`);
    } finally {
      process.env.TZ = original;
    }
  });

  // The line must say what the refresh does, or it would be one more thing that is silently wrong. Every state is
  // checked against planGlanceRefresh over the same inputs: a whole day of moments, every shade, every kind of memory
  // and every kind of day.
  it('agrees with the refresh, case by case', () => {
    const moments = [at(0, 30), at(7), at(8, 59), at(9), at(10), at(12), at(21, 29), at(21, 30), at(23)];
    const shades: (ShownGlance | null)[] = [null, today, { day: null, key: null }, { day: YESTERDAY, key: 'old' }];
    const memories: GlanceMemory[] = [
      emptyGlanceMemory(),
      kept({}),
      kept({ seenAt: at(9, 30).getTime() }),
      kept({ postedAt: at(10).getTime() }),
      kept({ postedAt: at(12).getTime() - 5000 }), // still landing at noon
      kept({ dismissedOn: ISO }),
      kept({ dismissedOn: YESTERDAY, seenAt: at(20, 0, 9).getTime() }),
      kept({ arrivalAt: at(9).getTime() }),
      { ...emptyGlanceMemory(), hour: 7, seenAt: at(9, 30).getTime(), dismissedOn: ISO },
    ];
    const days: Pick<GlanceStatusInput, 'tasks' | 'closedISO'>[] = [
      { tasks: open(), closedISO: null },
      { tasks: open(), closedISO: ISO },
      { tasks: [doneToday('a')], closedISO: null },
      { tasks: [], closedISO: null },
      { tasks: [task('later', { due: TOMORROW })], closedISO: null },
    ];
    const switches: Pick<GlanceStatusInput, 'permitted' | 'channelOff'>[] = [
      { permitted: true, channelOff: false },
      { permitted: false, channelOff: false },
      { permitted: true, channelOff: true },
    ];
    let checked = 0;
    for (const now of moments) {
      for (const shown of shades) {
        for (const memory of memories) {
          for (const day of days) {
            for (const sw of switches) {
              const s = status({ now, shown, memory, ...day, ...sw });
              const plan = planGlanceRefresh(input({ now, shown, memory, ...day, ...sw }));
              const dismissed = plan.memory.dismissedOn === toISODate(now);
              const belongsUp = glanceAction({ content: plan.content, now, hour: 9, dismissed, presented: false, presentedKey: null }) === 'post';
              const where = JSON.stringify({ now: now.toString(), shown, memory, day: day.closedISO ?? day.tasks.length, ...sw });
              expect(s, where).not.toBeNull();
              if (!sw.permitted || sw.channelOff) {
                expect(s?.kind, where).toBe('off');
                expect(plan.action, where).not.toBe('post');
                // Notifications off plans no arrival. The category off keeps it, as allowed would.
                if (!sw.permitted) expect(plan.arrival, where).toBeNull();
                else expect(plan.arrival, where).toEqual(planGlanceRefresh(input({ now, shown, memory, ...day })).arrival);
                checked++;
                continue;
              }
              const arrivesToday = plan.arrival !== null && toISODate(plan.arrival.at) === toISODate(now);
              const arrivesLater = plan.arrival !== null && !arrivesToday;
              const inWindow = inGlanceWindow(now, 9);
              expect(s?.kind === 'putAway', where).toBe(dismissed);
              expect(s?.kind === 'showing', where).toBe(belongsUp);
              // Outside the window the line names a time only for the arrival the refresh plans, and rests without one.
              expect(s?.kind === 'today', where).toBe(arrivesToday);
              expect(s?.kind === 'tomorrow', where).toBe(!dismissed && !inWindow && arrivesLater);
              expect(s?.kind === 'resting', where).toBe(!dismissed && (inWindow ? !belongsUp : plan.arrival === null));
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(moments.length * shades.length * memories.length * days.length * switches.length);
  });
});
