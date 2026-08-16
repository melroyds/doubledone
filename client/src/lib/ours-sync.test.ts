import { describe, expect, it } from 'vitest';

import { type SharedTask } from './ours-merge';
import {
  IDLE_STOP_MS,
  isPairReadOnly,
  isUnreadableRepeat,
  cadenceLine,
  onSharedListOn,
  knownRecurrence,
  repeatSummaryOf,
  pullPair,
  pushShared,
  rowToShared,
  sanitiseCompletions,
  type SharedRow,
  sharedDueOn,
  tickableInRoom,
  sharedToRow,
  shouldPoll,
  syncPairOnce,
  TITLE_MAX,
} from './ours-sync';

function row(over: Partial<SharedRow> & { id: string }): SharedRow {
  return {
    pair_id: 'p-1',
    title: 'bins',
    done: false,
    done_at: null,
    recurrence: null,
    completions: null,
    due: null,
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
function mockClient(rows: SharedRow[] = [], opts: { upsertError?: unknown; echo?: SharedRow[] } = {}) {
  const calls: { op: string; args?: unknown }[] = [];
  // Paged: pullPair keyset-walks on id and stops on an EMPTY page, so the mock must hand back the
  // rows once and then nothing, exactly as PostgREST would.
  let served = false;
  const select = () => {
    const q: Record<string, unknown> = {};
    const chain = {
      eq: (col: string, val: unknown) => {
        calls.push({ op: 'eq', args: { col, val } });
        q.eq = val;
        return chain;
      },
      order: (col: string, o: unknown) => {
        calls.push({ op: 'order', args: { col, o } });
        return chain;
      },
      limit: (n: number) => {
        calls.push({ op: 'limit', args: n });
        return chain;
      },
      gt: (col: string, val: unknown) => {
        calls.push({ op: 'gt', args: { col, val } });
        return chain;
      },
      then: (resolve: (r: unknown) => void) => {
        const page = served ? [] : rows;
        served = true;
        return Promise.resolve({ data: page, error: null }).then(resolve);
      },
    };
    return chain;
  };
  const builder = {
    select,
    upsert: (payload: unknown, o: unknown) => {
      calls.push({ op: 'upsert', args: { payload, opts: o } });
      return {
        select: () =>
          Promise.resolve(
            opts.upsertError
              ? { data: null, error: opts.upsertError }
              : { data: opts.echo ?? (payload as SharedRow[]), error: null },
          ),
      };
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
      'due',
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
    // pair_id is the only column ever filtered on, however many pages the keyset walk takes. No
    // `deleted_at is null`, ever.
    expect([...new Set(calls.filter((c) => c.op === 'eq').map((c) => (c.args as { col: string }).col))]).toEqual([
      'pair_id',
    ]);
  });

  it('surfaces an error rather than pretending the list is empty', async () => {
    const failing = {
      eq: () => failing,
      order: () => failing,
      limit: () => failing,
      gt: () => failing,
      then: (r: (v: unknown) => void) => Promise.resolve({ data: null, error: { message: 'nope' } }).then(r),
    };
    const client = { from: () => ({ select: () => failing }) };
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
    const { merged } = await syncPairOnce(client, 'p-1', [task({ id: 'mine' })]);

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


// --- the fixes the Phase 3 audit asked for -------------------------------------------------

describe('the server clamps, and the client has to learn', () => {
  // ours.sql's BEFORE trigger clamps updated_at to now() + 1 day rather than rejecting it. Without
  // the read-back a device more than a day fast keeps its own stamp, stays "newer" forever, and
  // re-pushes every poll, each push re-clamping to a fresh ceiling that beats anything the other
  // phone can legitimately write. Their retitle reverts every fifteen seconds, from a phone lying
  // face-down on a table.
  it('adopts the stamp the server actually stored, not the one it sent', async () => {
    const ahead = task({ id: 'x', updatedAt: Date.UTC(2030, 0, 1) });
    const clamped = row({ id: 'x', updated_at: '2026-08-10T00:00:00.000Z' });
    const { client } = mockClient([], { echo: [clamped] });

    const { merged } = await syncPairOnce(client, 'p-1', [ahead]);
    expect(merged[0].updatedAt).toBe(Date.parse('2026-08-10T00:00:00.000Z'));
  });

  it('pushes nothing on the next pass once it has adopted the stored stamp', async () => {
    const stored = row({ id: 'x', updated_at: '2026-08-10T00:00:00.000Z' });
    const { client, calls } = mockClient([stored]);
    await syncPairOnce(client, 'p-1', [rowToShared(stored)]);
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined();
  });
});

describe('a refused push must not throw away a good pull', () => {
  // The SELECT policy needs only membership; both write policies need is_pair_writable, which also
  // requires the pair to be live. So a frozen pair pulls forever and pushes never, and nothing but a
  // successful push empties toPush. Throwing here pinned the device at its last complete sync, on
  // the one screen a bereaved person may keep for years, under copy promising "you can still read
  // everything here".
  it('keeps the merged set and reports the refusal when the pair is read-only', async () => {
    const { client } = mockClient([row({ id: 'theirs' })], { upsertError: { code: '42501' } });
    const res = await syncPairOnce(client, 'p-1', [task({ id: 'mine' })]);

    expect(res.merged.map((t) => t.id).sort()).toEqual(['mine', 'theirs']);
    expect(isPairReadOnly(res.pushError)).toBe(true);
  });

  it('still reports a push failure that is NOT a read-only refusal, so a real bug stays visible', async () => {
    const { client } = mockClient([], { upsertError: { code: '23514', message: 'check violation' } });
    const res = await syncPairOnce(client, 'p-1', [task({ id: 'mine' })]);
    expect(res.pushError).toBeTruthy();
    expect(isPairReadOnly(res.pushError)).toBe(false);
  });

  it('a failed PULL still throws, because there is nothing worth caching', async () => {
    const failing: Record<string, unknown> = {};
    Object.assign(failing, {
      eq: () => failing,
      order: () => failing,
      limit: () => failing,
      gt: () => failing,
      then: (r: (v: unknown) => void) => Promise.resolve({ data: null, error: { message: 'nope' } }).then(r),
    });
    await expect(syncPairOnce({ from: () => ({ select: () => failing }) } as never, 'p-1', [])).rejects.toBeTruthy();
  });
});

describe('the title cap the column enforces and the personal list does not', () => {
  it('clamps to exactly what the column will accept', () => {
    expect(sharedToRow(task({ id: 'x', title: 'a'.repeat(700) }), 'p-1').title).toHaveLength(TITLE_MAX);
  });

  // Postgres counts code points and JS counts UTF-16 units, so a plain slice can cut a surrogate
  // pair in half and swap one poison row for another. Emoji in titles are ordinary here.
  it('never cuts through a surrogate pair', () => {
    const title = 'a'.repeat(TITLE_MAX - 1) + '\u{1F44D}' + 'b'.repeat(20);
    const out = sharedToRow(task({ id: 'x', title }), 'p-1').title;
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(loneSurrogate.test(out)).toBe(false);
    expect([...out]).toHaveLength(TITLE_MAX);
  });
});

describe('a cadence written by the other person’s client', () => {
  it('accepts the shapes this build knows', () => {
    expect(knownRecurrence({ kind: 'daily' })).toEqual({ kind: 'daily' });
    expect(knownRecurrence({ kind: 'weekly', weekdays: [1, 3] })).toEqual({ kind: 'weekly', weekdays: [1, 3] });
    expect(knownRecurrence({ kind: 'interval', days: 3, anchor: '2026-08-09' })).toEqual({
      kind: 'interval',
      days: 3,
      anchor: '2026-08-09',
    });
  });

  // isDueOn reads r.weekdays.includes with no guard, so any of these white-screens the OTHER
  // person's entire shared list, with no error boundary above it.
  it('refuses every shape that would crash the day engine', () => {
    const junk = [
      { kind: 'weekly' },
      { kind: 'weekly', weekdays: 'mon' },
      { kind: 'weekly', weekdays: [] },
      { kind: 'weekly', weekdays: [9] },
      { kind: 'interval', days: 0, anchor: '2026-08-09' },
      { kind: 'interval', days: 3 },
      { kind: 'monthly' },
      null,
      'daily',
    ];
    for (const j of junk) expect(knownRecurrence(j)).toBeUndefined();
  });

  // A build that cannot READ a cadence must never be the build that ERASES it for the person who
  // set it, so the unreadable original rides along untouched and goes back out byte-identical.
  it('keeps an unreadable cadence verbatim and pushes it back unchanged', () => {
    const weird = { kind: 'monthly', day: 3 };
    const t = rowToShared(row({ id: 'x', recurrence: weird as never }));
    expect(t.recurrence).toBeUndefined();
    expect(sharedToRow(t, 'p-1').recurrence).toEqual(weird);
  });
});

describe('pullPair pages rather than trusting one truncated read', () => {
  it('orders and limits, and walks past the first page keyed on the last id it saw', async () => {
    const { client, calls } = mockClient([row({ id: 'a' }), row({ id: 'b' })]);
    const out = await pullPair(client, 'p-1');

    expect(out.map((t) => t.id)).toEqual(['a', 'b']);
    expect(calls.some((c) => c.op === 'order')).toBe(true);
    expect(calls.some((c) => c.op === 'limit')).toBe(true);
    expect(calls.find((c) => c.op === 'gt')?.args).toEqual({ col: 'id', val: 'b' });
  });
});


// Decided 2026-08-09 (Melroy): a repeat whose cadence this build cannot read is SHOWN, not hidden.
// Hiding it means one person sees the task and the other does not, each with a reasonable and wrong
// story about the other having deleted it, which is the invisible disagreement this feature exists
// to prevent.
describe('a cadence this build cannot place on a day', () => {
  it('is flagged as unreadable rather than treated as a one-off', () => {
    const weird = rowToShared(row({ id: 'rent', recurrence: { kind: 'monthly', day: 1 } as never }));
    expect(isUnreadableRepeat(weird)).toBe(true);

    const known = rowToShared(row({ id: 'bins', recurrence: { kind: 'daily' } as never }));
    expect(isUnreadableRepeat(known)).toBe(false);
    // A row with no cadence at all is a one-off, not an unreadable repeat.
    expect(isUnreadableRepeat(rowToShared(row({ id: 'milk' })))).toBe(false);
  });

  it('surfaces the summary the writing client left for readers like this one', () => {
    const t = rowToShared(row({ id: 'rent', recurrence: { kind: 'monthly', day: 1, summary: 'every month on the 1st' } as never }));
    expect(repeatSummaryOf(t)).toBe('every month on the 1st');
  });

  it('has no summary to show when the writer did not leave one', () => {
    expect(repeatSummaryOf(rowToShared(row({ id: 'rent', recurrence: { kind: 'monthly' } as never })))).toBeUndefined();
    expect(repeatSummaryOf(rowToShared(row({ id: 'milk' })))).toBeUndefined();
    // A blank one is not a summary.
    expect(repeatSummaryOf(rowToShared(row({ id: 'x', recurrence: { kind: 'monthly', summary: '   ' } as never })))).toBeUndefined();
  });

  // THE ONE THAT MATTERS. The client that UNDERSTANDS a cadence must not become the client that
  // strips the fallback the client that does not understand it depends on. knownRecurrence rebuilds
  // a clean object, so without an explicit carry the summary would be silently dropped on the very
  // next sync by the person whose app is up to date.
  it('does not strip the summary when it DOES understand the cadence', () => {
    const withSummary = { kind: 'weekly', weekdays: [1, 3], summary: 'every Monday and Wednesday' };
    const t = rowToShared(row({ id: 'bins', recurrence: withSummary as never }));

    expect(isUnreadableRepeat(t)).toBe(false); // this build can place it
    expect(repeatSummaryOf(t)).toBe('every Monday and Wednesday'); // and still carries the fallback
    expect(sharedToRow(t, 'p-1').recurrence).toMatchObject({ summary: 'every Monday and Wednesday' });
  });

  it('carries it through every cadence kind this build knows', () => {
    for (const r of [
      { kind: 'none', summary: 's' },
      { kind: 'daily', summary: 's' },
      { kind: 'weekly', weekdays: [0], summary: 's' },
      { kind: 'interval', days: 2, anchor: '2026-08-09', summary: 's' },
    ]) {
      expect((knownRecurrence(r) as { summary?: string } | undefined)?.summary).toBe('s');
    }
  });

  it('ignores a summary that is not a string, rather than rendering an object', () => {
    expect((knownRecurrence({ kind: 'daily', summary: { a: 1 } }) as { summary?: unknown })?.summary).toBeUndefined();
  });
});

// THE placement rule, which was missing entirely: the room filtered on stillOnList alone, so
// "every Monday" sat on the shared list all seven days under a sheet that had just promised
// "You'll both see it on its day."
describe('what belongs on the shared list on a given day', () => {
  const MON = new Date(2026, 7, 10); // a Monday
  const TUE = new Date(2026, 7, 11);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const row = (over: Partial<SharedTask> & { id: string }): SharedTask => ({ title: 'x', done: false, createdAt: 1, updatedAt: 1, ...over });

  // REVISED after the audit. Placing a repeat by its cadence HERE hid "every Monday" from the room
  // six days a week: unreachable to edit, unreachable to remove, and a household whose list is only
  // repeats was told "Nothing here yet" on a list with things on it. The room IS the list; which day
  // a repeat is due is a separate question, answered by `tickableInRoom` and by `sharedDueOn`.
  it('keeps a repeat ON THE LIST every day, not only on its own', () => {
    const bins = row({ id: 'bins', recurrence: { kind: 'weekly', weekdays: [1] } }); // Monday
    expect(onSharedListOn(bins, iso(MON), MON)).toBe(true);
    expect(onSharedListOn(bins, iso(TUE), TUE)).toBe(true);
  });

  it('keeps a not-yet-started repeat on the list too', () => {
    const later = row({ id: 'later', recurrence: { kind: 'daily', start: '2026-08-11' } });
    expect(onSharedListOn(later, iso(MON), MON)).toBe(true);
  });

  // The landmine. isDueOn on an unreadable repeat falls through to kind 'none', reads a `due`
  // field shared rows do not have, and returns false, which would HIDE it. Hiding is the one thing
  // that decision forbids: each person would conclude the other had deleted it.
  it('always shows an unreadable cadence, on every day', () => {
    const odd = row({ id: 'odd', rawRecurrence: { kind: 'lunar', summary: 'every full moon' } });
    expect(onSharedListOn(odd, iso(MON), MON)).toBe(true);
    expect(onSharedListOn(odd, iso(TUE), TUE)).toBe(true);
  });

  // The other landmine: a one-off has no recurrence AND no due, so a naive isDueOn hides them all.
  it('keeps an open one-off, which has no cadence to be placed by', () => {
    expect(onSharedListOn(row({ id: 'milk' }), iso(MON), MON)).toBe(true);
  });

  it('drops a removed row whatever its shape', () => {
    expect(onSharedListOn(row({ id: 'gone', deletedAt: 5, recurrence: { kind: 'daily' } }), iso(MON), MON)).toBe(false);
  });
});

describe('a shared row can carry a day', () => {
  const base = { id: 'a', pair_id: 'p', title: 'bins', done: false, done_at: null, recurrence: null, completions: null, created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null };

  it('round-trips a due date out and back', () => {
    const task = rowToShared({ ...base, due: '2026-08-14' } as SharedRow);
    expect(task.due).toBe('2026-08-14');
    expect(sharedToRow(task, 'p').due).toBe('2026-08-14');
  });

  it('sends null rather than undefined for an undated row', () => {
    // The client emits every column unconditionally on batch upsert, so this value is always
    // written. `undefined` would drop the key and leave a stale date standing on the server.
    expect(sharedToRow(rowToShared({ ...base, due: null } as SharedRow), 'p').due).toBeNull();
  });

  // Written by the OTHER person's client. A value that is not a plain ISO day would flow into a
  // string comparison against today and place the row on the wrong day, or on every day.
  it('drops anything that is not a plain ISO day rather than trusting it', () => {
    for (const bad of ['', 'tomorrow', '2026-8-1', '2026-08-14T00:00:00Z', '99999-01-01', 42, {}, [], true, null, undefined]) {
      expect(rowToShared({ ...base, due: bad } as unknown as SharedRow).due).toBeUndefined();
    }
  });
});

describe('which shared rows belong on YOUR Today', () => {
  const TUE = new Date(2026, 7, 11); // Tue 11 Aug 2026
  const ISO = '2026-08-11';
  const WED = new Date(2026, 7, 12); // the morning after, which is where the pile-up showed
  const WED_ISO = '2026-08-12';
  const task = (over: Partial<SharedTask>): SharedTask => ({ id: 'x', title: 't', done: false, createdAt: 1, updatedAt: 1, ...over });

  // The whole point of Tier 1: bin night IS Tuesday's business, for whoever is home.
  it('places a repeat on the days it is due, and nowhere else', () => {
    const bins = task({ recurrence: { kind: 'weekly', weekdays: [2], start: '2026-08-01' } });
    expect(sharedDueOn(bins, ISO, TUE)).toBe(true);
    expect(sharedDueOn(bins, '2026-08-12', new Date(2026, 7, 12))).toBe(false);
  });

  it('places a dated one-off from its day ONWARD, never before', () => {
    expect(sharedDueOn(task({ due: ISO }), ISO, TUE)).toBe(true);
    expect(sharedDueOn(task({ due: '2026-08-10' }), ISO, TUE)).toBe(true); // nobody did it; it does not vanish
    expect(sharedDueOn(task({ due: '2026-08-12' }), ISO, TUE)).toBe(false);
  });

  // The default, and the load-bearing one: this is what stops a shopping list becoming your day.
  it('leaves an UNDATED row in the room', () => {
    expect(sharedDueOn(task({}), ISO, TUE)).toBe(false);
    expect(sharedDueOn(task({ due: null }), ISO, TUE)).toBe(false);
  });

  // Shown in the room by onSharedListOn, deliberately not placed on a day: this build cannot know
  // which days it means, and a wrong day on a shared surface is a thing the other person puzzles over.
  it('never places a cadence this build cannot read', () => {
    const alien = task({ rawRecurrence: { kind: 'lunar' } });
    expect(sharedDueOn(alien, ISO, TUE)).toBe(false);
    expect(onSharedListOn(alien, ISO, TUE)).toBe(true);
  });

  it('never places a removed row', () => {
    expect(sharedDueOn(task({ due: ISO, deletedAt: 5 }), ISO, TUE)).toBe(false);
  });

  // A tick must stay visible and reversible, exactly as a personal task's does.
  it('keeps a row that was ticked TODAY on the day, reading as finished', () => {
    expect(sharedDueOn(task({ due: ISO, done: true, completions: { on: { [ISO]: 9 } } }), ISO, TUE)).toBe(true);
  });

  // THE bug this pair of assertions exists for. Both halves, always, because the fix has two ways to
  // be wrong and only one of them is the one we came for: a row that never leaves, or a row that
  // vanishes under your finger the moment you tick it.
  it('drops that same row the NEXT day, and never sooner', () => {
    const ticked = task({ due: ISO, done: true, completions: { on: { [ISO]: 9 } } });
    expect(sharedDueOn(ticked, ISO, TUE)).toBe(true); // still there on the day it happened
    expect(sharedDueOn(ticked, WED_ISO, WED)).toBe(false); // and gone the morning after
  });

  it('does not place a row ticked on an EARLIER day, however old its date', () => {
    const old = task({ due: '2026-08-04', done: true, completions: { on: { '2026-08-04': 9 } } });
    expect(sharedDueOn(old, ISO, TUE)).toBe(false);
  });

  // An OPEN dated row is untouched by any of this: it rolls forward calmly and shames nobody, which
  // is what `tasksForToday` does with an overdue personal one-off and is the half that was correct.
  it('still rolls an UNFINISHED overdue row forward, indefinitely', () => {
    const waiting = task({ due: '2026-07-01' });
    expect(sharedDueOn(waiting, ISO, TUE)).toBe(true);
    expect(sharedDueOn(waiting, WED_ISO, WED)).toBe(true);
  });

  // A row finished by a client older than the completion log: no per-date record, just a timestamp.
  it('falls back to doneAt when there is no completion log', () => {
    const legacy = task({ due: ISO, done: true, doneAt: new Date(2026, 7, 11, 9, 30).getTime() });
    expect(sharedDueOn(legacy, ISO, TUE)).toBe(true);
    expect(sharedDueOn(legacy, WED_ISO, WED)).toBe(false);
  });

  // And when the row knows NOTHING about when it happened, it stays. Of the two ways to be wrong,
  // a lingering row is recoverable and a disappeared one is not.
  it('keeps a finished row that cannot say which day it was finished', () => {
    const amnesiac = task({ due: '2026-08-01', done: true });
    expect(sharedDueOn(amnesiac, ISO, TUE)).toBe(true);
    expect(sharedDueOn(amnesiac, WED_ISO, WED)).toBe(true);
  });
});

describe('what can be ticked in the room today', () => {
  const TUE = new Date(2026, 7, 11);
  const ISO = '2026-08-11';
  const task = (over: Partial<SharedTask>): SharedTask => ({ id: 'x', title: 't', done: false, createdAt: 1, updatedAt: 1, ...over });

  // The other half of the split: on the list every day, finishable only on its own. Ticking "every
  // Monday" on a Thursday would write a completion for THURSDAY into the shared log, which then
  // reads as un-ticked on the Monday it was actually for.
  it('lets a repeat be ticked on its day and refuses it on any other', () => {
    const MON = new Date(2026, 7, 10);
    const bins = task({ id: 'bins', recurrence: { kind: 'weekly', weekdays: [1] } });
    expect(tickableInRoom(bins, '2026-08-10', MON)).toBe(true);
    expect(tickableInRoom(bins, ISO, TUE)).toBe(false);
  });

  it('refuses a repeat before it has started', () => {
    expect(tickableInRoom(task({ id: 'l', recurrence: { kind: 'daily', start: '2026-08-20' } }), ISO, TUE)).toBe(false);
  });

  // Every done-helper treats a cadence it cannot read as a one-off, so one tap would mark a
  // repeating task finished forever, for both people.
  it('never lets an unreadable cadence be ticked, on any day', () => {
    const odd = task({ id: 'odd', rawRecurrence: { kind: 'lunar' } });
    expect(tickableInRoom(odd, ISO, TUE)).toBe(false);
    expect(onSharedListOn(odd, ISO, TUE)).toBe(true); // but never hidden
  });

  it('lets an ordinary one-off be ticked any day, and never a removed row', () => {
    expect(tickableInRoom(task({ id: 'milk' }), ISO, TUE)).toBe(true);
    expect(tickableInRoom(task({ id: 'gone', deletedAt: 5 }), ISO, TUE)).toBe(false);
  });
});

// The audit's find: `repeatSummaryOf` reads a `summary` key that NOTHING writes, so a repeating
// shared row showed no rhythm anywhere, seconds after the cadence sheet promised "You'll both see it
// on its day". A cadence this build understands must be described locally, in the reader's own
// language, which is also the only right answer when two people do not share one.
describe('the rhythm line on a shared row', () => {
  const TUE = new Date(2026, 7, 11);

  it('describes a cadence this build understands, without waiting for anyone to write words', () => {
    const daily = task({ id: 'r', recurrence: { kind: 'daily', start: '2026-08-01' } });
    expect(cadenceLine(daily, TUE)).toBeTruthy();
    expect(repeatSummaryOf(daily)).toBeUndefined(); // the old path, and why it was never enough
  });

  it("falls back to the other build's words only when the cadence is unreadable", () => {
    const alien = task({ id: 'r', rawRecurrence: { kind: 'lunar', summary: 'every full moon' } });
    expect(cadenceLine(alien, TUE)).toBe('every full moon');
  });

  it('says nothing at all for a one-off', () => {
    expect(cadenceLine(task({ id: 'r' }), TUE)).toBeUndefined();
    expect(cadenceLine(task({ id: 'r', due: '2026-08-14' }), TUE)).toBeUndefined();
  });

  it('says nothing for an unreadable cadence carrying no words', () => {
    expect(cadenceLine(task({ id: 'r', rawRecurrence: { kind: 'lunar' } }), TUE)).toBeUndefined();
  });
});
