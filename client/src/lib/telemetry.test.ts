import { afterEach, describe, expect, it, vi } from 'vitest';

import { BEACON_EVENTS, beaconRequest, formatEvent, TELEMETRY_PREFIX, track } from './telemetry';

describe('telemetry', () => {
  it('namespaces every event under the doubledone prefix', () => {
    expect(TELEMETRY_PREFIX).toBe('doubledone');
    expect(formatEvent({ name: 'task.added' })).toBe('[doubledone.task.added]');
  });

  it('appends props as compact JSON when present', () => {
    expect(formatEvent({ name: 'task.toggled', props: { done: true } })).toBe(
      '[doubledone.task.toggled] {"done":true}',
    );
  });

  it('omits the body for an empty props object', () => {
    expect(formatEvent({ name: 'day.cleared', props: {} })).toBe('[doubledone.day.cleared]');
  });

  it('serialises nested and multi-key props in order', () => {
    expect(formatEvent({ name: 'decomposition.offered', props: { steps: 3, source: 'elephant' } })).toBe(
      '[doubledone.decomposition.offered] {"steps":3,"source":"elephant"}',
    );
  });
});

describe('the beacon (the few events that leave the device)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a POST /event request for an allowlisted event, name + props and nothing else', () => {
    const req = beaconRequest('settle.guide', { on: false });
    expect(req).not.toBeNull();
    expect(req?.url.endsWith('/event')).toBe(true);
    expect(req?.init.method).toBe('POST');
    expect(req?.init.body).toBe('{"name":"settle.guide","props":{"on":false}}');
    expect(req?.init.keepalive).toBe(true);
  });

  it('carries no props field at all for a propless event', () => {
    expect(beaconRequest('settle.opened')?.init.body).toBe('{"name":"settle.opened"}');
  });

  it('stays on-device for everything off the allowlist, including settle.left', () => {
    expect(beaconRequest('settle.left')).toBeNull();
    expect(beaconRequest('task.toggled', { done: true })).toBeNull();
  });

  it('the allowlist is exactly these six (growing it is a deliberate act)', () => {
    // Grew 2026-08-22 with the hold.* trio, paired with the Worker allowlist AND the privacy
    // policy's feature-usage section in the same commit, as the rule requires. hold events carry
    // `step` (a capped number) and nothing else; the server folds it into coarse buckets.
    expect([...BEACON_EVENTS].sort()).toEqual([
      'hold.completed',
      'hold.released',
      'hold.started',
      'settle.guide',
      'settle.opened',
    ]);
  });

  it('track fires the beacon once for an allowlisted event and never for others', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    track('settle.opened');
    track('task.added');
    track('settle.left');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/event$/);
  });

  it('track survives a synchronously-throwing fetch (best effort, never surfaced)', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('no network stack');
      }),
    );
    expect(() => track('settle.opened')).not.toThrow();
  });
});
