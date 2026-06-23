import { describe, expect, it } from 'vitest';

import { buildFeedbackEmail, FEEDBACK_MAX, parseFeedback } from './feedback';

describe('parseFeedback', () => {
  it('rejects a non-object body', () => {
    expect(parseFeedback(null)).toEqual({ ok: false, error: 'invalid body' });
    expect(parseFeedback('x')).toEqual({ ok: false, error: 'invalid body' });
  });

  it('rejects empty or whitespace text', () => {
    expect(parseFeedback({}).ok).toBe(false);
    expect(parseFeedback({ text: '   ' }).ok).toBe(false);
  });

  it('rejects text over the cap', () => {
    expect(parseFeedback({ text: 'a'.repeat(FEEDBACK_MAX + 1) })).toEqual({ ok: false, error: 'text is too long' });
  });

  it('trims and accepts valid text', () => {
    expect(parseFeedback({ text: '  hello  ' })).toEqual({ ok: true, text: 'hello', context: undefined });
  });

  it('keeps an optional context, capped at 200', () => {
    expect(parseFeedback({ text: 'hi', context: '  web  ' })).toEqual({ ok: true, text: 'hi', context: 'web' });
    const long = parseFeedback({ text: 'hi', context: 'x'.repeat(500) });
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.context).toBe('x'.repeat(200));
  });
});

describe('buildFeedbackEmail', () => {
  const base = { from: 'feedback@doubledone.app', to: 'inbox@example.com', uuid: 'uuid-1', date: 'Mon, 23 Jun 2026 00:00:00 GMT' };

  function decodeBody(raw: string): string {
    const body = raw.split('\r\n\r\n')[1] ?? '';
    const bin = atob(body.replace(/\r\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  it('sets the standard headers', () => {
    const raw = buildFeedbackEmail({ ...base, text: 'hello' });
    expect(raw).toContain('From: DoubleDone feedback <feedback@doubledone.app>');
    expect(raw).toContain('To: inbox@example.com');
    expect(raw).toContain('Subject: DoubleDone feedback');
    expect(raw).toContain('Message-ID: <uuid-1@doubledone.app>');
    expect(raw).toContain('Content-Transfer-Encoding: base64');
  });

  it('round-trips unicode in the body', () => {
    const text = 'Love it 🎉, the café is lovely ✨';
    expect(decodeBody(buildFeedbackEmail({ ...base, text }))).toBe(text);
  });

  it('appends the context line when present', () => {
    expect(decodeBody(buildFeedbackEmail({ ...base, text: 'hi', context: 'web' }))).toBe('hi\r\n\r\n--\r\nSent from web');
  });
});
