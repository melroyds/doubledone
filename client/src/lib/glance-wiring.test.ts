import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildGlance, glanceExpiry } from './glance';
import { glanceData } from './glance-refresh';

// "Today in your notifications" crosses three places node cannot run: the Kotlin builder patch, the native seam in
// lib/reminders and the root layout. Each check below guards a failure that would be silent on a phone: a key the
// patch reads that the seam never writes (no expiry, so last night's list could stay up), a channel created with
// sound or at the wrong importance (fixed for good on first creation), a post with no channel (expo's HIGH fallback
// pops up and buzzes), the nudge re-armed beside the glance, or the wiring gone.
const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

/** A top-level function's source in `src`, from its declaration to the closing brace at column 0. */
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`\\nexport (async )?function ${name}\\(|\\n(async )?function ${name}\\(`));
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end + 2);
}

describe('the Kotlin patch reads exactly what the seam writes', () => {
  const patch = read('../../../patches/expo-notifications+56.0.18.patch');
  const added = patch
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');
  const content = buildGlance([{ id: 'a', title: 'Water the plants', done: false, createdAt: 1, updatedAt: 1 }], new Date(2026, 10, 10, 10), null);
  const data = glanceData(content, glanceExpiry(new Date(2026, 10, 10, 10)));

  it('patches only the builder, in one file', () => {
    expect(patch.match(/^diff --git /gm)).toHaveLength(1);
    expect(patch).toContain('presentation/builders/ExpoNotificationBuilder.kt');
  });

  it('marks, expires and expands by the same keys the data carries', () => {
    expect(data).toMatchObject({ glance: true, expiresAtMs: expect.any(Number), bigText: expect.any(String) });
    expect(added).toContain('optBoolean("glance", false)');
    expect(added).toContain('optLong("expiresAtMs", 0L)');
    expect(added).toContain('optString("bigText", "")');
  });

  it('only a glance gets only-alert-once, no time and its own expanded view', () => {
    const branch = added.slice(added.indexOf('if (glance != null) {'));
    expect(branch).toMatch(/if \(glance != null\) \{\n\+\s+builder\.setOnlyAlertOnce\(true\)\n\+\s+builder\.setShowWhen\(false\)/);
    expect(added).toContain('builder.setStyle(NotificationCompat.BigTextStyle().bigText(it))');
  });

  it('the absolute expiry wins for a glance, and every other notification keeps its relative shelf life', () => {
    expect(added).toContain('builder.setTimeoutAfter(max(1L, glanceExpiresAtMs - System.currentTimeMillis()))');
    expect(added).toMatch(/\} else \{\n\+\s+content\.body\?\.optLong\("timeoutAfterMs", 0L\)\?\.takeIf \{ it > 0L \}\?\.let \{ builder\.setTimeoutAfter\(it\) \}/);
  });
});

describe('the native seam (lib/reminders)', () => {
  const src = read('reminders.ts');

  it('creates its channel silent and at DEFAULT importance: no sound, no vibration, no badge', () => {
    const channel = fnBody(src, 'ensureGlanceChannel');
    expect(channel).toContain('setNotificationChannelAsync(GLANCE_CHANNEL,');
    expect(channel).toContain('importance: Notifications.AndroidImportance.DEFAULT,');
    expect(channel).toContain('sound: null,');
    expect(channel).toContain('enableVibrate: false,');
    expect(channel).toContain('showBadge: false,');
  });

  it('creates the channel before every post and every schedule, and posts on it, never with a null trigger', () => {
    for (const name of ['postGlance', 'scheduleGlanceArrival', 'enableTodayGlance']) {
      const body = fnBody(src, name);
      expect(body.indexOf('await ensureGlanceChannel();'), name).toBeGreaterThanOrEqual(0);
      const scheduled = body.indexOf('scheduleNotificationAsync');
      if (scheduled >= 0) expect(body.indexOf('await ensureGlanceChannel();'), name).toBeLessThan(scheduled);
    }
    expect(fnBody(src, 'postGlance')).toContain('trigger: { channelId: GLANCE_CHANNEL },');
    expect(fnBody(src, 'scheduleGlanceArrival')).toContain('channelId: GLANCE_CHANNEL');
    expect(src).not.toMatch(/trigger:\s*null/);
  });

  // expo counts a banner and a list alike as "show it", and without the priority its builder raises a foreground post
  // to PRIORITY_HIGH, a heads-up wherever no channel decides. So the priority is pinned with the rest.
  it('shows the glance in the shade only, never as a banner, at default priority, with the app open', () => {
    expect(src).toMatch(
      /notification\.request\.identifier === GLANCE_ID\s*\?\s*\{\s*shouldShowBanner: false,\s*shouldShowList: true,\s*shouldPlaySound: false,\s*shouldSetBadge: false,\s*priority: Notifications\.AndroidNotificationPriority\.DEFAULT,\s*\}/,
    );
    expect(src).toContain('handleError: (notificationId, error) => onGlanceHandlerError(notificationId, error),');
  });

  // Below Android 8 there are no channels and no expiry, so the glance could neither stay silent by its channel nor
  // leave by 9:30 pm with the app closed. Every door of the seam checks the same flag Settings draws the choice from.
  it('exists on Android 8 (API 26) and later only, and every door of the seam checks that', () => {
    expect(src).toContain(
      "export const GLANCE_AVAILABLE: boolean = Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 26;",
    );
    for (const name of ['runGlanceRefresh', 'refreshTodayGlance', 'disableTodayGlance', 'onGlanceHandlerError']) {
      expect(fnBody(src, name), name).toContain('if (!GLANCE_AVAILABLE) return;');
    }
    expect(fnBody(src, 'watchTodayGlance')).toContain('if (!GLANCE_AVAILABLE) return () => {};');
    expect(fnBody(src, 'enableTodayGlance')).toContain("if (!GLANCE_AVAILABLE) return { ok: false, reason: 'unsupported' };");
  });

  it("leaves the glance's arrival out of the nudge count, so the Routines warning still shows", () => {
    expect(fnBody(src, 'getNudgeHealth')).toContain('.filter((n) => n.identifier !== GLANCE_ID)');
  });

  it('cancels the old arrival before it posts, so a late alarm cannot land over a fresh post', () => {
    const body = fnBody(src, 'runGlanceRefresh');
    const cancel = body.indexOf('cancelScheduledNotificationAsync(GLANCE_ID)');
    expect(cancel).toBeGreaterThanOrEqual(0);
    expect(cancel).toBeLessThan(body.indexOf('postGlance('));
    expect(cancel).toBeLessThan(body.indexOf('scheduleGlanceArrival('));
  });

  it('never writes what it reads, so no refresh can set off another', () => {
    const body = fnBody(src, 'runGlanceRefresh');
    for (const write of ['saveTasks', 'saveClosedDate', 'saveHold', 'saveReminderOn', 'saveReminderHour', 'saveReminderStyle', 'loadTasks(']) {
      expect(body, write).not.toContain(write);
    }
    expect(body).toContain('peekTasks()');
  });

  it('takes the glance down explicitly on an account wipe', () => {
    expect(fnBody(src, 'watchTodayGlance')).toMatch(/change === 'wipe'[\s\S]*takeDownGlance\(\)/);
  });

  it('refreshes each time the app comes back to the foreground', () => {
    expect(fnBody(src, 'watchTodayGlance')).toMatch(/AppState\.addEventListener\('change', \(state\) => \{\s*if \(state === 'active'\) refreshTodayGlance\(\);/);
  });

  // A post made with the app open is still in the JS handler when its refresh ends, and can land after a take-down
  // that came next: an old list up until 9:30 pm, or a deleted account's titles.
  // The app's own take-downs forget every sign the glance went up, so its own leave is never read as a swipe: the
  // refresh settles `removed`, the wipe forgets them when it took a showing glance down (and always forgets the arrival
  // it cancelled), and a half-done take-down after Off forgets them and any verdict.
  it("forgets the signs on the app's own take-downs: a refresh, an account wipe, and a half-done Off", () => {
    const refresh = fnBody(src, 'runGlanceRefresh');
    expect(refresh).toMatch(/settleGlanceMemory\(plan, now, \{[^}]*\bremoved\b[^}]*\}\)/);
    expect(refresh).toContain('else if (memory.hour !== null) await saveGlanceMemory(halfDoneGlanceMemory(memory));');
    // The shade is read BEFORE the take-down (what it held decides what is forgotten), an unreadable one is 'unknown'.
    expect(fnBody(src, 'watchTodayGlance')).toMatch(
      /getPresentedNotificationsAsync\(\)[\s\S]*?'unknown' as const[\s\S]*?await takeDownGlance\(\);[\s\S]*?wipedGlanceMemory\(memory, before, Date\.now\(\)\)[\s\S]*?lookAgainLater\(\);/,
    );
    expect(fnBody(src, 'disableTodayGlance')).toContain('halfDoneGlanceMemory(memory)');
    expect(src).not.toMatch(/takenDownAt/);
  });

  it('looks again a little later after every post and every take-down, and a look again books none of its own', () => {
    const refresh = fnBody(src, 'runGlanceRefresh');
    expect(refresh).toContain("if ((posted || plan.action === 'remove') && !lookingAgain) lookAgainLater();");
    expect(refresh).toContain('if (memory.hour === null && !lookingAgain) return;');
    expect(refresh).toContain('if (!lookingAgain) lookAgainLater();');
    expect(fnBody(src, 'watchTodayGlance')).toMatch(/await takeDownGlance\(\);[\s\S]*?lookAgainLater\(\);/);
    expect(fnBody(src, 'disableTodayGlance')).toMatch(/takeDownGlance\(\)[\s\S]*lookAgainLater\(\);/);
    const look = fnBody(src, 'lookAgainLater');
    const inside = look.slice(look.indexOf('{'));
    expect(inside).toContain('GLANCE_SETTLE_MS');
    expect(inside).toContain('glanceLookingAgain = true;');
    expect(inside).not.toContain('lookAgainLater(');
  });

  it('never records an arrival the phone took after its moment, and refreshes instead', () => {
    const refresh = fnBody(src, 'runGlanceRefresh');
    const missed = refresh.indexOf('const missed = scheduledNext && glanceArrivalMissed(plan, Date.now());');
    expect(missed).toBeGreaterThan(refresh.indexOf('scheduleGlanceArrival('));
    expect(refresh).toContain('scheduled: scheduledNext && !missed');
    expect(refresh).toContain('if (missed) refreshTodayGlance();');
  });
});

describe('the wiring', () => {
  it('the root layout watches the glance once, for the life of the app', () => {
    expect(read('../app/_layout.tsx')).toContain('useEffect(() => watchTodayGlance(), [])');
  });

  it('no path that re-arms the nudge from storage re-arms it beside the glance', () => {
    for (const path of ['../app/_layout.tsx', '../app/routines.tsx']) {
      const src = read(path);
      expect(src, path).toContain('dailyNudgeHour(reminderOn, reminderStyle, reminderHour)');
      expect(src, path).not.toContain('reminderOn ? reminderHour : null');
    }
  });

  it("the widget skips the reminder's settings, which change nothing it shows", () => {
    expect(read('../widget/update.tsx')).toContain("if (change !== 'reminder') void refresh();");
  });

  it('the web twin answers every glance call without doing anything', () => {
    const web = read('reminders.web.ts');
    expect(web).toContain('export const GLANCE_AVAILABLE = false;');
    expect(fnBody(web, 'enableTodayGlance')).toContain("reason: 'unsupported'");
  });
});
