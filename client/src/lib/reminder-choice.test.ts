import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReminderStyle } from './glance';
import {
  applyReminderChoice,
  glanceSettingsLine,
  onePickAtATime,
  type ReminderChoice,
  reminderChoiceOf,
  type ReminderChoiceSteps,
  reminderOptions,
} from './reminder-choice';
import { formatReminderHour, type ReminderResult } from './reminders-types';
import { track } from './telemetry';

vi.mock('./telemetry', () => ({ track: vi.fn() }));

// Android's three reminder choices, walked through a fake phone. The fake keeps what is STORED (the switch and the
// style) and what is ARMED (the nudge), and its enableNudge reads the stored style the way lib/reminders'
// enableDailyReminder does: in the glance style it brings the glance and never arms the nudge. The glance itself is
// up whenever the stored choice says so, which is what the change notice's refresh makes true a second later.
//
// The fake phone is also handed in as `prev`, so every step changes the very object the pick started from. That is
// deliberate: it proves applyReminderChoice takes its snapshot before the first step, or a failed pick would "restore"
// the style it had just stored.

type Phone = { on: boolean; style: ReminderStyle; nudge: boolean; calls: string[] };

const OK: ReminderResult = { ok: true };
const DENIED: ReminderResult = { ok: false, reason: 'denied' };
const ERROR: ReminderResult = { ok: false, reason: 'error' };

function phoneAt(choice: ReminderChoice, style: ReminderStyle = choice === 'off' ? 'nudge' : choice): Phone {
  return { on: choice !== 'off', style, nudge: choice === 'nudge', calls: [] };
}

function steps(p: Phone, answer: { nudge?: ReminderResult; glance?: ReminderResult } = {}): ReminderChoiceSteps {
  return {
    saveOn: async (on) => {
      p.calls.push(`saveOn ${on}`);
      p.on = on;
    },
    saveStyle: async (style) => {
      p.calls.push(`saveStyle ${style}`);
      p.style = style;
    },
    enableNudge: async (hour, opts) => {
      p.calls.push(`enableNudge ${hour}${opts?.quiet ? ' quiet' : ''} (stored ${p.style})`);
      const r = answer.nudge ?? OK;
      if (r.ok && p.style === 'nudge') p.nudge = true;
      if (r.ok && p.style === 'glance') p.nudge = false; // enableTodayGlance cancels it
      return r;
    },
    enableGlance: async () => {
      p.calls.push('enableGlance');
      const r = answer.glance ?? OK;
      if (r.ok) p.nudge = false;
      return r;
    },
    disableNudge: async () => {
      p.calls.push('disableNudge');
      p.nudge = false;
    },
    disableGlance: async () => {
      p.calls.push('disableGlance');
    },
  };
}

const glanceUp = (p: Phone) => p.on && p.style === 'glance';
const tracked = () => vi.mocked(track).mock.calls.map(([name, props]) => (props ? `${name} ${JSON.stringify(props)}` : name));

beforeEach(() => vi.mocked(track).mockClear());

describe('reminderChoiceOf', () => {
  it('reads the switch first: a style kept while the reminder is off is Off', () => {
    expect(reminderChoiceOf({ on: true, style: 'nudge' })).toBe('nudge');
    expect(reminderChoiceOf({ on: true, style: 'glance' })).toBe('glance');
    expect(reminderChoiceOf({ on: false, style: 'glance' })).toBe('off');
    expect(reminderChoiceOf({ on: false, style: 'nudge' })).toBe('off');
  });
});

describe('reminderOptions (the row, in English)', () => {
  it('is Off, then the nudge, then the glance, the hour in both labels, never a number but the time', () => {
    const at = formatReminderHour(9);
    const o = reminderOptions(9);
    expect(o.map((x) => x.value)).toEqual(['off', 'nudge', 'glance']);
    expect(o[0]).toEqual({ value: 'off', label: 'Off' });
    expect(o[1]).toEqual({ value: 'nudge', label: `A nudge at ${at}`, sub: "One gentle notification, then it's gone." });
    expect(o[2]).toEqual({ value: 'glance', label: `Stays from ${at} until done`, sub: 'Sits quietly in your notifications. Never sounds or buzzes.' });
    expect(o[1].label.replace(/\s/g, ' ')).toBe('A nudge at 9:00 am');
    for (const x of o) expect(`${x.label} ${x.sub ?? ''}`.replace(at, '')).not.toMatch(/\d/);
  });

  it('follows the stepper', () => {
    expect(reminderOptions(7)[2].label).toBe(`Stays from ${formatReminderHour(7)} until done`);
    expect(reminderOptions(20)[1].label).toBe(`A nudge at ${formatReminderHour(20)}`);
  });

  it('never says "live", and no em dash or semicolon', () => {
    const emDash = String.fromCharCode(0x2014);
    for (const hour of [6, 9, 20, 21, 23]) {
      const words = [...reminderOptions(hour).flatMap((x) => [x.label, x.sub ?? '']), glanceSettingsLine(hour)].join(' ');
      expect(words).not.toMatch(/\blive\b/i);
      expect(words.includes(emDash)).toBe(false);
      expect(words.includes(';')).toBe(false);
    }
  });
});

