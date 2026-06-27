import { describe, expect, it } from 'vitest';

import { type D1LikeDatabase } from './telemetry';
import { activeTrial, startTrial, TRIAL_DAYS } from './trials';

// A minimal trials-only fake DB: a Map keyed by user_id, honouring INSERT OR IGNORE (write-once) and the reads.
function fakeTrialDb(): D1LikeDatabase {
  const rows = new Map<string, { user_id: string; started_at: number; expires_at: number }>();
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          if (/^INSERT/i.test(sql)) {
            const [uid, started, expires] = args as [string, number, number];
            if (!rows.has(uid)) rows.set(uid, { user_id: uid, started_at: started, expires_at: expires }); // OR IGNORE
          }
        },
        async first<T>() {
          return (rows.get(args[0] as string) ?? null) as T | null;
        },
        async all<T>() {
          return { results: [...rows.values()] as T[] };
        },
      };
      return stmt;
    },
  } as unknown as D1LikeDatabase;
}

const NOW = 1_700_000_000;

describe('startTrial', () => {
  it('starts a 30-day trial on first use', async () => {
    const db = fakeTrialDb();
    const r = await startTrial(db, 'user-1', NOW);
    expect(r.result).toBe('started');
    expect(r.expiresAt).toBe(NOW + TRIAL_DAYS * 86400);
  });

  it('refuses a second trial for the same account (active or expired)', async () => {
    const db = fakeTrialDb();
    await startTrial(db, 'user-1', NOW);
    const again = await startTrial(db, 'user-1', NOW + 999_999); // long after, still one-per-account
    expect(again.result).toBe('already');
  });

  it('is per-account: a different user can still start one', async () => {
    const db = fakeTrialDb();
    await startTrial(db, 'user-1', NOW);
    expect((await startTrial(db, 'user-2', NOW)).result).toBe('started');
  });
});

describe('activeTrial', () => {
  it('is active before it expires and inactive after', async () => {
    const db = fakeTrialDb();
    const { expiresAt } = await startTrial(db, 'user-1', NOW);
    expect((await activeTrial(db, 'user-1', NOW + 86400)).active).toBe(true); // a day in
    expect((await activeTrial(db, 'user-1', (expiresAt ?? 0) + 1)).active).toBe(false); // just past the end
  });

  it('is inactive for an account that never had a trial', async () => {
    expect((await activeTrial(fakeTrialDb(), 'nobody', NOW)).active).toBe(false);
  });
});
