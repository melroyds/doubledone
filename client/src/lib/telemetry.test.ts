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
    expect(formatEvent({ name: 'breakdown.steps.edited', props: { edited: 3, source: 'elephant' } })).toBe(
      '[doubledone.breakdown.steps.edited] {"edited":3,"source":"elephant"}',
    );
  });
});

describe('the beacon (the few events that leave the device)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a POST /event request for an allowlisted event, the name and its one allowed prop', () => {
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

  // The policy says the app sends the feature's name. Until 2026-10-04 that was true only of what the
  // Worker KEPT: the request itself carried every prop. Now the device strips them.
  it('strips every prop off the wire except the few the Worker folds into a name', () => {
    expect(beaconRequest('nudge.set', { preset: 'in1h' })?.init.body).toBe('{"name":"nudge.set"}');
    expect(beaconRequest('bulk.big', { count: 4, on: true })?.init.body).toBe('{"name":"bulk.big"}');
    expect(beaconRequest('task.reordered', { dir: 'up' })?.init.body).toBe('{"name":"task.reordered"}');
    expect(beaconRequest('slices.defined', { total: 5 })?.init.body).toBe('{"name":"slices.defined"}');
    expect(beaconRequest('hold.released', { step: 3, swapped: true })?.init.body).toBe('{"name":"hold.released","props":{"step":3}}');
    expect(beaconRequest('hold.completed', { step: 1 })?.init.body).toBe('{"name":"hold.completed","props":{"step":1}}');
    expect(beaconRequest('card.opened')?.init.body).toBe('{"name":"card.opened"}');
    expect(beaconRequest('offplan.logged', { at: 'x' })?.init.body).toBe('{"name":"offplan.logged"}');
  });

  it('sends rooms.opened only for Settings, as which door, and keeps every other room local', () => {
    expect(beaconRequest('rooms.opened', { room: 'settings', door: 'shelf' })?.init.body).toBe(
      '{"name":"rooms.opened","props":{"room":"settings","door":"shelf"}}',
    );
    expect(beaconRequest('rooms.opened', { room: 'lookback' })).toBeNull();
    expect(beaconRequest('rooms.opened', { room: 'ours' })).toBeNull();
    expect(beaconRequest('rooms.opened')).toBeNull();
  });

  it('keeps the Goodnight note and the retired names on the device', () => {
    expect(beaconRequest('closeday.noted')).toBeNull();
    expect(beaconRequest('hold.opened')).toBeNull();
  });

  it('stays on-device for everything off the allowlist, including settle.left', () => {
    expect(beaconRequest('settle.left')).toBeNull();
    expect(beaconRequest('task.toggled', { done: true })).toBeNull();
  });

  it('the allowlist is exactly these twenty (growing it is a deliberate act)', () => {
    // settle.* (2026-08), hold.* (2026-08-22), the held-card usage set (2026-08-22), and the
    // telemetry review's three (2026-10-04): each addition pairs with the Worker allowlist AND the
    // privacy policy in the same commit.
    expect([...BEACON_EVENTS].sort()).toEqual([
      'breakdown.started',
      'bulk.big',
      'card.more',
      'card.opened',
      'hold.completed',
      'hold.released',
      'hold.started',
      'leftoff.cleared',
      'leftoff.saved.card',
      'leftoff.saved.focus',
      'nudge.set',
      'offplan.logged',
      'rooms.opened',
      'settle.guide',
      'settle.opened',
      'slices.defined',
      'task.pinned',
      'task.renamed',
      'task.reordered',
      'tiny.made',
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
