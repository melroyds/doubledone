import { describe, expect, it } from 'vitest';

import { appendPhrase, cleanPhrase } from './dictation';

describe('cleanPhrase', () => {
  it('trims the ends and collapses inner whitespace', () => {
    expect(cleanPhrase('  buy   milk  ')).toBe('buy milk');
  });
  it('is empty for a whitespace-only phrase', () => {
    expect(cleanPhrase('   ')).toBe('');
  });
});

describe('appendPhrase', () => {
  it('uses the phrase as the whole text when the box is empty', () => {
    expect(appendPhrase('', 'buy milk')).toBe('buy milk');
    expect(appendPhrase('   ', 'buy milk')).toBe('buy milk');
  });

  it('puts each new phrase on its own line', () => {
    expect(appendPhrase('buy milk', 'walk the dog')).toBe('buy milk\nwalk the dog');
  });

  it('preserves text the user already typed and appends after it', () => {
    expect(appendPhrase('email Sarah', 'call the dentist')).toBe('email Sarah\ncall the dentist');
  });

  it('ignores an empty or whitespace phrase', () => {
    expect(appendPhrase('buy milk', '   ')).toBe('buy milk');
  });

  it('skips a duplicate of the last line (a double-fired final result)', () => {
    expect(appendPhrase('buy milk', 'buy milk')).toBe('buy milk');
    expect(appendPhrase('buy milk', '  BUY MILK '.toLowerCase())).toBe('buy milk');
  });

  it('does not double the newline when the text already ends with one', () => {
    expect(appendPhrase('buy milk\n', 'walk the dog')).toBe('buy milk\nwalk the dog');
  });

  it('cleans the phrase before appending it', () => {
    expect(appendPhrase('buy milk', '  walk   the dog ')).toBe('buy milk\nwalk the dog');
  });
});
