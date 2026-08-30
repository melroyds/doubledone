// Web reminders (Phase 2): a daily "your today is here" nudge via Web Push. The browser
// registers a service worker and a push subscription; the subscription is stored on the
// Worker, which sends a PAYLOADLESS daily push (the service worker holds the message, so no
// task content ever reaches the browser). Native uses reminders.ts (local scheduling);
// Metro resolves this .web.ts on web. Per-task nudges stay native-only (no-op here).

import { type ReminderResult } from './reminders-types';
import { type Routine } from './routines';

export type { ReminderReason, ReminderResult } from './reminders-types';

const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';
// Baked in as a fallback so the deployed web build always has it; EXPO_PUBLIC_VAPID_KEY
// overrides it (e.g. for key rotation). This is the PUBLIC key, designed to be exposed
// (it ships to every browser); the private JWK is a Worker secret, never here.
const VAPID_PUBLIC =
  process.env.EXPO_PUBLIC_VAPID_KEY ?? 'BCLgPiUxAM8-T1-vbHitJbtEes3cVCFRik5cNhJO5EpmmozbtMuEKel-mLQ_fbFbfBmjmGrJOqmCueKLoHdTEs8'; // gitleaks:allow

// applicationServerKey wants the url-base64 VAPID public key as bytes.
function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribe this browser to the daily web-push nudge: register the service worker, ask
 *  permission, subscribe, and store the subscription on the Worker. Returns ok, or a reason
 *  it didn't: unsupported (no push here), denied (permission), or error (transient). */
export async function enableDailyReminder(hour = 9, opts: { quiet?: boolean } = {}): Promise<ReminderResult> {
  try {
    if (
      !VAPID_PUBLIC ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      typeof window === 'undefined' ||
      !('PushManager' in window)
    ) {
      return { ok: false, reason: 'unsupported' };
    }
    if ((await Notification.requestPermission()) !== 'granted') return { ok: false, reason: 'denied' };
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
    });
    const res = await fetch(`${AI_URL}/push/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), hour, tzOffset: new Date().getTimezoneOffset() }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Unsubscribe this browser from the daily nudge, and tell the Worker to drop it. */
export async function disableDailyReminder(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const { endpoint } = sub;
    await sub.unsubscribe();
    await fetch(`${AI_URL}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // best effort
  }
}

/** No-op on web: per-task nudges are native-only (web has no local scheduling). */
export async function scheduleNudge(taskId: string, title: string, at: Date): Promise<string | null> {
  return null;
}

/** No-op on web. */
export async function cancelNudge(id: string): Promise<void> {
  // nothing scheduled on web
}

/** No-op on web: routine nudges are native-only (web has no local scheduling), so the
 *  screen can say calmly that they aren't available here. */
export async function scheduleRoutineNudge(routineId: string, name: string, hour: number, minute = 0, opts: { quiet?: boolean } = {}): Promise<ReminderResult> {
  return { ok: false, reason: 'unsupported' };
}

/** No-op on web. */
export async function cancelRoutineNudge(routineId: string): Promise<void> {
  // nothing scheduled on web
}

/** No-op on web: Rhythm nudges are native-only for now (web has no local scheduling), so the
 *  screen can say calmly that Rhythm reminders arrive on the phone. Web-push delivery for
 *  Rhythms is a deferred phase. */
export async function scheduleRhythm(r: Routine, opts: { quiet?: boolean } = {}): Promise<ReminderResult> {
  return { ok: false, reason: 'unsupported' };
}

/** No-op on web. */
export async function cancelRhythm(routineId: string): Promise<void> {
  // nothing scheduled on web
}

/** No-op on web: the resilience sweep re-schedules NATIVE nudges; web has none to settle. */
export async function rescheduleAllNudges(routines: Routine[], dailyReminderHour: number | null): Promise<void> {
  // nothing scheduled on web
}

/** No-op on web: the nudge health line is a native (this-phone) truth; web shows nothing. */
export async function getNudgeHealth(): Promise<{ count: number; next: { hour: number; minute: number } | null }> {
  return { count: 0, next: null };
}

/** Never relevant on web: "Alarms & reminders" is an Android 12+ special access. */
export function exactAlarmDoorRelevant(): boolean {
  return false;
}

/** No-op on web. */
export async function openExactAlarmSettings(): Promise<void> {
  // nothing to open on web
}

// "Hold me to it" is native-only, like every nudge here: the web build no-ops and the caller
// hides the affordance.
export async function scheduleHold(_taskId: string, _title: string, _heldAt: Date, _opts: { quiet?: boolean } = {}): Promise<string[] | null> {
  return null;
}
export async function cancelHold(): Promise<void> {}
export async function resyncHold(_contract: import('./hold').HoldContract | null): Promise<void> {}