describe('glanceSettingsLine', () => {
  it('says when it leaves while the hour leaves a window, and asks for an earlier time from 9 pm', () => {
    expect(glanceSettingsLine(9)).toMatch(/^It leaves when the day's done, or by .+\. Your lock screen shows it if your phone allows\.$/);
    expect(glanceSettingsLine(20)).toBe(glanceSettingsLine(9));
    for (const late of [21, 22, 23]) expect(glanceSettingsLine(late)).toMatch(/^Pick a time before .+ for this one\.$/);
  });
});

describe('applyReminderChoice: what a pick does, in order', () => {
  it('a tap on the choice already made does nothing at all', async () => {
    for (const choice of ['off', 'nudge', 'glance'] as const) {
      const p = phoneAt(choice);
      expect(await applyReminderChoice(p, choice, 9, steps(p))).toBeNull();
      expect(p.calls).toEqual([]);
    }
    expect(track).not.toHaveBeenCalled();
  });

  it('Off to the nudge: the style is stored, any glance taken down, then the nudge armed and the switch stored on', async () => {
    const p = phoneAt('off');
    expect(await applyReminderChoice(p, 'nudge', 9, steps(p))).toEqual({ on: true, style: 'nudge', reason: null });
    expect(p.calls).toEqual(['saveStyle nudge', 'disableGlance', 'enableNudge 9 (stored nudge)', 'saveOn true']);
    expect(p.nudge).toBe(true);
    expect(glanceUp(p)).toBe(false);
    expect(tracked()).toEqual(['reminder.enabled {"granted":true,"style":"nudge"}']);
  });

  it('Off to the glance: the style is stored first, then the glance turned on, and counted', async () => {
    const p = phoneAt('off');
    expect(await applyReminderChoice(p, 'glance', 9, steps(p))).toEqual({ on: true, style: 'glance', reason: null });
    expect(p.calls).toEqual(['saveStyle glance', 'enableGlance', 'saveOn true']);
    expect(glanceUp(p)).toBe(true);
    expect(p.nudge).toBe(false);
    expect(tracked()).toEqual(['reminder.enabled {"granted":true,"style":"glance"}', 'glance.on']);
  });

  it('the nudge to the glance replaces it: the nudge is cancelled, never both', async () => {
    const p = phoneAt('nudge');
    expect(await applyReminderChoice(p, 'glance', 9, steps(p))).toEqual({ on: true, style: 'glance', reason: null });
    expect(p.calls).toEqual(['saveStyle glance', 'enableGlance', 'saveOn true']);
    expect(p.nudge).toBe(false);
    expect(glanceUp(p)).toBe(true);
    // Already on, so no second "enabled", only the glance's own count.
    expect(tracked()).toEqual(['glance.on']);
  });

  it('the glance to the nudge: "nudge" is stored BEFORE the glance comes down and before the nudge is armed', async () => {
    const p = phoneAt('glance');
    expect(await applyReminderChoice(p, 'nudge', 9, steps(p))).toEqual({ on: true, style: 'nudge', reason: null });
    // The order is the guarantee: a glance refresh already on its way reads 'nudge' or finishes inside disableGlance,
    // so none can cancel the nudge, and enableDailyReminder (which reads the stored style) arms the nudge itself.
    expect(p.calls).toEqual(['saveStyle nudge', 'disableGlance', 'enableNudge 9 (stored nudge)', 'saveOn true']);
    expect(p.nudge).toBe(true);
    expect(glanceUp(p)).toBe(false);
    expect(tracked()).toEqual(['glance.off']);
  });

  it('the glance to Off: the switch is stored off FIRST, then both are cancelled, and the leaving counted', async () => {
    const p = phoneAt('glance');
    expect(await applyReminderChoice(p, 'off', 9, steps(p))).toEqual({ on: false, style: 'glance', reason: null });
    expect(p.calls).toEqual(['saveOn false', 'disableNudge', 'disableGlance']);
    expect(glanceUp(p)).toBe(false);
    expect(p.nudge).toBe(false);
    expect(tracked()).toEqual(['reminder.disabled', 'glance.off']);
  });

  it('the nudge to Off cancels both too, and counts no glance', async () => {
    const p = phoneAt('nudge');
    expect(await applyReminderChoice(p, 'off', 9, steps(p))).toEqual({ on: false, style: 'nudge', reason: null });
    expect(p.calls).toEqual(['saveOn false', 'disableNudge', 'disableGlance']);
    expect(p.nudge).toBe(false);
    expect(tracked()).toEqual(['reminder.disabled']);
  });

  it('a glance switched off elsewhere (Today) and then a nudge picked is no glance.off: it was already off', async () => {
    const p = phoneAt('off', 'glance');
    expect(await applyReminderChoice(p, 'nudge', 8, steps(p))).toEqual({ on: true, style: 'nudge', reason: null });
    expect(p.calls).toEqual(['saveStyle nudge', 'disableGlance', 'enableNudge 8 (stored nudge)', 'saveOn true']);
    expect(tracked()).toEqual(['reminder.enabled {"granted":true,"style":"nudge"}']);
  });

  it('the stepper hour is the one armed', async () => {
    const p = phoneAt('off');
    await applyReminderChoice(p, 'nudge', 17, steps(p));
    expect(p.calls).toContain('enableNudge 17 (stored nudge)');
  });
});

describe('applyReminderChoice: a pick that cannot go through leaves everything as it was', () => {
  it('Off to the glance, refused: the style goes back, the switch was never touched, nothing counted but the try', async () => {
    const p = phoneAt('off');
    expect(await applyReminderChoice(p, 'glance', 9, steps(p, { glance: DENIED }))).toEqual({ on: false, style: 'nudge', reason: 'denied' });
    expect(p.calls).toEqual(['saveStyle glance', 'enableGlance', 'saveStyle nudge']);
    expect(p).toMatchObject({ on: false, style: 'nudge', nudge: false });
    expect(tracked()).toEqual(['reminder.enabled {"granted":false,"style":"glance"}']);
  });

  it('Off to the nudge, refused: Off it stays, with the reason', async () => {
    const p = phoneAt('off', 'glance');
    expect(await applyReminderChoice(p, 'nudge', 9, steps(p, { nudge: DENIED }))).toEqual({ on: false, style: 'glance', reason: 'denied' });
    expect(p.calls).toEqual(['saveStyle nudge', 'disableGlance', 'enableNudge 9 (stored nudge)', 'saveStyle glance']);
    expect(p).toMatchObject({ on: false, style: 'glance', nudge: false });
  });

  it('the nudge to the glance, refused: the nudge stays the reminder, re-armed quietly in case a refresh cancelled it', async () => {
    const p = phoneAt('nudge');
    expect(await applyReminderChoice(p, 'glance', 9, steps(p, { glance: DENIED }))).toEqual({ on: true, style: 'nudge', reason: 'denied' });
    expect(p.calls).toEqual(['saveStyle glance', 'enableGlance', 'saveStyle nudge', 'enableNudge 9 quiet (stored nudge)']);
    expect(p).toMatchObject({ on: true, style: 'nudge', nudge: true });
    expect(glanceUp(p)).toBe(false);
    expect(tracked()).toEqual([]);
  });

  it('the glance to the nudge, failed: "glance" is stored again, so its refresh brings it back, and no nudge is left armed', async () => {
    const p = phoneAt('glance');
    expect(await applyReminderChoice(p, 'nudge', 9, steps(p, { nudge: ERROR }))).toEqual({ on: true, style: 'glance', reason: 'error' });
    expect(p.calls).toEqual(['saveStyle nudge', 'disableGlance', 'enableNudge 9 (stored nudge)', 'saveStyle glance']);
    expect(glanceUp(p)).toBe(true);
    expect(p.nudge).toBe(false);
    expect(tracked()).toEqual([]);
  });
});

describe('onePickAtATime', () => {
  it('drops a pick asked for while one is going through, then takes the next', async () => {
    const run = onePickAtATime();
    let release: () => void = () => {};
    const ran: string[] = [];
    const first = run(
      () =>
        new Promise<void>((resolve) => {
          ran.push('first');
          release = resolve;
        }),
    );
    expect(await run(async () => void ran.push('second'))).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(await run(async () => void ran.push('third'))).toBe(true);
    expect(ran).toEqual(['first', 'third']);
  });

  it('a job that throws frees the runner and never rejects', async () => {
    const run = onePickAtATime();
    await expect(run(() => Promise.reject(new Error('surprise')))).resolves.toBe(true);
    expect(await run(async () => undefined)).toBe(true);
  });

  it('each runner keeps its own turn', async () => {
    const a = onePickAtATime();
    const b = onePickAtATime();
    let release: () => void = () => {};
    const held = a(() => new Promise<void>((resolve) => (release = resolve)));
    expect(await b(async () => undefined)).toBe(true);
    release();
    await held;
  });
});

describe('never both: every pick from every state ends with at most one of the two', () => {
  // Every stored state: Off with either style kept, and on in each style.
  const from: [ReminderChoice, ReminderStyle][] = [
    ['off', 'nudge'],
    ['off', 'glance'],
    ['nudge', 'nudge'],
    ['glance', 'glance'],
  ];
  for (const [choice, style] of from) {
    for (const to of ['off', 'nudge', 'glance'] as const) {
      for (const answer of [OK, DENIED, ERROR]) {
        it(`${choice} (style ${style}) to ${to}, ${answer.ok ? 'granted' : answer.reason}`, async () => {
          const p = phoneAt(choice, style);
          await applyReminderChoice(p, to, 9, steps(p, { nudge: answer, glance: answer }));
          expect(p.nudge && glanceUp(p)).toBe(false);
          // Whatever happened, a nudge is armed only when the stored choice is the nudge, and Off leaves nothing armed.
          if (p.nudge) expect(reminderChoiceOf(p)).toBe('nudge');
          if (reminderChoiceOf(p) === 'off') expect(p.nudge).toBe(false);
        });
      }
    }
  }
});
