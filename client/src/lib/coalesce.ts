// One refresh at a time, and the last word always gets a run.
//
// Built for the refreshes that follow the storage change notice (lib/storage): the home-screen widget and the
// notification. Each refresh reads what is STORED, so what matters is that the final run starts after the final
// save. A cold open can save several times in a second (the resume sweep, the sync merge, the shared settle),
// and two refreshes in flight at once can land out of order, leaving the older picture on screen. So: runs
// never overlap, a request made while one is running books exactly ONE more run for when it finishes, however
// many requests arrive meanwhile, and that run reads the newest state. Pure, no React Native import.

/**
 * Wrap `job` so that its runs never overlap and every call is answered by a run that STARTS after the call.
 * Calls during a run share the one run booked behind it, so a burst costs at most two runs. A failed run is
 * swallowed (the next call simply runs it again), and the returned promise never rejects: it settles when the
 * run that answers the call has finished.
 */
export function coalesceRuns(job: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let booked: Promise<void> | null = null;

  const launch = (): Promise<void> => {
    // The job starts a microtask later, once `running` is set, so a job that calls back in synchronously books
    // a run instead of starting a second one alongside itself.
    const run = Promise.resolve()
      .then(() => job())
      .catch(() => undefined) // swallowed: a refresh that failed is simply tried again by the next call
      .then(() => {
        running = null;
      });
    running = run;
    return run;
  };

  return () => {
    if (!running) return launch();
    if (!booked) {
      booked = running.then(() => {
        booked = null;
        // A run another caller started in the gap also began after every booked call, so it answers them too.
        return running ?? launch();
      });
    }
    return booked;
  };
}
