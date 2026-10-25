import { describe, expect, it, vi } from 'vitest';

import { meetsFloor, readMonthAnswer, readNoteReply, RECEIPT_FRESH_MS, setLastNoteOutcome, takeLastNoteOutcome } from './note';

vi.mock('./supabase', () => ({ authHeader: async () => null })); // hoisted above the import by vitest

describe('the floor (mirrored in server/src/gifts.ts, same vectors)', () => {
  it.each(['Love it', 'Mi piace', 'Très bien', 'Tagesübersicht', 'The Later folds are lovely, thank you'])('passes %j', (t) => {
    expect(meetsFloor(t)).toBe(true);
  });
  it.each(['', 'ok', 'great', 'asdfghjkl', 'hi hi', '!!! ??? 123 456'])('stops %j', (t) => {
    expect(meetsFloor(t)).toBe(false);
  });
});

describe('reading the eligibility answer', () => {
  it('only a 200 with a boolean canGet is an answer', () => {
    expect(readMonthAnswer(200, { canGet: true })).toBe('yes');
    expect(readMonthAnswer(200, { canGet: false })).toBe('no');
    expect(readMonthAnswer(503, { error: 'unavailable' })).toBe('unknown');
    expect(readMonthAnswer(200, 'doubledone-ai')).toBe('unknown'); // an older deploy's catch-all
    expect(readMonthAnswer(200, null)).toBe('unknown');
  });
});

describe('reading the send reply', () => {
  it('ok only on a real { ok: true }, with the end when a month was given', () => {
    expect(readNoteReply(200, { ok: true })).toEqual({ ok: true, givenUntil: null });
    expect(readNoteReply(200, { ok: true, givenUntil: 1_800_000_000 })).toEqual({ ok: true, givenUntil: 1_800_000_000 });
    expect(readNoteReply(200, 'doubledone-ai')).toEqual({ ok: false });
    expect(readNoteReply(502, { error: 'could not send just now' })).toEqual({ ok: false });
  });
});

describe('the Settings receipt', () => {
  it('is taken once, then gone', () => {
    setLastNoteOutcome({ kind: 'sent' });
    expect(takeLastNoteOutcome()).toEqual({ kind: 'sent' });
    expect(takeLastNoteOutcome()).toBeNull();
  });
  it('goes stale when left unread, so it never greets a later visit', () => {
    setLastNoteOutcome({ kind: 'given', until: 1 }, 1_000);
    expect(takeLastNoteOutcome(1_000 + RECEIPT_FRESH_MS + 1)).toBeNull();
    setLastNoteOutcome({ kind: 'sent' }, 5_000);
    expect(takeLastNoteOutcome(4_000)).toBeNull(); // a clock moved backwards reads as stale too
  });
});
