import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { en } from './catalogs/en';
import { translate } from './i18n';

// Every catalogue key the client names must exist (bug sweep 2026-11-01, #34). t() takes any string, so typecheck
// never sees a key that is not there, and at runtime translate() falls back to the key itself: the shared list's bulk
// Remove asked for a key no catalogue had, and a screen reader spoke "today.removeCountA11y" aloud. Read from the
// source, so a typo in a new key fails here rather than on somebody's phone. A key built at runtime is skipped.

const SRC = join(__dirname, '..');
const SECTIONS = new Set(Object.keys(en));

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'catalogs') sources(p, out);
    } else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

// Comments may quote a key that is gone ("replaces today.x"), so they are not read. A "//" after a colon or inside
// quotes is part of a URL, not a comment.
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, (_line, before: string) => before);
}

/** The text of a call's first argument: from just after its "(" to the "," or ")" that ends it at depth 0. */
function firstArgument(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return src.slice(from, i);
      depth--;
    } else if (c === ',' && depth === 0) return src.slice(from, i);
  }
  return src.slice(from);
}

// A quoted string shaped like a key whose first part is a catalogue section: 'today.selectAll', "capture.aiNote".
const KEY_LITERAL = /(['"])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)\1/g;
const keysIn = (text: string): string[] => [...text.matchAll(KEY_LITERAL)].map((m) => m[2]).filter((k) => SECTIONS.has(k.split('.')[0]));

const FILES = sources(SRC).map((file) => ({ file: relative(SRC, file), src: withoutComments(readFileSync(file, 'utf8')) }));

/** Every literal key inside the first argument of a t() call, ternaries included: t(many ? 'a.b' : 'a.c'). */
function keysAskedOfT(): { where: string; key: string }[] {
  const found: { where: string; key: string }[] = [];
  for (const { file, src } of FILES) {
    for (const m of src.matchAll(/(?<![\w.$])t\(/g)) {
      for (const key of keysIn(firstArgument(src, (m.index ?? 0) + m[0].length))) found.push({ where: file, key });
    }
  }
  return found;
}

/** The source with the first argument of every track() call left out: an event name, ternaries included. */
function withoutEventNames(src: string): string {
  let out = '';
  let last = 0;
  for (const m of src.matchAll(/(?<![\w.$])track\(/g)) {
    const from = (m.index ?? 0) + m[0].length;
    if (from < last) continue;
    out += src.slice(last, from);
    last = from + firstArgument(src, from).length;
  }
  return out + src.slice(last);
}

/**
 * Every key-shaped literal anywhere else, such as a key chosen into a const before t() reads it. Telemetry event
 * names share the section names ('capture.split.used'), so the name a track() call is given, and the allowlists in
 * lib/telemetry.ts, are not keys. A new event name kept in a const would need the same exemption.
 */
function keysNamedAnywhere(): { where: string; key: string }[] {
  const found: { where: string; key: string }[] = [];
  for (const { file, src } of FILES) {
    if (file.replace(/\\/g, '/') === 'lib/telemetry.ts') continue;
    for (const key of keysIn(withoutEventNames(src))) found.push({ where: file, key });
  }
  return found;
}

const missing = (found: { where: string; key: string }[]) => found.filter(({ key }) => translate('en', key) === key).map(({ where, key }) => `${where}: ${key}`);

describe('every catalogue key the client names exists', () => {
  it('every literal key a t() call asks for, ternaries included', () => {
    expect(missing(keysAskedOfT())).toEqual([]);
  });

  it('every key named anywhere else in the source (telemetry names aside)', () => {
    expect(missing(keysNamedAnywhere())).toEqual([]);
  });

  it('the scan really reads the screens, including the keys picked by a ternary inside t()', () => {
    const asked = new Set(keysAskedOfT().map(({ key }) => key));
    expect(asked.size).toBeGreaterThan(800);
    for (const key of ['today.selectedCountOne', 'today.markAsALotMany', 'today.removeCountA11yOther', 'capture.repeatOnMonthDayA11y']) {
      expect(asked.has(key), key).toBe(true);
    }
    // ...and the keys a screen chooses before calling t()
    const named = new Set(keysNamedAnywhere().map(({ key }) => key));
    for (const key of ['welcome.handoffFineAiSignedIn']) expect(named.has(key), key).toBe(true);
  });

  it('a key that is not there is caught, whichever way it is written', () => {
    expect(missing([{ where: 'x', key: 'today.removeCountA11y' }])).toEqual(['x: today.removeCountA11y']);
    const src = "t(n === 1 ? 'today.removeCountA11yOne' : 'today.nope', { count })";
    expect(keysIn(firstArgument(src, 2))).toEqual(['today.removeCountA11yOne', 'today.nope']);
    // the params object is not the key
    expect(keysIn(firstArgument("t('today.a', { k: 'today.b' })", 2))).toEqual(['today.a']);
    // an event name is not a key, even one picked by a ternary, but what follows the call still is
    expect(keysIn(withoutEventNames("track(share ? 'capture.shared' : 'capture.shortcut', { n: 1 }); t('today.combine')"))).toEqual(['today.combine']);
  });
});
