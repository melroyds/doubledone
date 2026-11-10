import { describe, expect, it } from 'vitest';

import { coalesceRuns } from './coalesce';

/** A job whose runs are held open until the test lets each one finish, recording what overlapped. */
function heldJob() {
  const finishes: (() => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let started = 0;
  const job = () => {
    started += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise<void>((resolve) =>
      finishes.push(() => {
        inFlight -= 1;
        resolve();
      }),
    );
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    job,
    tick,
    started: () => started,
    maxInFlight: () => maxInFlight,
    finishNext: async () => {
      finishes.shift()?.();
      await tick();
    },
  };
}

// The widget (and the notification) refresh from what is STORED after every save. A cold open saves several
// times in a second, and two refreshes in flight together can land out of order, leaving the older picture.
describe('coalesceRuns', () => {
  it('runs the job once for a single call', async () => {
    const h = heldJob();
    const run = coalesceRuns(h.job);
    const done = run();
    await h.tick();
    expect(h.started()).toBe(1);
    await h.finishNext();
    await expect(done).resolves.toBeUndefined();
  });

  it('never overlaps runs, and a burst during a run costs exactly one more run, shared by every caller', async () => {
    const h = heldJob();
    const run = coalesceRuns(h.job);
    const first = run();
    await h.tick();
    const burst = [run(), run(), run()];
    await h.tick();
    expect(h.started()).toBe(1); // the booked run waits for the first to finish
    await h.finishNext();
    expect(h.started()).toBe(2);
    await h.finishNext();
    await Promise.all([first, ...burst]);
    expect(h.started()).toBe(2);
    expect(h.maxInFlight()).toBe(1);
  });

  it('answers every call with a run that started after it, so the last run reads the newest save', async () => {
    let stored = 'old';
    const seen: string[] = [];
    let release: () => void = () => {};
    const run = coalesceRuns(async () => {
      seen.push(stored);
      await new Promise<void>((resolve) => (release = resolve));
    });
    const first = run();
    await Promise.resolve();
    await Promise.resolve();
    stored = 'new'; // a save lands while the first refresh is still drawing the old picture
    const second = run();
    release();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await second;
    expect(seen).toEqual(['old', 'new']);
  });

  it('a failed run is swallowed and never jams the ones after it', async () => {
    let calls = 0;
    const run = coalesceRuns(async () => {
      calls += 1;
      if (calls === 1) throw new Error('disk');
    });
    await expect(run()).resolves.toBeUndefined();
    await expect(run()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it('a job that throws before its first await is swallowed too', async () => {
    const run = coalesceRuns(() => {
      throw new Error('sync');
    });
    await expect(run()).resolves.toBeUndefined();
  });

  it('a job that calls back in books a run instead of starting a second one alongside itself', async () => {
    let starts = 0;
    let inFlight = 0;
    let overlapped = false;
    let again = true;
    const self: { run?: () => Promise<void> } = {};
    const job = async () => {
      starts += 1;
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      if (again) {
        again = false;
        void self.run?.();
      }
      await Promise.resolve();
      inFlight -= 1;
    };
    self.run = coalesceRuns(job);
    await self.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(starts).toBe(2);
    expect(overlapped).toBe(false);
  });

  it('runs again for a call made after everything settled', async () => {
    let calls = 0;
    const run = coalesceRuns(async () => {
      calls += 1;
    });
    await run();
    await run();
    expect(calls).toBe(2);
  });
});
