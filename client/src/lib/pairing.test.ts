import { describe, expect, it } from 'vitest';

import {
  ambiguousChars,
  capLabel,
  capName,
  classifyPairError,
  CODE_ALPHABET,
  CODE_LENGTH,
  formatCode,
  isCodeComplete,
  looksLikeEmail,
  NAME_MAX,
  normaliseCode,
  normaliseEmail,
} from './pairing';

describe('normaliseCode', () => {
  // THE CONTRACT: this must stay byte-identical to the server's
  // upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), or a perfectly-typed code hashes to
  // something the database has never seen and a real couple cannot pair.
  it('strips the display separator and upper-cases', () => {
    expect(normaliseCode('k7m-p4q')).toBe('K7MP4Q');
    expect(normaliseCode('K7M P4Q')).toBe('K7MP4Q');
  });

  it('strips what a phone actually produces when a code is copied from a message', () => {
    expect(normaliseCode('K7M‑P4Q')).toBe('K7MP4Q'); // non-breaking hyphen
    expect(normaliseCode('K7M P4Q')).toBe('K7MP4Q'); // non-breaking space
    expect(normaliseCode('  K7M–P4Q  ')).toBe('K7MP4Q'); // en dash + padding
  });

  it('does NOT remove 0 or 1, so a wrong character fails honestly instead of vanishing', () => {
    // The alphabet excludes them, so these can never be right. Deleting them would silently
    // turn a 7-character mistype into a 6-character wrong guess and burn an attempt.
    expect(normaliseCode('K70-P4Q')).toBe('K70P4Q');
    expect(normaliseCode('1K7-P4Q')).toBe('1K7P4Q');
  });
});

describe('formatCode', () => {
  it('groups six characters for reading aloud', () => {
    expect(formatCode('K7MP4Q')).toBe('K7M-P4Q');
  });
  it('does not invent a separator before there is anything to separate', () => {
    expect(formatCode('K7M')).toBe('K7M');
    expect(formatCode('')).toBe('');
  });
  it('round-trips through normalise, so display can never break redemption', () => {
    expect(normaliseCode(formatCode('K7MP4Q'))).toBe('K7MP4Q');
  });
});

describe('isCodeComplete', () => {
  it('is true at exactly the generated length, whatever it was typed with', () => {
    expect(isCodeComplete('K7M-P4Q')).toBe(true);
    expect(isCodeComplete('k7mp4q')).toBe(true);
  });
  it('is false while typing and false when overtyped', () => {
    expect(isCodeComplete('K7M-P4')).toBe(false);
    expect(isCodeComplete('K7M-P4QQ')).toBe(false);
  });
  it('never claims a code is correct, only long enough', () => {
    expect(isCodeComplete('000000')).toBe(true); // impossible characters, right length
  });
});

describe('ambiguousChars', () => {
  it('names the characters the alphabet cannot contain, for a hint and never a rewrite', () => {
    expect(ambiguousChars('K0M-P4Q').sort()).toEqual(['0']);
    expect(ambiguousChars('IL0-1OQ').sort()).toEqual(['0', '1', 'I', 'L', 'O']);
  });
  it('is empty for a code made only of legal characters', () => {
    expect(ambiguousChars('K7M-P4Q')).toEqual([]);
  });
  it('agrees with the alphabet it is derived from', () => {
    expect(CODE_ALPHABET).not.toMatch(/[ILO01]/);
    expect(CODE_LENGTH).toBe(6);
    expect(ambiguousChars(CODE_ALPHABET)).toEqual([]);
  });
});

describe('capLabel', () => {
  it('trims and caps at the column width', () => {
    expect(capLabel('  Sam  ')).toBe('Sam');
    expect(capLabel('x'.repeat(60))).toHaveLength(40);
  });
  it('re-trims after a truncation that lands mid-space', () => {
    expect(capLabel(`${'x'.repeat(39)} y`)).toBe('x'.repeat(39));
  });
  it('lets an empty label through, because the server has the fallback', () => {
    expect(capLabel('   ')).toBe('');
  });
});

describe('capName', () => {
  it('trims and caps at the column width', () => {
    expect(capName('  The house  ')).toBe('The house');
    expect(capName('x'.repeat(60))).toHaveLength(NAME_MAX);
  });

  // Empty must survive as empty all the way to the seam, which turns it into a null. A null name
  // is what lets each person read the list's name in their own language, so a well-meant default
  // word here would quietly fix one household in one language forever.
  it('leaves an unnamed list empty rather than inventing a word', () => {
    expect(capName('')).toBe('');
    expect(capName('   ')).toBe('');
  });
});

describe('looksLikeEmail', () => {
  it('accepts the shapes real people actually have', () => {
    expect(looksLikeEmail('sam@example.com')).toBe(true);
    expect(looksLikeEmail('sam+tasks@example.co.uk')).toBe(true);
    expect(looksLikeEmail("o'brien@example.ie")).toBe(true);
    expect(looksLikeEmail('  sam@example.com  ')).toBe(true);
  });
  it('rejects only what is obviously not an address', () => {
    expect(looksLikeEmail('sam')).toBe(false);
    expect(looksLikeEmail('@example.com')).toBe(false);
    expect(looksLikeEmail('sam@')).toBe(false);
    expect(looksLikeEmail('sam @example.com')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});

describe('normaliseEmail', () => {
  it('matches what the server hashes, so a stray capital never fails a real invite', () => {
    expect(normaliseEmail('  Sam@Example.COM ')).toBe('sam@example.com');
  });
});

describe('classifyPairError', () => {
  // The message strings are a contract with supabase/ours.sql, because the SQLSTATEs alone are
  // ambiguous: 23505 is raised for two different situations and so is 42501.
  it('separates the two 23505 cases', () => {
    expect(classifyPairError({ code: '23505', message: 'already in a shared list' })).toBe('already-paired');
    expect(classifyPairError({ code: '23505', message: 'that list is full' })).toBe('list-full');
  });

  it('separates the two 42501 cases', () => {
    expect(classifyPairError({ code: '42501', message: 'ours is not open yet' })).toBe('not-open');
    expect(classifyPairError({ code: '42501', message: 'not your list' })).toBe('not-yours');
  });

  it('separates the two 54000 cases', () => {
    expect(classifyPairError({ code: '54000', message: 'too many attempts, try later' })).toBe('rate-limited');
    expect(classifyPairError({ code: '54000', message: 'too many old lists' })).toBe('too-many-lists');
  });

  it('separates the two 22023 cases', () => {
    expect(classifyPairError({ code: '22023', message: 'that is your own address' })).toBe('own-email');
    expect(classifyPairError({ code: '22023', message: 'an email is required' })).toBe('bad-email');
  });

  it('reads a signed-out session', () => {
    expect(classifyPairError({ code: '28000', message: 'not signed in' })).toBe('signed-out');
  });

  it('reads a dead network, which arrives with no PostgREST code at all', () => {
    expect(classifyPairError({ message: 'Network request failed' })).toBe('offline');
    expect(classifyPairError({ code: null, message: 'TypeError: Failed to fetch' })).toBe('offline');
  });

  // A database sentence must never reach a calm surface, so anything unrecognised is generic.
  it('falls back to unknown rather than leaking a Postgres message', () => {
    expect(classifyPairError({ code: '42P01', message: 'relation "pairs" does not exist' })).toBe('unknown');
    expect(classifyPairError(null)).toBe('unknown');
    expect(classifyPairError({})).toBe('unknown');
  });
});
