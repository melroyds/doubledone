import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hourReapply, REAPPLY_WAIT_MS, SETTLE_CAP_MS } from './reminder-hour';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('hourReapply (the Settings hour stepper)', () => {
  it('re-applies ONCE, at the last hour, after a flurry of taps', async () => {
    const apply = vi.fn(async (_hour: number) => undefined);
    const reapply = hourReapply(apply);
    reapply.schedule(10);
    reapply.schedule(11);
    reapply.schedule(12);
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS - 1);
    expect(apply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(12);
  });

  // #16: the hour stepper armed a 0.6 s re-apply, and Off never disarmed it, so the reminder switched itself back
  // on after the person had turned it off (a re-scheduled notification on the phones, a fresh push subscription
  // on the web), with the switch still reading Off.
  it('switching Off inside the wait drops the re-apply, so Off is the last word', async () => {
    const calls: string[] = [];
    const reapply = hourReapply(async (hour) => {
      calls.push(`on@${hour}`);
    });
    reapply.schedule(10);
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS / 2);
    await reapply.settle();
    calls.push('off');
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS * 2);
    expect(calls).toEqual(['off']);
  });

  it('switching Off while a re-apply is still running waits for it, so Off still lands after it', async () => {
    const calls: string[] = [];
    let finish: () => void = () => undefined;
    const reapply = hourReapply(async (hour) => {
      calls.push(`start@${hour}`);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      calls.push(`done@${hour}`);
    });
    reapply.schedule(10);
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS); // the re-subscribe is under way (permission, push service, the Worker)
    const off = reapply.settle().then(() => calls.push('off'));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['start@10']); // Off is holding, not racing it
    finish();
    await off;
    expect(calls).toEqual(['start@10', 'done@10', 'off']);
  });

  // A re-subscribe can hang (a stalled network, a service worker that never becomes ready). The switch must
  // never hang with it, or the reminder could not be turned off at all.
  it('never holds the switch past the cap, even for a re-apply that never finishes', async () => {
    const reapply = hourReapply(() => new Promise<never>(() => undefined));
    reapply.schedule(10);
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS);
    let settled = false;
    void reapply.settle().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(SETTLE_CAP_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('settles at once when nothing is waiting or running', async () => {
    const reapply = hourReapply(vi.fn(async () => undefined));
    let settled = false;
    void reapply.settle().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });

  it('a failed re-apply never jams the switch, or the next hour change', async () => {
    const apply = vi.fn(async (_hour: number) => {
      throw new Error('push service down');
    });
    const reapply = hourReapply(apply);
    reapply.schedule(7);
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS);
    await expect(reapply.settle()).resolves.toBeUndefined();
    reapply.schedule(8);
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS);
    expect(apply).toHaveBeenLastCalledWith(8);
  });

  it('an hour change after a settle is re-applied as normal', async () => {
    const apply = vi.fn(async (_hour: number) => undefined);
    const reapply = hourReapply(apply);
    reapply.schedule(6);
    await reapply.settle();
    reapply.schedule(7);
    await vi.advanceTimersByTimeAsync(REAPPLY_WAIT_MS);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(7);
  });
});
