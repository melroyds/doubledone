import { describe, expect, it } from 'vitest';

import { APP_EVENTS, eventStatement, logAppEvent, parseAppEvent } from './events';

describe('parseAppEvent (the closed allowlist)', () => {
  it('accepts the storable names exactly', () => {
    expect(parseAppEvent({ name: 'settle.opened' })).toBe('settle.opened');
  });

  it('folds settle.guide + its one boolean into an on/off name', () => {
    expect(parseAppEvent({ name: 'settle.guide', props: { on: true } })).toBe('settle.guide.on');
    expect(parseAppEvent({ name: 'settle.guide', props: { on: false } })).toBe('settle.guide.off');
  });

  it('drops settle.guide without a boolean prop (never guesses a state)', () => {
    expect(parseAppEvent({ name: 'settle.guide' })).toBeNull();
    expect(parseAppEvent({ name: 'settle.guide', props: { on: 'yes' } })).toBeNull();
  });

  it('drops anything off the list, including settle.left (deliberately uncollected)', () => {
    expect(parseAppEvent({ name: 'settle.left' })).toBeNull();
    expect(parseAppEvent({ name: 'task.toggled' })).toBeNull();
  });

  it('accepts a pre-folded on/off name directly (on the closed list, so harmless)', () => {
    expect(parseAppEvent({ name: 'settle.guide.on' })).toBe('settle.guide.on');
  });

  it('drops junk shapes without throwing', () => {
    expect(parseAppEvent(null)).toBeNull();
    expect(parseAppEvent('settle.opened')).toBeNull();
    expect(parseAppEvent({ name: 42 })).toBeNull();
    expect(parseAppEvent({ name: 'x'.repeat(65) })).toBeNull();
    expect(parseAppEvent({})).toBeNull();
  });

  it('the allowlist holds ONLY fixed dotted names, nothing free-text-shaped', () => {
    // Strict lowercase dotted words: no digits, no ids, nothing a task title could leak through.
    for (const e of APP_EVENTS) expect(e).toMatch(/^[a-z]+(\.[a-z]+)+$/);
  });

  it('passes a card-usage name through bare and drops its props on the floor', () => {
    expect(parseAppEvent({ name: 'card.more' })).toBe('card.more');
    expect(parseAppEvent({ name: 'nudge.set', props: { preset: 'in1h' } })).toBe('nudge.set');
    expect(parseAppEvent({ name: 'task.reordered', props: { dir: 'up' } })).toBe('task.reordered');
    // Still a closed list: a name nobody declared is accepted and dropped.
    expect(parseAppEvent({ name: 'card.everything' })).toBeNull();
  });
});

describe('eventStatement', () => {
  it('binds exactly the event name, nothing else', () => {
    const { sql, params } = eventStatement('settle.opened');
    expect(sql).toBe('INSERT INTO app_events (event) VALUES (?)');
    expect(params).toEqual(['settle.opened']);
  });
});

describe('logAppEvent', () => {
  it('skips cleanly with no D1 binding', async () => {
    await expect(logAppEvent({}, 'settle.opened')).resolves.toBeUndefined();
  });

  it('inserts the event through the prepared statement', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            calls.push({ sql, params });
            return this;
          },
          async run() {},
          async first() {
            return null;
          },
          async all() {
            return { results: [] };
          },
        };
      },
    };
    await logAppEvent({ DB: db }, 'settle.guide.off');
    expect(calls).toEqual([{ sql: 'INSERT INTO app_events (event) VALUES (?)', params: ['settle.guide.off'] }]);
  });

  it('swallows a database failure (telemetry never breaks a request)', async () => {
    const db = {
      prepare() {
        throw new Error('boom');
      },
    };
    await expect(logAppEvent({ DB: db as never }, 'settle.opened')).resolves.toBeUndefined();
  });
});

// "Hold me to it" (2026-08-22): the step number is bucketed, never stored raw, so the table keeps
// its names-only posture while still yielding the completed-vs-released curve.
describe('hold.* folding', () => {
  it('buckets the step into first / ladder / days', () => {
    expect(parseAppEvent({ name: 'hold.completed', props: { step: 0 } })).toBe('hold.completed.first');
    expect(parseAppEvent({ name: 'hold.completed', props: { step: 1 } })).toBe('hold.completed.first');
    expect(parseAppEvent({ name: 'hold.completed', props: { step: 3 } })).toBe('hold.completed.ladder');
    expect(parseAppEvent({ name: 'hold.released', props: { step: 4 } })).toBe('hold.released.ladder');
    expect(parseAppEvent({ name: 'hold.released', props: { step: 5 } })).toBe('hold.released.days');
    expect(parseAppEvent({ name: 'hold.released', props: { step: 30 } })).toBe('hold.released.days');
  });

  it('passes hold.started through bare, and drops a fold without a numeric step', () => {
    expect(parseAppEvent({ name: 'hold.started' })).toBe('hold.started');
    expect(parseAppEvent({ name: 'hold.completed' })).toBeNull();
    expect(parseAppEvent({ name: 'hold.completed', props: { step: 'many' } })).toBeNull();
    // A pre-folded name from the wire is NOT accepted: the fold happens here or not at all,
    // so a client can never smuggle an unbucketed shape into the table.
    expect(parseAppEvent({ name: 'hold.completed.first' })).toBe('hold.completed.first');
  });
});
