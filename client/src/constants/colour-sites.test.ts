import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// The other half of the contrast gate (store 1.9, slice 4). palette.test.ts proves each text role clears 4.5:1 on
// the surfaces its row names. This proves the screens draw words in those roles, by reading every source file:
//   - inkFaint is never words. It fails 4.5:1 on every light surface (3.8:1 on a card in Dusk, 2.3:1 on the sky),
//     so it is only for rings, borders, disabled controls and decoration, each one listed below with its reason.
//     Secondary words take inkSoft, or skyInk straight on the sky.
//   - The accent is never a text colour. It is a fill (the + pill, Break it down, the gauge, the ticks). Accent
//     words take accentText, or skyAccent straight on the sky. Honey shows why: its gold fill is 2.8:1 as words.
//   - A placeholder is never inkFaint, with no exceptions: an empty field's hint is the one line that tells you
//     what the field is for.
// A new use fails here until it takes a role or joins a list with its reason, and a listed use that goes away fails
// too, so the lists only ever hold what is really there. Both tokens are scanned at every mention, not only where a
// `color:` names them, because a colour can reach words through a variable: TaskRow's `heroText` once held the
// accent for Break it down's words, and a scan of `color:` lines alone passed it. An accent mention is let off only
// when its own line assigns it to a fill or an edge (backgroundColor, borderColor and the rest below), or to a
// component's own colour prop (a spinner, the drawn pin), which is a graphic, not words.

const SRC = join(__dirname, '..');
// Where the tokens are defined, not used.
const DEFINES = new Set(['constants/palette.ts', 'constants/theme.ts']);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return sources(path);
    if (!/\.tsx?$/.test(d.name) || /\.test\.ts$/.test(d.name)) return [];
    return [path];
  });
}

const FILES = sources(SRC)
  .map((path) => ({ file: relative(SRC, path).split('\\').join('/'), lines: readFileSync(path, 'utf8').split('\n') }))
  .filter((f) => !DEFINES.has(f.file));

/** The style entry a line belongs to: its own `key: {`, or the nearest key above it at a shallower indent. */
function owner(lines: string[], i: number): string {
  const own = /^\s*([A-Za-z_$][\w$]*):\s*\{/.exec(lines[i]);
  if (own) return own[1];
  const indent = lines[i].search(/\S/);
  for (let j = i - 1; j >= 0; j--) {
    const at = lines[j].search(/\S/);
    if (at < 0 || at >= indent) continue;
    const key = /^\s*([A-Za-z_$][\w$]*):/.exec(lines[j]);
    return key ? key[1] : '(no style key)';
  }
  return '(no style key)';
}

type Site = { id: string; where: string; code: string };

function find(pattern: RegExp): Site[] {
  return FILES.flatMap(({ file, lines }) =>
    lines.flatMap((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || !pattern.test(line)) return [];
      return [{ id: `${file} ${owner(lines, i)}`, where: `${file}:${i + 1} ${code}`, code }];
    }),
  );
}

// Every inkFaint that is not words, and why. [file and style key]: reason.
const INK_FAINT_NOT_WORDS: Record<string, string> = {
  'app/index.tsx checkOpen': 'the empty check ring in the Today mock, a ring (3:1)',
  'app/today.tsx selectDimText': 'Select all once everything is selected, a disabled control',
  'app/today.tsx seqEditOff': "the top row's up arrow and the bottom row's down arrow, disabled",
  'app/welcome.tsx revealCheck': 'the dot beside each line you wrote, decoration',
  'app/welcome.tsx previewBar': "the preview's stand-in bar for a task, decoration",
  'components/CheckCircle.tsx check': 'the empty check ring, a ring (3:1, held by palette.test.ts)',
  'components/DatePicker.tsx dayPast': 'a past day, which cannot be picked, disabled',
  'components/TaskRow.tsx confirmTitleEditable': 'the underline that says a title can be renamed, decoration',
  'components/TaskRow.tsx railOff': 'Move up on the top row and Move down on the bottom one, disabled',
  'components/TaskRow.tsx selectDot': 'the select ring, a ring (3:1, held by palette.test.ts)',
};

// Every accent that could be words and is not, and why.
const ACCENT_NOT_WORDS: Record<string, string> = {
  'app/index.tsx markC2': "the logo's second tick, a logotype",
  'app/premium.tsx spinner': 'the loading spinner, read by ActivityIndicator, not words',
};

