// The app-event beacon: pseudonymous usage counts for features that never touch the
// Worker on their own. Settle is the first resident: the breathing room is pure
// client, so unlike the AI features (whose ai_calls rows are their own usage log) it
// was invisible to the Analytics Centre until this pipe existed.
//
// The posture is the STRICTEST of the telemetry family: a closed allowlist of event
// names is all that can ever be stored, as one count per name per day. No user_id, no IP,
// no free text, no props beyond the few folded into a name (the guide's on/off, the
// hold's rough stage, which Settings door). Anything off the list is accepted and
// dropped (a 200 with no write), so probing the endpoint teaches nothing and an
// older server never errors a newer client. Deliberately NOT collected: settle.left
// (leaving the room), because enter+leave timestamps at low traffic could be paired
// into rough session durations, and "time is not a score" holds in our database too.

import type { D1LikeDatabase } from './telemetry';

export type EventsEnv = { DB?: D1LikeDatabase };

// The closed set of storable events. Adding one is a deliberate change HERE plus the
// client-side BEACON_EVENTS allowlist; nothing else can ever enter the table.
export const APP_EVENTS = new Set([
  'settle.opened',
  'settle.guide.on',
  'settle.guide.off',
  // "Hold me to it" (2026-08-22). The step number is folded into three coarse buckets rather than
  // stored raw, keeping the names-only posture: .first = it worked before or at the first knock,
  // .ladder = somewhere in the same-day escalation, .days = the daily follow-up era. The
  // completed-vs-released split per bucket IS the feature's report card.
  'hold.started',
  'hold.completed.first',
  'hold.completed.ladder',
  'hold.completed.days',
  'hold.released.first',
  'hold.released.ladder',
  'hold.released.days',
  // The held-card usage set (2026-08-22): stored as bare names, any props on the wire are
  // dropped here exactly like everywhere else. card.more is the fold-open denominator.
  'breakdown.started',
  'tiny.made',
  'slices.defined',
  'task.pinned',
  'task.renamed',
  'task.reordered',
  'nudge.set',
  'bulk.big',
  'card.more',
  // The telemetry review (2026-10-04). card.opened is card.more's denominator, fired by the card
  // itself and only when it HAS a More fold, so the two count the same cards on every surface.
  'card.opened',
  // "+ I also did that", counted only until its keep-or-remove verdict (decision-log 2026-10-04).
  'offplan.logged',
  // The Menu's two ways into Settings (the corner sign, the shelf's line), folded from
  // rooms.opened. Every other room is dropped.
  'menu.settings.sign',
  'menu.settings.shelf',
  // "Where you left off" (2026-10-04): a line saved on the card or in Focus, or cleared. Names only.
  'leftoff.saved.card',
  'leftoff.saved.focus',
  'leftoff.cleared',
]);

/** Normalise a raw client body to a storable event name, or null to drop it.
 *  `settle.guide` folds its one boolean prop into the name; everything else must
 *  match the allowlist exactly. Pure and unit-tested. */
export function parseAppEvent(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as { name?: unknown; props?: unknown };
  if (typeof body.name !== 'string' || body.name.length > 64) return null;
  let name = body.name;
  if (name === 'settle.guide') {
    const on = (body.props as { on?: unknown } | undefined)?.on;
    if (typeof on !== 'boolean') return null;
    name = on ? 'settle.guide.on' : 'settle.guide.off';
  }
  if (name === 'hold.completed' || name === 'hold.released') {
    const step = (body.props as { step?: unknown } | undefined)?.step;
    if (typeof step !== 'number' || !Number.isFinite(step)) return null;
    name = `${name}.${step <= 1 ? 'first' : step <= 4 ? 'ladder' : 'days'}`;
  }
  if (name === 'rooms.opened') {
    const p = body.props as { room?: unknown; door?: unknown } | null | undefined;
    if (p?.room !== 'settings' || (p.door !== 'sign' && p.door !== 'shelf')) return null;
    name = `menu.settings.${p.door}`;
  }
  return APP_EVENTS.has(name) ? name : null;
}

/** The upsert + ordered bind params for one app event: one counter per day per name, bumped
 *  in place. Pure and unit-tested (the params are the contract surface). A counter rather than
 *  a row per event (2026-10-04): rows in insertion order would let consecutive events (open a
 *  card, open its fold, set a reminder) be read back as one person's session, which is finer
 *  than the policy's "the feature's name and the day". */
export function eventStatement(event: string): { sql: string; params: unknown[] } {
  return {
    sql: "INSERT INTO app_event_counts (day, event, n) VALUES (date('now'), ?1, 1) ON CONFLICT (day, event) DO UPDATE SET n = n + 1",
    params: [event],
  };
}

/** Fire-and-forget D1 upsert. Never throws: telemetry must never break a user
 *  request. Skips cleanly when no D1 binding is present (tests / local dev). */
export async function logAppEvent(env: EventsEnv, event: string): Promise<void> {
  if (!env.DB) return;
  try {
    const { sql, params } = eventStatement(event);
    await env.DB.prepare(sql)
      .bind(...params)
      .run();
  } catch {
    // best effort, swallow
  }
}
