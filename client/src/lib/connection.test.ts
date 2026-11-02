import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { en } from './catalogs/en';
import { aiErrorLine, premiumMiss, premiumMissLine } from './connection';

describe('aiErrorLine', () => {
  it('keeps the caller fallback when online', () => {
    expect(aiErrorLine('Could not sort just now. Try again.', false)).toBe('Could not sort just now. Try again.');
  });

  it('swaps in the calm offline line when offline', () => {
    const line = aiErrorLine('Could not sort just now. Try again.', true);
    expect(line).toContain('offline');
    expect(line).toContain('safe here');
    expect(line).not.toContain('Try again'); // the futile-retry nudge is exactly what offline must not say
  });

  it('never shames and never exclaims', () => {
    const line = aiErrorLine('x', true);
    expect(line).not.toMatch(/!/);
  });
});

// Premium without an account (2026-11-03): a refused Premium AI call used to show the feature's one error line, and
// Chart's said "Try rephrasing the goal?" to a paying iPhone whose request the server never answered with an AI.
describe('premiumMiss: what a refused or failed status means', () => {
  it('401 is not_confirmed, 403 is not_active, everything else is unavailable', () => {
    expect(premiumMiss(401)).toBe('not_confirmed');
    expect(premiumMiss(403)).toBe('not_active');
    // the AI limiter and the per-purchase cap (429), the store check or a store that cannot decide (503), the AI
    // itself (502), the Worker (500), and anything odd
    for (const s of [429, 500, 502, 503, 400, 413, 404, 0]) expect(premiumMiss(s), String(s)).toBe('unavailable');
  });
});

describe('premiumMissLine: each miss gets the line that is true of it', () => {
  const RETRY = "I couldn't map that out just now. Your goal is still here, so try again in a moment.";

  it('a refusal says the check found no active Premium, and that nothing went to the AI', () => {
    expect(premiumMissLine('not_active', RETRY, false)).toBe(en.premium.aiNotActive);
    expect(en.premium.aiNotActive).toBe(
      "We couldn't find an active Premium for you just now, so nothing went to the AI. If you've only just bought or restored it, give it a minute and try again.",
    );
  });

  it('an unconfirmed one says Premium could not be confirmed, and that nothing went to the AI', () => {
    expect(premiumMissLine('not_confirmed', RETRY, false)).toBe(en.premium.aiNotConfirmed);
    expect(en.premium.aiNotConfirmed).toBe("We couldn't confirm your Premium just now, so nothing went to the AI. Try again in a moment.");
  });

  it("a dropped call is the feature's own retry line, and only it becomes the offline line", () => {
    expect(premiumMissLine('unavailable', RETRY, false)).toBe(RETRY);
    expect(premiumMissLine('unavailable', RETRY, true)).toBe(en.common.offlineLine);
    // a 401 or a 403 came back from the server, so the device was online: never the offline line
    expect(premiumMissLine('not_active', RETRY, true)).toBe(en.premium.aiNotActive);
    expect(premiumMissLine('not_confirmed', RETRY, true)).toBe(en.premium.aiNotConfirmed);
  });

  it('every status reaches exactly one of the three lines', () => {
    const lines = (status: number) => premiumMissLine(premiumMiss(status), RETRY, false);
    expect(lines(401)).toBe(en.premium.aiNotConfirmed);
    expect(lines(403)).toBe(en.premium.aiNotActive);
    for (const s of [429, 500, 502, 503]) expect(lines(s)).toBe(RETRY);
  });

  it('no miss line blames the input, shames, or exclaims, in the Premium keys or any retry line the screens pass', () => {
    const misses = [en.premium.aiNotActive, en.premium.aiNotConfirmed];
    const retries = [en.chart.mapRetry, en.capture.errorReadPhoto, en.today.sequenceError, en.lookback.reflectError];
    for (const line of [...misses, ...retries]) {
      expect(line).not.toMatch(/rephras|couldn't read any tasks|!/i);
    }
    // and the two that only the AI's own empty answer may use are still there for it
    expect(en.chart.mapError).toMatch(/rephras/i);
    expect(en.capture.errorNoTasksRead).toMatch(/couldn't read any tasks/);
  });
});

// The four screens are not rendered by the harness, so how they use the lines is held in their source (the
// settings.test.ts precedent). The facts that matter: a miss reads premiumMissLine with the feature's own retry line,
// the line that blames the input is shown ONLY for the AI's own empty answer, and every miss is noted, which is what
// rechecks Premium after a refusal (lib/premium-provider usePremiumMiss).
describe('the four Premium AI screens say what happened', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
  const count = (src: string, needle: string) => src.split(needle).length - 1;

  it("Chart a course: a miss is the retry line, a throw too, and only the AI's empty course suggests rephrasing", () => {
    const src = read('app', 'chart.tsx');
    expect(src).toContain("setError(premiumMissLine(r.miss, t('chart.mapRetry')));");
    expect(src).toContain("noteMiss('chart', r.miss);");
    expect(count(src, "t('chart.mapError')")).toBe(1);
    expect(src).toMatch(/\} else if \(r\.value\.steps\.length === 0\) \{[^}]*setError\(aiErrorLine\(t\('chart\.mapError'\)\)\);/);
    expect(src).toMatch(/\} catch \{[^}]*setError\(aiErrorLine\(t\('chart\.mapRetry'\)\)\);/);
  });

  it('Scan: a miss is the photo retry line, and only an empty read says no tasks were read', () => {
    const src = read('components', 'CameraCapture.tsx');
    expect(src).toContain("setError(premiumMissLine(r.miss, t('capture.errorReadPhoto')));");
    expect(src).toContain("noteMiss('scan', r.miss);");
    expect(count(src, "t('capture.errorNoTasksRead')")).toBe(1);
    expect(src).toMatch(/if \(r\.value\.length === 0\) \{\s*setError\(t\('capture\.errorNoTasksRead'\)\);/);
  });

  it('Plan my day and Reflect on this week: a miss is their own retry line, and is noted', () => {
    const today = read('app', 'today.tsx');
    expect(today).toContain("setOrderError(premiumMissLine(result.miss, t('today.sequenceError')));");
    expect(today).toContain("notePremiumMiss('sequence', result.miss);");
    const lookback = read('app', 'lookback.tsx');
    expect(lookback).toContain("setSummaryError(premiumMissLine(r.miss, t('lookback.reflectError')));");
    expect(lookback).toContain("notePremiumMiss('reflect', r.miss);");
  });
});
