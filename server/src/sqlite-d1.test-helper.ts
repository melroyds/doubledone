// A real SQLite (node:sqlite) behind the Worker's D1 shape, loaded with the REAL d1/schema.sql, for the
// tests where a hand-written double would prove nothing: the cross-store guard is a WHERE on an upsert,
// and the in-memory doubles re-implement the upsert in JavaScript. Test-only; nothing in the Worker
// imports it, so it is never bundled.
//
// node:sqlite and node:fs are loaded through an untyped dynamic import on purpose: the Worker's tsconfig
// carries only the Workers types, and pulling Node's globals into it to type a test helper would quietly
// change what every Worker file type-checks against.

import type { D1LikeDatabase } from './entitlements';

type SqliteStmt = { run(...a: unknown[]): { changes: number | bigint }; get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] };
type SqliteDb = { exec(sql: string): void; prepare(sql: string): SqliteStmt };

export async function sqliteD1(): Promise<D1LikeDatabase & { raw: SqliteDb }> {
  const sqliteMod: string = 'node:sqlite';
  const fsMod: string = 'node:fs';
  const { DatabaseSync } = (await import(/* @vite-ignore */ sqliteMod)) as { DatabaseSync: new (path: string) => SqliteDb };
  const { readFileSync } = (await import(/* @vite-ignore */ fsMod)) as { readFileSync: (p: URL, enc: string) => string };
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../d1/schema.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        // D1 reports the change count under meta.changes, so this does too.
        async run() {
          return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
        },
        async first<T>() {
          return (db.prepare(sql).get(...args) ?? null) as T | null;
        },
        async all<T>() {
          return { results: db.prepare(sql).all(...args) as T[] };
        },
      };
      return stmt;
    },
  };
}
