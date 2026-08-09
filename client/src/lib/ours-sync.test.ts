import { describe, expect, it } from 'vitest';

import { type SharedTask } from './ours-merge';
import {
  IDLE_STOP_MS,
  pullPair,
  pushShared,
  rowToShared,
  sanitiseCompletions,
  type SharedRow,
  sharedToRow,
  shouldPoll,
  syncPairOnce,
} from './ours-sync';

function row(over: Partial<SharedRow> & { id: string }): SharedRow {
  return {
    pair_id: 'p-1',
    title: 'bins',
    done: false,
    done_at: null,
    recurrence: null,
    completions: null,
    created_at: '2026-08-09T10:00:00.000Z',
    updated_at: '2026-08-09T10:00:00.000Z',
    deleted_at: null,
    ...over,
  };
}

function task(over: Partial<SharedTask> & { id: string }): SharedTask {
  return { title: 'bins', done: false, createdAt: 1000, updatedAt: 1000, ...over };
}

// A mock in the shape supabase-js presents, recording what was asked of it so the CONTRACT is
// pinned without a database: which table, which filters, and what the upsert conflicts on.
function mockClient(rows: SharedRow[] = []) {
  const calls: { op: string; args?: unknown }[] = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      calls.push({ op: 'eq', args: { col, val } });
      return Promise.resolve({ data: rows, error: null });
    },
    upsert: (payload: unknown, opts: unknown) => {
      calls.push({ op: 'upsert', args: { payload, opts } });
      return Promise.resolve({ error: null });
    },
  };
  const client = {
    from: (table: string) => {
      calls.push({ op: 'from', args: table });
      return builder;
    },
  };
  return { client: client as never, calls };
}

describe('sharedToRow', () => {
  it('emits every field unconditionally, so a batch upsert cannot null another row’s column', () => {
    const r = sharedToRow(task({ id: 't1' }), 'p-9');
    // supabase-js unions the keys across a batch and defaults the gaps to NULL, so an omitted
    // field on one row silently wipes that column on every other row in the same call.
    expect(Object.keys(r).sort()).toEqual([
      'completions',
      'created_at',
      'deleted_at',
      'done',
      'done_at',
      'id',
      'pair_id',
      'recurrence',
      'title',
      'updated_at',
    ]);
    expect(r.pair_id).toBe('p-9');
  });

  // The BEFORE trigger stamps created_by from auth.uid(). Sending it would be ignored, and the
  // reason the trigger exists is that either partner could otherwise forge the other's authorship.
  it('never sends created_by, because the client is not trusted with authorship', () => {
    expect(Object.keys(sharedToRow(task({ id: 't1' }), 'p-1'))).not.toContain('created_by');
  });

  it('sends timestamps as ISO strings and absent ones as null', () => {
    const r = sharedToRow(task({ id: 't1', createdAt: 0, updatedAt: 1_754_000_000_000 }), 'p-1');
    expect(r.updated_at).toBe(new Date(1_754_000_000_000).toISOString());
    expect(r.done_at).toBeNull();
    expect(r.deleted_at).toBeNull();
  });

  it('round-trips through rowToShared exactly', () => {
    const original = task({
      id: 't1',
      title: 'take the bins out',
      done: true,
      doneAt: 1_754_000_000_000,
      createdAt: 1_753_000_000_000,
      updatedAt: 1_754_000_000_000,
      completions: { on: { '2026-08-09': 5 }, off: { '2026-08-09': 9 } },
    });
    expect(rowToShared(sharedToRow(original, 'p-1'))).toEqual(original);
  });
});

describe('rowToShared', () => {
  it('never produces a NaN timestamp from a corrupt remote value', () => {
    // A NaN updatedAt loses every comparison (NaN > x is always false) and poisons the sort,
    // silently pinning the row to the bad copy forever.
    const t = rowToShared(row({ id: 't1', created_at: 'rubbish', updated_at: 'also rubbish' }));
    expect(Number.isFinite(t.createdAt)).toBe(true);
    expect(Number.isFinite(t.updatedAt)).toBe(true);
  });

  it('falls back to created_at when only updated_at is unparseable', () => {
    const t = rowToShared(row({ id: 't1', created_at: '2026-08-09T10:00:00.000Z', updated_at: '' }));
    expect(t.updatedAt).toBe(t.createdAt);
  });

  it('leaves absent optional fields absent rather than undefined-polluted', () => {
    const t = rowToShared(row({ id: 't1' }));
    expect('doneAt' in t).toBe(false);
    expect('recurrence' in t).toBe(false);
    expect('completions' in t).toBe(false);
    expect('deletedAt' in t).toBe(false);
  });

  it('keeps a tombstone', () => {
    expect(rowToShared(row({ id: 't1', deleted_at: '2026-08-09T11:00:00.000Z' })).deletedAt).toBe(
      Date.parse('2026-08-09T11:00:00.000Z'),
    );
  });
});

// The completion log arrives as jsonb from a column the OTHER person's client also writes, possibly
// from an older or newer build. A shape this build does not expect must degrade to "no
// completions", never reach the merge engine and throw on somebody's shared list.
describe('sanitiseCompletions', () => {
  it('keeps a well-formed log', () => {
    expect(sanitiseCompletions({ on: { '2026-08-09': 5 }, off: { '2026-08-09': 9 } })).toEqual({
      on: { '2026-08-09': 5 },
      off: { '2026-08-09': 9 },
    });
  });

  it('drops entries whose stamp is not a finite number', () => {
    expect(sanitiseCompletions({ on: { a: 1, b: 'nope', c: null, d: Number.NaN } })).toEqual({ on: { a: 1 } });
  });

  it('returns undefined for anything that is not a log at all', () => {
    for (const junk of [null, undefined, 'a string', 42, ['an', 'array'], {}, { on: 'nope' }]) {
      expect(sanitiseCompletions(junk)).toBeUndefined();
    }
  });

  it('keeps one side when the other is junk', () => {
    expect(sanitiseCompletions({ on: { a: 1 }, off: 'nope' })).toEqual({ on: { a: 1 } });
  });
});

