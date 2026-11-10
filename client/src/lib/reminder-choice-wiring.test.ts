import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Source guards for the parts of "Today in your notifications" (2026-11-10) node cannot run: the native seam's one
// place that arms the nudge, Settings' three choices, and the widget count's hook into the presence check. Each guards
// a failure that would be silent on a phone: the nudge armed beside the glance by a door that never heard of it,
// Settings drawing the choice on the iPhone or the web, a pick skipping the stored-first order, or every error of
// the presence check counted as a widget.
const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

/** A function's source in `src`, from its declaration to the brace that closes it at the same indent. */
function fnBody(src: string, name: string, indent = ''): string {
  const start = src.search(new RegExp(`\\n${indent}(export )?(async )?function ${name}\\(`));
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(`\n${indent}}\n`, start);
  expect(end, `the end of ${name}`).toBeGreaterThan(start);
  return src.slice(start, end + indent.length + 2);
}

describe('the nudge is armed in one place, and never in the glance style', () => {
  const src = read('reminders.ts');

  it('enableDailyReminder hands the glance style to the glance before anything else happens', () => {
    const body = fnBody(src, 'enableDailyReminder');
    const guard = body.indexOf("if (GLANCE_AVAILABLE && (await loadReminderStyle()) === 'glance') return enableTodayGlance(opts);");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(body.indexOf('ensureChannel('));
    expect(guard).toBeLessThan(body.indexOf('scheduleNotificationAsync'));
  });

  it('enableDailyReminder is the only place the daily nudge is ever scheduled, so every door goes through the guard', () => {
    expect(src.match(/identifier: DAILY_ID/g)).toHaveLength(1);
    expect(fnBody(src, 'enableDailyReminder')).toContain('identifier: DAILY_ID');
  });

  it('the web keeps its daily reminder exactly as it was: no style is read there', () => {
    const web = fnBody(read('reminders.web.ts'), 'enableDailyReminder');
    expect(web).not.toMatch(/glance|Style/i);
  });
});

describe('Settings', () => {
  const src = read('../app/settings.tsx');

  it('offers the three choices on Android only, and keeps the two-way switch and its hint everywhere else', () => {
    const android = src.indexOf('{GLANCE_AVAILABLE ? (');
    const elsewhere = src.indexOf("<Choice<'off' | 'on'>", android);
    expect(android).toBeGreaterThanOrEqual(0);
    expect(elsewhere).toBeGreaterThan(android);
    const radios = src.slice(android, elsewhere);
    expect(radios).toContain('accessibilityRole="radiogroup"');
    expect(radios).toContain('accessibilityRole="radio"');
    expect(radios).toContain('aria-checked={on}');
    expect(radios).toContain('{...radioDoor(i, all.length, on, (n) => void pickReminder(all[n].value))}');
    expect(radios).toContain('onPress={() => void pickReminder(c.value)}');
    const choice = src.slice(elsewhere, src.indexOf('/>', elsewhere));
    expect(choice).toContain("hint={t('settings.reminderHint')}");
    expect(choice).toContain("onChange={(v) => setReminder(v === 'on')}");
  });

  it('reads the style only where the choice exists, together with the switch', () => {
    expect(src).toMatch(/if \(GLANCE_AVAILABLE\) \{[^}]*void Promise\.all\(\[loadReminderOn\(\), loadReminderStyle\(\)\]\)/);
    expect(src.match(/loadReminderStyle\(\)/g)).toHaveLength(1);
  });

  it('a pick lands a waiting hour change first, then goes through applyReminderChoice, one at a time', () => {
    expect(src).toContain('const [reminderPickLine] = useState(onePickAtATime);');
    const body = fnBody(src, 'pickReminder', '  ');
    expect(body).toContain('void reminderPickLine(async () => {');
    const settle = body.indexOf('await hourReapplier.settle();');
    expect(settle).toBeGreaterThanOrEqual(0);
    expect(settle).toBeLessThan(body.indexOf('applyReminderChoice('));
  });

  // settle() drops an hour change still waiting to be applied. A tap on the choice already made, a moment after a +
  // or -, used to reach it and then change nothing, so the nudge kept its old hour until the next cold open.
  it('a tap on the choice already made returns before settle(), so a waiting hour change still lands', () => {
    const body = fnBody(src, 'pickReminder', '  ');
    const same = body.indexOf('if (next === reminderChoiceOf({ on: reminderOn, style: reminderStyle })) return;');
    expect(same).toBeGreaterThanOrEqual(0);
    expect(same).toBeLessThan(body.indexOf('await hourReapplier.settle();'));
    expect(same).toBeLessThan(body.indexOf('reminderPickLine('));
  });

  it("reads a refused pick's reason out on Android, and leaves iOS and the web as they were", () => {
    expect(src).toMatch(
      /\{reminderNote && \(\s*<Text style=\{styles\.rowHint\} accessibilityLiveRegion=\{GLANCE_AVAILABLE \? 'polite' : undefined\}>\s*\{reminderNote\}/,
    );
  });

  it("hands the nudge to enableDailyReminder, which reads the style the pick stored first, and the rest to their own", () => {
    const steps = src.slice(src.indexOf('const REMINDER_STEPS: ReminderChoiceSteps = {'), src.indexOf('};', src.indexOf('const REMINDER_STEPS')));
    expect(steps).toContain('saveOn: saveReminderOn,');
    expect(steps).toContain('saveStyle: saveReminderStyle,');
    expect(steps).toContain('enableNudge: enableDailyReminder,');
    expect(steps).toContain('enableGlance: () => enableTodayGlance(),');
    expect(steps).toContain('disableNudge: disableDailyReminder,');
    expect(steps).toContain('disableGlance: disableTodayGlance,');
  });

  it('shows the glance line under the hour only while the glance is chosen', () => {
    expect(src).toContain("const glanceChosen = GLANCE_AVAILABLE && reminderChoice === 'glance';");
    expect(src).toMatch(/\{glanceChosen \? \(\s*<Text style=\{styles\.reminderGlanceNote\} accessibilityLiveRegion="polite">\s*\{glanceSettingsLine\(reminderHour\)\}/);
  });
});

describe('the widget count rides the presence check', () => {
  it("counts only the launcher's real yes: never the fail-closed guess, never iOS's early answer", () => {
    const body = fnBody(read('../widget/presence.ts'), 'hasWidgetPlaced');
    const count = body.indexOf('if (placed) void countWidgetPlaced();');
    const caught = body.indexOf('} catch {');
    expect(count).toBeGreaterThan(body.indexOf('getWidgetInfo'));
    expect(count).toBeLessThan(caught);
    expect(body.slice(caught)).not.toContain('countWidgetPlaced');
    expect(body.slice(0, body.indexOf('try {'))).not.toContain('countWidgetPlaced');
  });

  it('the web never counts', () => {
    expect(read('../widget/presence.web.ts')).not.toContain('countWidgetPlaced');
  });
});
