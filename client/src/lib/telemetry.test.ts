import { afterEach, describe, expect, it, vi } from 'vitest';

import { BEACON_EVENTS, beaconRequest, formatEvent, SEND_TIMEOUT_MS, TELEMETRY_PREFIX, track, trackSent } from './telemetry';

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
  });

  it('sends rooms.opened only for Settings, as which door, and keeps every other room local', () => {
    expect(beaconRequest('rooms.opened', { room: 'settings', door: 'shelf' })?.init.body).toBe(
      '{"name":"rooms.opened","props":{"room":"settings","door":"shelf"}}',
    );
    expect(beaconRequest('rooms.opened', { room: 'lookback' })).toBeNull();
    expect(beaconRequest('rooms.opened', { room: 'ours' })).toBeNull();
    expect(beaconRequest('rooms.opened')).toBeNull();
  });

  // The review ask (2026-10-19): the store it was asked of, and nothing else. The card's own outcome is
  // unknowable, and the two failure names stay on the device.
  it('sends review.asked with its store only, and nothing for a store it does not know', () => {
    expect(beaconRequest('review.asked', { store: 'ios' })?.init.body).toBe('{"name":"review.asked","props":{"store":"ios"}}');
    expect(beaconRequest('review.asked', { store: 'android', version: '1.9.0', closes: 5 })?.init.body).toBe(
      '{"name":"review.asked","props":{"store":"android"}}',
    );
    expect(beaconRequest('review.asked', { store: 'web' })).toBeNull();
    expect(beaconRequest('review.asked')).toBeNull();
    expect(beaconRequest('review.unavailable')).toBeNull();
    expect(beaconRequest('review.failed')).toBeNull();
  });

  it('sends the rest-day gate bare, and keeps the wrap-opening day.closed on the device', () => {
    expect(beaconRequest('day.closed.morning')?.init.body).toBe('{"name":"day.closed.morning"}');
    expect(beaconRequest('reentry.shown', { gap: 9 })?.init.body).toBe('{"name":"reentry.shown"}');
    expect(beaconRequest('day.closed', { finished: 3 })).toBeNull();
  });

  it('keeps the Goodnight note and the retired names on the device', () => {
    expect(beaconRequest('closeday.noted')).toBeNull();
    // "I also did that" earned its place on Today (2026-11-01), so its count stopped, as the policy promised.
    expect(beaconRequest('offplan.logged')).toBeNull();
    expect(beaconRequest('hold.opened')).toBeNull();
  });

  it('stays on-device for everything off the allowlist, including settle.left', () => {
    expect(beaconRequest('settle.left')).toBeNull();
    expect(beaconRequest('task.toggled', { done: true })).toBeNull();
  });

  it('sends the glance and widget counts bare, whatever rides with them', () => {
    expect(beaconRequest('glance.on')?.init.body).toBe('{"name":"glance.on"}');
    expect(beaconRequest('glance.off', { hour: 9, via: 'settings' })?.init.body).toBe('{"name":"glance.off"}');
    expect(beaconRequest('widget.placed', { count: 2 })?.init.body).toBe('{"name":"widget.placed"}');
    // The local-only neighbours stay on the device.
    expect(beaconRequest('widget.offer_accepted')).toBeNull();
    expect(beaconRequest('reminder.enabled', { granted: true, style: 'glance' })).toBeNull();
  });

  it('the allowlist is exactly these thirty (growing it is a deliberate act)', () => {
    // settle.* (2026-08), hold.* (2026-08-22), the held-card usage set (2026-08-22), the telemetry
    // review's three (2026-10-04), review.asked (2026-10-19), task.dragged (2026-10-25), the rest-day gate's two (2026-11-01),
    // the glance and widget three (2026-11-10) and the four active-device counts (2026-11-27): each addition pairs with the
    // Worker allowlist AND the privacy policy in the same commit.
    expect([...BEACON_EVENTS].sort()).toEqual([
      'breakdown.started',
      'bulk.big',
      'card.more',
      'card.opened',
      'day.closed.morning',
      'day.opened',
      'device.new',
      'glance.off',
      'glance.on',
      'hold.completed',
      'hold.released',
      'hold.started',
      'leftoff.cleared',
      'leftoff.saved.card',
      'leftoff.saved.focus',
      'nudge.set',
      'reentry.shown',
      'review.asked',
      'rooms.opened',
      'settle.guide',
      'settle.opened',
      'slices.defined',
      'task.dragged',
      'task.pinned',
      'task.renamed',
      'task.reordered',
      'tiny.made',
      'week.opened',
      'week.six.opened',
      'widget.placed',
    ]);
  });

  it('sends the active-device counts bare, whatever rides with them', () => {
    expect(beaconRequest('day.opened')?.init.body).toBe('{"name":"day.opened"}');
    expect(beaconRequest('week.opened', { week: '2026-11-23' })?.init.body).toBe('{"name":"week.opened"}');
    expect(beaconRequest('device.new', { start: '2026-11-27' })?.init.body).toBe('{"name":"device.new"}');
    expect(beaconRequest('week.six.opened', { age: 35 })?.init.body).toBe('{"name":"week.six.opened"}');
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

// trackSent (2026-11-27): the active-device counts keep a name that got no answer and send it again later, so they need
// to know whether the Worker STORED it, which only a 2xx carrying `stored: true` says. A refusal counts as answered,
// because asking again would be refused again.
describe('trackSent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const stored = { status: 200, json: async () => ({ ok: true, stored: true }) };

  it('answers true when the Worker says it stored the count, sending the same bare request as track', async () => {
    const fetchMock = vi.fn().mockResolvedValue(stored);
    vi.stubGlobal('fetch', fetchMock);
    expect(await trackSent('day.opened')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/event$/);
    expect(fetchMock.mock.calls[0][1].body).toBe('{"name":"day.opened"}');
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('answers false with no network or a blocked request, and when told to come back later', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));
    expect(await trackSent('day.opened')).toBe(false);
    for (const status of [429, 500, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status }));
      expect(await trackSent('week.opened'), String(status)).toBe(false);
    }
  });

  it('answers false to a 200 without the marker: an older or rolled-back Worker stores nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) }));
    expect(await trackSent('device.new')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => Promise.reject(new SyntaxError('not json')) }));
    expect(await trackSent('device.new')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, json: async () => null }));
    expect(await trackSent('week.six.opened')).toBe(false);
  });

  it('treats a refusal as answered, so a name the Worker will never take is not sent forever', async () => {
    for (const status of [400, 403, 404]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status }));
      expect(await trackSent('device.new'), String(status)).toBe(true);
    }
  });

  it('gives up after its timeout and answers false, so the name is kept for later', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
      ),
    );
    const answer = trackSent('week.six.opened');
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    expect(await answer).toBe(false);
  });

  it('has nothing to send for an event that stays on the device, which counts as done', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await trackSent('task.added')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