const INK_FAINT = /colors\.inkFaint(?![A-Za-z])/;
const ACCENT = /colors\.accent(?![A-Za-z])/;
const EVERY_ACCENT = /colors\.accent(?![A-Za-z])/g;
// Style keys that paint a fill or an edge, never words.
const FILL_OR_EDGE = new Set([
  'backgroundColor',
  'borderColor',
  'borderBottomColor',
  'borderTopColor',
  'borderLeftColor',
  'borderRightColor',
  'textDecorationColor',
  'stopColor',
  'shadowColor',
]);
// A component's own colour props: a spinner, the drawn pin, an SVG shape. Graphics, never words.
const GRAPHIC_PROPS = new Set(['color', 'fill', 'stroke', 'stopColor']);

/** What the text before a match assigns it to on its own line: an open `prop={...` (as `prop=`), else the last
 *  `key:` (written with no space before the colon, so a ternary's ` : ` never reads as one), else null. */
function assignedTo(before: string): string | null {
  const prop = /([A-Za-z_$][\w$]*)=\{[^{}]*$/.exec(before);
  if (prop) return `${prop[1]}=`;
  const keys = [...before.matchAll(/([A-Za-z_$][\w$]*):(?!:)/g)];
  return keys.length > 0 ? keys[keys.length - 1][1] : null;
}

function notWords(to: string | null): boolean {
  if (to == null) return false;
  if (to.endsWith('=')) return GRAPHIC_PROPS.has(to.slice(0, -1));
  return FILL_OR_EDGE.has(to);
}

/** Every mention of the accent itself that is not a fill, an edge or a graphic's prop. A `color:`, a `const` that
 *  feeds one, a key on the line above: each one counts until it takes accentText or skyAccent, or is listed. */
function accentSites(): Site[] {
  return find(ACCENT).filter(({ code }) =>
    [...code.matchAll(EVERY_ACCENT)].some((m) => !notWords(assignedTo(code.slice(0, m.index)))),
  );
}

describe('the colour roles on every screen', () => {
  it('reads the source tree', () => {
    // A path change that left the scan reading nothing would pass everything below.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.some((f) => f.file === 'app/today.tsx')).toBe(true);
  });

  it('never gives a placeholder inkFaint', () => {
    expect(find(/placeholderTextColor=\{[^}]*inkFaint/).map((s) => s.where)).toEqual([]);
  });

  it('uses inkFaint only where it is not words', () => {
    expect(find(INK_FAINT).filter((s) => !(s.id in INK_FAINT_NOT_WORDS)).map((s) => s.where)).toEqual([]);
  });

  it('never draws words in the accent itself', () => {
    expect(accentSites().filter((s) => !(s.id in ACCENT_NOT_WORDS)).map((s) => s.where)).toEqual([]);
  });

  it('reads what a mention of the accent is assigned to', () => {
    // The shapes the screens use, so a change to the reader cannot quietly let words through.
    expect(notWords(assignedTo("checkOn: { backgroundColor: t.colors."))).toBe(true);
    expect(notWords(assignedTo("{ backgroundColor: t.scheme === 'dark' ? t.colors.accentSoft : t.colors."))).toBe(true);
    expect(notWords(assignedTo('energyPillOn: { borderColor: rgba(t.colors.'))).toBe(true);
    expect(notWords(assignedTo('<View style={{ flex: slices.done, backgroundColor: theme.colors.'))).toBe(true);
    expect(notWords(assignedTo('<ActivityIndicator size="small" color={theme.colors.'))).toBe(true);
    expect(notWords(assignedTo('markC2: { fontSize: 15 * t.scale, color: t.colors.'))).toBe(false);
    expect(notWords(assignedTo("whenPillActive: { color: t.colors.onAccent, backgroundColor: t.colors."))).toBe(true);
    expect(notWords(assignedTo("const heroText = t.appearance === 'quiet' ? t.colors."))).toBe(false);
    expect(notWords(assignedTo("const heroText = t.appearance === 'quiet' ? t.colors.accent : t.scheme === 'dark' ? t.colors."))).toBe(false);
    expect(notWords(assignedTo('<Text style={{ color: theme.colors.'))).toBe(false);
  });

  it('lists only what is really there', () => {
    const faint = new Set(find(INK_FAINT).map((s) => s.id));
    const accent = new Set(accentSites().map((s) => s.id));
    expect(Object.keys(INK_FAINT_NOT_WORDS).filter((id) => !faint.has(id))).toEqual([]);
    expect(Object.keys(ACCENT_NOT_WORDS).filter((id) => !accent.has(id))).toEqual([]);
  });
});
