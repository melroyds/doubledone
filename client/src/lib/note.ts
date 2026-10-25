// "A month on us" (decision log 2026-10-25): the note to us, and the one question every offer surface waits on.
// The Worker gives the month (server/src/feedback-month.ts); this side asks whether it can, sends the note, and keeps
// the last outcome for Settings' one-line receipt. Pure logic is exported for tests; the fetches are thin seams.

import { retireOfferCard } from './storage';
import { authHeader } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

/**
 * The floor a note must meet while a month is on offer, the same rule the server applies (server/src/gifts.ts,
 * held equal by both test suites): two or more words with at least six letters between them, or one word of twelve
 * letters or more. A word is a run of letters in any script. "Love it" and "Tagesübersicht" pass; "ok" does not.
 */
export function meetsFloor(text: string): boolean {
  const words = text.match(/\p{L}+/gu) ?? [];
  const letters = words.reduce((n, w) => n + [...w].length, 0);
  if (words.length >= 2 && letters >= 6) return true;
  return words.some((w) => [...w].length >= 12);
}

export type MonthAnswer = 'yes' | 'no' | 'signedOut' | 'unknown';

/** Read GET /gift/eligibility's reply. Only a 200 with a boolean `canGet` is an answer: anything else (a 503, the
 *  Worker's catch-all 200 on an older deploy) is 'unknown', which every surface treats as "no offer". */
export function readMonthAnswer(status: number, body: unknown): MonthAnswer {
  if (status !== 200 || typeof body !== 'object' || body === null) return 'unknown';
  const canGet = (body as { canGet?: unknown }).canGet;
  return canGet === true ? 'yes' : canGet === false ? 'no' : 'unknown';
}

/** Can this account get a month for a note right now? Signed out is its own answer (the offer then says "once you
 *  sign in"). Never throws. */
export async function fetchMonthAnswer(): Promise<MonthAnswer> {
  const auth = await authHeader();
  if (!auth) return 'signedOut';
  try {
    const res = await fetch(`${API_URL}/gift/eligibility`, { headers: auth });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return readMonthAnswer(res.status, body);
  } catch {
    return 'unknown';
  }
}

export type NoteSent = { ok: true; givenUntil: number | null } | { ok: false };

/** Read POST /feedback's reply: ok only on a real `{ ok: true }` (a catch-all 200 must not read as sent), with the
 *  month's end when one was given. */
export function readNoteReply(status: number, body: unknown): NoteSent {
  if (status !== 200 || typeof body !== 'object' || body === null || (body as { ok?: unknown }).ok !== true) return { ok: false };
  const until = (body as { givenUntil?: unknown }).givenUntil;
  return { ok: true, givenUntil: typeof until === 'number' && Number.isFinite(until) ? until : null };
}

/** Send the note. `ai` may be true only when the screen named Claude above Send (the AI setting on AND a month on
 *  offer): only then may the server's check send the note to Claude. `withAuth` lets the bearer ride along so a month
 *  can follow; a sender the app already knows is Premium sends none, because the note never needs it and a month
 *  must never land on someone who pays. Never throws. */
export async function sendNote(text: string, context: string, ai: boolean, withAuth = true): Promise<NoteSent> {
  const auth = withAuth ? await authHeader() : null;
  try {
    const res = await fetch(`${API_URL}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ?? {}) },
      body: JSON.stringify({ text, context, ai }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return readNoteReply(res.status, body);
  } catch {
    return { ok: false };
  }
}

/** The one place the last outcome lives, so Settings can show its one-line receipt until it is left. In memory on
 *  purpose: it is a receipt for this visit, never a record, so one left unread (the reader went on to Premium and
 *  then Today) goes stale and is dropped rather than greeting a later, unrelated visit. */
export type NoteOutcome = { kind: 'given'; until: number } | { kind: 'sent' };
export const RECEIPT_FRESH_MS = 5 * 60_000;
let lastOutcome: { outcome: NoteOutcome; at: number } | null = null;
export function setLastNoteOutcome(o: NoteOutcome | null, now: number = Date.now()): void {
  lastOutcome = o ? { outcome: o, at: now } : null;
}
export function takeLastNoteOutcome(now: number = Date.now()): NoteOutcome | null {
  const o = lastOutcome;
  lastOutcome = null;
  return o && now - o.at >= 0 && now - o.at <= RECEIPT_FRESH_MS ? o.outcome : null;
}

/** The booking page for a 20-minute call, from build config. Absent means the call line is left out cleanly. */
export const BOOKING_URL: string | null = process.env.EXPO_PUBLIC_BOOKING_URL?.startsWith('https://') ? process.env.EXPO_PUBLIC_BOOKING_URL : null;

/** Retire Today's offer card for good, and tell a mounted Today at once, so the card is already gone (unmounted
 *  while Today sits under the note) by the time Today is seen again. Any successful send retires it. */
const retireListeners = new Set<() => void>();
export function retireOfferNow(): void {
  void retireOfferCard();
  for (const fn of retireListeners) fn();
}
export function onOfferRetired(fn: () => void): () => void {
  retireListeners.add(fn);
  return () => {
    retireListeners.delete(fn);
  };
}
