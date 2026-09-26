// The tick that closes both, lifted out of today.tsx so every screen that ticks a personal copy of a
// shared row (Today, and now the Repeating room) carries it the same way. Behaviour is unchanged from
// Today's own `mirrorTickToShared`, including the pull-first and the noteOursMine at the end.

import { type SupabaseClient } from '@supabase/supabase-js';

import { toISODate } from './day';
import { parseSharedRef } from './ours-bridge';
import { setSharedDone, type SharedTask } from './ours-merge';
import { isUnreadableRepeat, syncPairOnce } from './ours-sync';
import { loadOursTasks, noteOursMine, saveOursTasks } from './storage';
import { nowMs } from './tasks';

/**
 * Your copy is done, so the shared row is done, on the day you did it.
 *
 * Fire-and-forget on purpose: your own list must never wait on somebody else's, and must never fail
 * because of it. The completion is already saved locally and the merge is order-independent, so a tick
 * that does not reach the server now reaches it on the next reconcile, from whichever side opens first.
 *
 * It carries WHEN and never who. There is no field on a shared row that could say otherwise.
 *
 * `onWrite` fires just before the shared cache is written, so a caller running its own read-modify-write
 * over the same cache (Today's settle) can tell that it has been overtaken.
 */
export async function mirrorTickToShared(
  client: SupabaseClient | null,
  ref: string,
  day: Date,
  done: boolean,
  onWrite?: () => void,
): Promise<void> {
  const link = parseSharedRef(ref);
  if (!link || !client) return;
  try {
    // PULL FIRST when the row is not in the local cache. Nothing on Today ever writes that cache; only
    // the room does. So on a laptop, a second phone, or after a reinstall it is empty, and reading "not in
    // my cache" as "removed on the other side" silently threw away every tick on a brought copy. That is
    // precisely the failure the synced `shared_ref` column was added to prevent.
    let rows = await loadOursTasks(link.pairId);
    if (!rows.some((task: SharedTask) => task.id === link.sharedId)) {
      rows = (await syncPairOnce(client, link.pairId, rows)).merged;
      await saveOursTasks(link.pairId, rows); // seed the cache, so this costs a pull only once
    }
    const found = rows.find((task: SharedTask) => task.id === link.sharedId && !task.deletedAt);
    // Genuinely gone, or a cadence this build cannot read. The second matters: an unreadable repeat has
    // no recurrence object, so setSharedDone would treat it as a one-off and mark a repeating task
    // finished forever, for both of you. The room refuses that tap; so must this.
    if (!found || isUnreadableRepeat(found)) return;
    const next = rows.map((task: SharedTask) => (task.id === link.sharedId ? setSharedDone(task, toISODate(day), done, nowMs()) : task));
    onWrite?.();
    await saveOursTasks(link.pairId, next);
    const { merged, pushError } = await syncPairOnce(client, link.pairId, next);
    // The tick is on this device and not on theirs. Nothing on the working surface should shout about
    // it, but it must not vanish either: this is the trail that makes it findable when somebody reports
    // "it didn't reach my wife's phone".
    if (pushError) console.warn('[ours] tick did not reach the shared list', pushError);
    await saveOursTasks(link.pairId, merged);
    // My own write, so it must not come back tinted as my person's change (see ours-list's wash). The
    // id, not the clock: advancing the last-look would also clear the wash on THEIR changes that arrived
    // before this one and that I have not looked at yet.
    await noteOursMine(link.pairId, [link.sharedId]);
  } catch (err) {
    // The local copy is already right. The next reconcile carries it.
    console.warn('[ours] mirrorTickToShared failed', err);
  }
}