describe('pullPair', () => {
  it('scopes to the pair and asks for everything else', async () => {
    const { client, calls } = mockClient([row({ id: 't1' })]);
    const out = await pullPair(client, 'p-7');

    expect(calls.find((c) => c.op === 'from')?.args).toBe('shared_tasks');
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual({ col: 'pair_id', val: 'p-7' });
    expect(out.map((t) => t.id)).toEqual(['t1']);
  });

  // THE ONE THAT MATTERS HERE. A `deleted_at is null` filter looks like hygiene and is a
  // resurrection bug: a row your person removed simply stops arriving, your copy never learns it is
  // gone, and your next push puts it back on their screen.
  it('returns TOMBSTONES, and never filters them out', async () => {
    const { client, calls } = mockClient([row({ id: 'gone', deleted_at: '2026-08-09T11:00:00.000Z' })]);
    const out = await pullPair(client, 'p-1');

    expect(out).toHaveLength(1);
    expect(out[0].deletedAt).toBeTruthy();
    expect(calls.filter((c) => c.op === 'eq')).toHaveLength(1); // pair_id and nothing else
  });

  it('surfaces an error rather than pretending the list is empty', async () => {
    const client = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'nope' } }) }) }) };
    await expect(pullPair(client as never, 'p-1')).rejects.toBeTruthy();
  });
});

describe('pushShared', () => {
  it('conflicts on the COMPOSITE key, because an id is only unique within its pair', async () => {
    const { client, calls } = mockClient();
    await pushShared(client, [task({ id: 't1' })], 'p-1');

    const upsert = calls.find((c) => c.op === 'upsert')!.args as { opts: { onConflict: string } };
    expect(upsert.opts.onConflict).toBe('pair_id,id');
  });

  it('does not call the network for an empty push', async () => {
    const { client, calls } = mockClient();
    await pushShared(client, [], 'p-1');
    expect(calls).toHaveLength(0);
  });
});

describe('syncPairOnce', () => {
  it('pulls, merges and pushes back only what the server is missing', async () => {
    const { client, calls } = mockClient([row({ id: 'theirs' })]);
    const merged = await syncPairOnce(client, 'p-1', [task({ id: 'mine' })]);

    expect(merged.map((t) => t.id).sort()).toEqual(['mine', 'theirs']);
    const upsert = calls.find((c) => c.op === 'upsert')!.args as { payload: { id: string }[] };
    expect(upsert.payload.map((r) => r.id)).toEqual(['mine']);
  });

  it('pushes nothing when both sides already agree', async () => {
    const shared = row({ id: 't1' });
    const { client, calls } = mockClient([shared]);
    await syncPairOnce(client, 'p-1', [rowToShared(shared)]);
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined();
  });

  it('carries an un-tick made locally up to the server', async () => {
    const theirs = row({ id: 'bins', completions: { on: { '2026-08-09': 5000 } }, updated_at: '2026-08-09T12:00:00.000Z' });
    const mine = { ...rowToShared(theirs), completions: { on: { '2026-08-09': 5000 }, off: { '2026-08-09': 6000 } } };

    const { client, calls } = mockClient([theirs]);
    await syncPairOnce(client, 'p-1', [mine]);

    const upsert = calls.find((c) => c.op === 'upsert')!.args as { payload: SharedRow[] };
    expect(upsert.payload[0].completions).toEqual({ on: { '2026-08-09': 5000 }, off: { '2026-08-09': 6000 } });
  });
});

describe('shouldPoll', () => {
  it('runs only while the screen is focused AND the app is in front', () => {
    expect(shouldPoll(true, true, 0)).toBe(true);
    expect(shouldPoll(false, true, 0)).toBe(false);
    expect(shouldPoll(true, false, 0)).toBe(false);
  });

  it('stops after ten idle minutes, because a list left open on a desk is not someone waiting', () => {
    expect(shouldPoll(true, true, IDLE_STOP_MS - 1)).toBe(true);
    expect(shouldPoll(true, true, IDLE_STOP_MS)).toBe(false);
  });
});

describe('the seam never reaches for an elevated key', () => {
  it('talks to exactly one table and takes the caller’s own client', async () => {
    const { client, calls } = mockClient([]);
    await syncPairOnce(client, 'p-1', []);
    const tables = new Set(calls.filter((c) => c.op === 'from').map((c) => c.args));
    expect([...tables]).toEqual(['shared_tasks']);
  });
});

// A guard rather than a behaviour: the seam must not grow a field naming a person, and the row
// shape is where one would most plausibly be added by someone wiring up "who did this".
describe('the never-shame law, at the wire', () => {
  it('sends nothing that could attribute a completion to a person', () => {
    const keys = Object.keys(sharedToRow(task({ id: 't1', done: true, doneAt: 4000 }), 'p-1'));
    for (const banned of ['done_by', 'doneBy', 'completed_by', 'user_id', 'created_by']) {
      expect(keys).not.toContain(banned);
    }
  });

  it('ignores a done_by that somehow arrives from the server', () => {
    const hostile = { ...row({ id: 't1' }), done_by: 'someone' } as SharedRow & { done_by: string };
    expect(Object.keys(rowToShared(hostile))).not.toContain('done_by');
  });
});
