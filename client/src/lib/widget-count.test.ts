import { beforeEach, describe, expect, it, vi } from 'vitest';

import { claimWidgetCountDay } from './storage';
import { track } from './telemetry';
import { countWidgetPlaced, widgetCounter } from './widget-count';

vi.mock('./telemetry', () => ({ track: vi.fn() }));
vi.mock('./storage', () => ({ claimWidgetCountDay: vi.fn(() => Promise.resolve(true)) }));

// The widget.placed count: at most once a day on this device, and nothing on a failed or refused claim, because a
// missed count is a small error and a doubled one would overstate the very demand it exists to measure.

const at = (d: number, h = 9) => new Date(2026, 10, d, h);
const sent = () => vi.mocked(track).mock.calls.filter(([name]) => name === 'widget.placed').length;

beforeEach(() => vi.mocked(track).mockClear());

describe('widgetCounter', () => {
  it('counts the first positive check of a day, once, and claims the local day', async () => {
    const claim = vi.fn(() => Promise.resolve(true));
    const count = widgetCounter(claim);
    expect(await count(at(10, 9))).toBe(true);
    expect(claim).toHaveBeenCalledWith('2026-11-10');
    expect(sent()).toBe(1);
  });

  it('never reaches storage twice in a day, so two checks racing on a cold open cannot both count', async () => {
    const claim = vi.fn(() => Promise.resolve(true));
    const count = widgetCounter(claim);
    const both = await Promise.all([count(at(10, 9)), count(at(10, 9))]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(await count(at(10, 23))).toBe(false);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(sent()).toBe(1);
  });

  it('counts again on the next local day', async () => {
    const claim = vi.fn(() => Promise.resolve(true));
    const count = widgetCounter(claim);
    await count(at(10, 23));
    expect(await count(at(11, 0))).toBe(true);
    expect(claim).toHaveBeenLastCalledWith('2026-11-11');
    expect(sent()).toBe(2);
  });

  it('sends nothing when the day was already claimed (an earlier run of the app), or the claim fails', async () => {
    expect(await widgetCounter(() => Promise.resolve(false))(at(10))).toBe(false);
    expect(await widgetCounter(() => Promise.reject(new Error('storage down')))(at(10))).toBe(false);
    expect(sent()).toBe(0);
  });

  it('a failed claim is not retried the same day: missing beats doubled', async () => {
    const claim = vi.fn<(day: string) => Promise<boolean>>().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(true);
    const count = widgetCounter(claim);
    expect(await count(at(10, 9))).toBe(false);
    expect(await count(at(10, 10))).toBe(false);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(await count(at(11, 9))).toBe(true);
    expect(sent()).toBe(1);
  });

  it('the app-wide counter claims through lib/storage', async () => {
    expect(await countWidgetPlaced(at(12))).toBe(true);
    expect(claimWidgetCountDay).toHaveBeenCalledWith('2026-11-12');
    expect(sent()).toBe(1);
  });
});
