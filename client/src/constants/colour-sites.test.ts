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
//   - The five task-dot hues are never words. Words in those hues read accentsText (#36), and the honey ✦, a
//     symbol, reads premiumMark where it has been solved. Every other mention is listed below with its reason.
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

// Every mention of the five task-dot hues (accents), and why it is not words. In light mode the dots are 2.4 to 4.3:1
// on the paper (#36), so Settle's words read accentsText and the Menu's ✦ reads premiumMark. The ✦s below are symbols,
// which need 3:1, and still wear the gold dot under it: parked in the BUILD-PLAN Backlog with the rest of C8.
const DOT_HUES_NOT_WORDS: Record<string, string> = {
  'app/chart.tsx premiumMark': "the honey ✦ before Chart a course's Premium note, a symbol (under 3:1, parked)",
  'app/settings.tsx premiumTagMark': "the honey ✦ in a Premium option's tag, a symbol (under 3:1, parked)",
  'app/today.tsx toolPremiumMark': 'the honey ✦ beside Plan my day, a symbol (under 3:1, parked while Today is frozen)',
  'components/TaskRow.tsx premiumStar': 'the honey ✦ beside Pin in the held card, a symbol (under 3:1, parked while the held card is frozen)',
  'components/RotatingPhrase.tsx (no style key)': "the foot phrase's words in dark mode only, held by palette.test.ts (light mode reads skyInk)",
};

const DOT_HUES = /colors\.accents(?![A-Za-z])/;
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

  it('never draws words in the dot hues', () => {
    expect(find(DOT_HUES).filter((s) => !(s.id in DOT_HUES_NOT_WORDS)).map((s) => s.where)).toEqual([]);
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
    const dots = new Set(find(DOT_HUES).map((s) => s.id));
    expect(Object.keys(INK_FAINT_NOT_WORDS).filter((id) => !faint.has(id))).toEqual([]);
    expect(Object.keys(ACCENT_NOT_WORDS).filter((id) => !accent.has(id))).toEqual([]);
    expect(Object.keys(DOT_HUES_NOT_WORDS).filter((id) => !dots.has(id))).toEqual([]);
  });
});

// Quiet's rows on the sky (#35, and its review). A Quiet row drops its card, so TaskRow's row words, its check and
// select rings and a held task's closing band sit straight on the sky, where the card's grey and accent were 3.1 to
// 3.2:1 and the ring 2.1 to 2.3:1 in light mode. palette.test.ts holds the values of the roles they now take; this
// holds where TaskRow draws them, so a restyle that drops a `quiet ?` switch fails here and not on somebody's phone.
// It does not guess what a style is drawn over (the 2026-10-19 call against that stands): the list names the styles
// known to sit on the sky in Quiet, each with what it is, and one that goes away fails too.
const QUIET_ROW = 'components/TaskRow.tsx';
const QUIET_ROW_WORDS: Record<string, string> = {
  rowNote: "the row's note, or why it cannot be ticked",
  holdLineText: "I'm holding this one",
  holdLineLetGoText: 'Let it go',
  bigMark: 'the big tag',
  originMark: '· Ours on your copy of a shared row',
  textDone: 'a ticked title',
  repeatMark: 'the repeat mark',
  nudgeMark: 'the reminder time',
  suggestHint: 'Looks big, break it down?',
  tinyEyebrow: "a tiny step's eyebrow",
  sliceCount: 'the n / N count',
  sliceAdjustHint: 'Hold to adjust',
};
// A Quiet row's words read the sky roles: through rowSoft or rowAccent, or a `quiet ?` switch that names one first.
const SKY_WORDS = /^(rowSoft|rowAccent|quiet \? t\.colors\.sky(Ink|Accent)\b)/;

function fileLines(file: string): string[] {
  return FILES.find((f) => f.file === file)?.lines ?? [];
}

/** What each style key of a file assigns to `prop`, e.g. every `color:` under `rowNote`, in order. */
function assigned(file: string, prop: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const at = new RegExp(`(?<![A-Za-z])${prop}:\\s*([^,}]+)`);
  fileLines(file).forEach((line, i, all) => {
    const m = at.exec(line);
    if (!m) return;
    const key = owner(all, i);
    (out[key] ??= []).push(m[1].trim());
  });
  return out;
}

describe("Quiet's rows on the sky (#35)", () => {
  it('reads TaskRow and CheckCircle', () => {
    expect(fileLines(QUIET_ROW).length).toBeGreaterThan(1000);
    expect(fileLines('components/CheckCircle.tsx').length).toBeGreaterThan(20);
  });

  it('switches the row words to the sky roles in Quiet, and to the card roles otherwise', () => {
    const src = fileLines(QUIET_ROW).join('\n');
    expect(src).toMatch(/const quiet = t\.appearance === 'quiet';/);
    expect(src).toMatch(/const rowSoft = quiet \? t\.colors\.skyInk : t\.colors\.inkSoft;/);
    expect(src).toMatch(/const rowAccent = quiet \? t\.colors\.skyAccent : t\.colors\.accentText;/);
  });

  it("gives every word style of a Quiet row a sky role, and lists only what is really there", () => {
    const colours = assigned(QUIET_ROW, 'color');
    const missing = Object.keys(QUIET_ROW_WORDS).filter((key) => !(key in colours));
    expect(missing).toEqual([]);
    const wrong = Object.keys(QUIET_ROW_WORDS).flatMap((key) =>
      (colours[key] ?? []).filter((value) => !SKY_WORDS.test(value)).map((value) => `${key}: ${value}`),
    );
    expect(wrong).toEqual([]);
  });

  it("gives the select ring Quiet's ring, and a held task's closing line Quiet's band", () => {
    expect(assigned(QUIET_ROW, 'borderColor').selectDot?.[0]).toMatch(/^quiet \? t\.quiet\.ring\b/);
    expect(assigned(QUIET_ROW, 'backgroundColor').holdLineClosed?.[0]).toMatch(/^quiet \? t\.quiet\.doneBand\b/);
  });

  it("draws every check ring in TaskRow for the sky, and CheckCircle gives it Quiet's ring", () => {
    const src = fileLines(QUIET_ROW).join('\n');
    expect(src).toMatch(/const ringOnSky = theme\.appearance === 'quiet';/);
    const checks = [...src.matchAll(/<CheckCircle\b[^>]*>/g)].map((m) => m[0]);
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.filter((tag) => !/\bonSky=\{ringOnSky\}/.test(tag))).toEqual([]);
    const circle = fileLines('components/CheckCircle.tsx').join('\n');
    expect(circle).toMatch(/onSky && styles\.checkOnSky/);
    expect(assigned('components/CheckCircle.tsx', 'borderColor').checkOnSky).toEqual(['t.quiet.ring']);
  });
});
