import { describe, expect, it } from 'vitest';

import { APP_EVENTS, eventStatement, logAppEvent, parseAppEvent } from './events';
import { sqliteD1 } from './sqlite-d1.test-helper';

const COUNTER_SQL =
  "INSERT INTO app_event_counts (day, event, n) VALUES (date('now'), ?1, 1) ON CONFLICT (day, event) DO UPDATE SET n = n + 1";

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

  it('passes the 2026-10-04 names through bare: card.opened and offplan.logged', () => {
    expect(parseAppEvent({ name: 'card.opened' })).toBe('card.opened');
    expect(parseAppEvent({ name: 'offplan.logged' })).toBe('offplan.logged');
    // The Goodnight note's new local-only name never enters the table.
    expect(parseAppEvent({ name: 'closeday.noted' })).toBeNull();
  });
});

// The Menu's two ways into Settings (2026-10-04): rooms.opened is folded to the door, and only
// for Settings. Every other room, and any door we did not build, is dropped unwritten.
describe('rooms.opened folding', () => {
  it('folds a Settings open into the door it came through', () => {
    expect(parseAppEvent({ name: 'rooms.opened', props: { room: 'settings', door: 'sign' } })).toBe('menu.settings.sign');
    expect(parseAppEvent({ name: 'rooms.opened', props: { room: 'settings', door: 'shelf' } })).toBe('menu.settings.shelf');
  });

  it('drops every other room and every unknown door', () => {
    expect(parseAppEvent({ name: 'rooms.opened', props: { room: 'lookback' } })).toBeNull();
    expect(parseAppEvent({ name: 'rooms.opened', props: { room: 'ours' } })).toBeNull();
    expect(parseAppEvent({ name: 'rooms.opened', props: { room: 'settings', door: 'back' } })).toBeNull();
    expect(parseAppEvent({ name: 'rooms.opened', props: { room: 'settings' } })).toBeNull();
    expect(parseAppEvent({ name: 'rooms.opened' })).toBeNull();
    expect(parseAppEvent({ name: 'rooms.opened', props: null })).toBeNull();
  });
});

describe('eventStatement', () => {
  it('binds exactly the event name, nothing else, into a per-day counter', () => {
    const { sql, params } = eventStatement('settle.opened');
    expect(sql).toBe(COUNTER_SQL);
    expect(params).toEqual(['settle.opened']);
  });
});

// The counter, in real SQLite against the real schema (2026-10-04): what is stored is a count per
// day per name and nothing that records which event came first, so consecutive beacons can never be
// read back as one person's session.
describe('app_event_counts (real SQLite)', () => {
  it('bumps one counter per day per name instead of writing a row per event', async () => {
    const db = await sqliteD1();
    for (const e of ['card.opened', 'card.more', 'card.opened', 'nudge.set', 'card.opened']) await logAppEvent({ DB: db }, e);
    const rows = db.raw.prepare('SELECT event, n FROM app_event_counts ORDER BY event').all();
    expect(rows).toEqual([
      { event: 'card.more', n: 1 },
      { event: 'card.opened', n: 3 },
      { event: 'nudge.set', n: 1 },
    ]);
  });

  it('keeps no rowid, so not even a hidden column records the order', async () => {
    const db = await sqliteD1();
    await logAppEvent({ DB: db }, 'settle.opened');
    expect(() => db.raw.prepare('SELECT rowid FROM app_event_counts').all()).toThrow();
  });

  it('the one-off fold adds the old rows onto counts the new Worker already wrote, day by day', async () => {
    const { readFileSync } = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
      readFileSync: (p: URL, enc: string) => string;
    };
    const db = await sqliteD1();
    // The old table as it stood in production, with rows across two days.
    db.raw.exec(
      "CREATE TABLE app_events (id integer primary key autoincrement, event text not null, created_at text not null default (date('now')))",
    );
    db.raw.exec(
      "INSERT INTO app_events (event, created_at) VALUES ('settle.opened','2026-10-01'),('settle.opened','2026-10-01'),('card.more','2026-10-01'),('settle.opened','2026-10-04')",
    );
    // The new Worker already counted today before the fold ran.
    db.raw.exec("INSERT INTO app_event_counts (day, event, n) VALUES ('2026-10-04','settle.opened',2)");
    const fold = readFileSync(new URL('../d1/migrate-app-event-counts.sql', import.meta.url), 'utf8');
    db.raw.exec(fold);
    const folded = [
      { day: '2026-10-01', event: 'card.more', n: 1 },
      { day: '2026-10-01', event: 'settle.opened', n: 2 },
      { day: '2026-10-04', event: 'settle.opened', n: 3 },
    ];
    expect(db.raw.prepare('SELECT day, event, n FROM app_event_counts ORDER BY day, event').all()).toEqual(folded);
    // SUM(n) = old rows + counts already there.
    expect(db.raw.prepare('SELECT SUM(n) AS s FROM app_event_counts').all()).toEqual([{ s: 6 }]);
    // The runbook's coverage check (step 4) returns 0 once every old day and name is counted.
    const coverage =
      'SELECT COUNT(*) AS missing FROM (SELECT substr(created_at, 1, 10) AS d, event AS e, COUNT(*) AS c FROM app_events ' +
      'WHERE true GROUP BY 1, 2) o LEFT JOIN app_event_counts k ON k.day = o.d AND k.event = o.e WHERE k.n IS NULL OR k.n < o.c';
    expect(db.raw.prepare(coverage).all()).toEqual([{ missing: 0 }]);
    // A second run is a no-op (the re-run guard), not a doubling of history.
    db.raw.exec(fold);
    expect(db.raw.prepare('SELECT day, event, n FROM app_event_counts ORDER BY day, event').all()).toEqual(folded);
  });

  it('the coverage check catches a fold that has not run', async () => {
    const db = await sqliteD1();
    db.raw.exec(
      "CREATE TABLE app_events (id integer primary key autoincrement, event text not null, created_at text not null default (date('now')))",
    );
    db.raw.exec("INSERT INTO app_events (event, created_at) VALUES ('settle.opened','2026-09-01'),('card.more','2026-09-02')");
    const coverage =
      'SELECT COUNT(*) AS missing FROM (SELECT substr(created_at, 1, 10) AS d, event AS e, COUNT(*) AS c FROM app_events ' +
      'WHERE true GROUP BY 1, 2) o LEFT JOIN app_event_counts k ON k.day = o.d AND k.event = o.e WHERE k.n IS NULL OR k.n < o.c';
    expect(db.raw.prepare(coverage).all()).toEqual([{ missing: 2 }]);
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
    expect(calls).toEqual([{ sql: COUNTER_SQL, params: ['settle.guide.off'] }]);
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
