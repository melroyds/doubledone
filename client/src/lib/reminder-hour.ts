// The Settings hour stepper's re-apply. The time shown and the hour saved change at once, but the re-subscribe
// (web push) or re-schedule (native) waits until the taps stop, so a flurry of +/- makes ONE re-apply at the final
// hour, never a burst.
//
// The switch must always land last (#16). The wait used to run on regardless of the switch, so an Off inside it
// was undone 0.6 s later: the reminder switched itself back on while Settings said Off. `settle()` is what the
// switch calls first: it drops a re-apply still waiting, and waits out one already running, so whatever the switch
// does next is the last word. Platform-free (the apply is handed in), so it is node-tested.

export const REAPPLY_WAIT_MS = 600;
// The longest the switch waits for a re-apply already running. A re-subscribe can hang (a stalled network, a service
// worker that never becomes ready), and the switch must never hang with it.
export const SETTLE_CAP_MS = 5000;

export type HourReapply = {
  /** The hour changed: re-apply it once the taps stop. */
  schedule(hour: number): void;
  /** The switch is about to change: drop a re-apply still waiting, and wait out one already running, up to the cap.
   *  Never throws. */
  settle(): Promise<void>;
};

export function hourReapply(apply: (hour: number) => Promise<unknown>, waitMs: number = REAPPLY_WAIT_MS, capMs: number = SETTLE_CAP_MS): HourReapply {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();
  return {
    schedule(hour) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        running = (async () => {
          try {
            await apply(hour);
          } catch {
            // best effort, as the re-apply always was (enableDailyReminder answers a failure rather than throwing)
          }
        })();
      }, waitMs);
    },
    async settle() {
      if (timer) clearTimeout(timer);
      timer = null;
      let cap: ReturnType<typeof setTimeout> | undefined;
      const capped = new Promise<void>((resolve) => {
        cap = setTimeout(resolve, capMs);
      });
      try {
        await Promise.race([running, capped]);
      } finally {
        clearTimeout(cap);
      }
    },
  };
}
