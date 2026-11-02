import { describe, expect, it } from 'vitest';

import { PHASE_GRADIENT, PHASE_POOLS, type Phase } from '../lib/phase';
import { THEME_NAMES } from '../lib/settings';
import { Colors, paletteFor, PILL_FILL_ALPHA, quietTokens, shelfTint, THEME_PRESETS, type Palette, type QuietTokens, type ThemeTokens } from './palette';

// The contrast gate (C10, store 1.9). Every text colour must reach 4.5:1 and every check ring 3:1 on the
// surfaces the app really draws it on, composited the way the screen composites them, in all 14 palettes (seven
// themes, light and dark). The "WCAG-verified" comments that used to stand in for this had drifted: the a11y
// scout measured Today's bare text at 3.3:1 in light mode.
//
// The sky is the living background (lib/phase.ts): every stop of every time-of-day phase, plus BOTH light pools
// where they sit, each at the full strength of its centre. The hero glow lies over the top of the screen, so it
// is laid over each phase's top stop. The rose pool lies mid-screen, behind the rested screen's lines, so it is
// laid over each mid and bottom stop. Leaving the rose pool out is how 4.64:1 on paper became 4.10:1 on the
// rested screen (docs/design-source/store-1.9, the colour proposal), so it stays in. Cards, the shelf and Quiet's
// held card can sit anywhere in the list, so they are laid over every one of those, and so can Quiet's rows, which
// have no card at all. The Menu pill only ever sits in the header, so it is laid over the top of the sky: the top
// stops, and the glow over them.

type RGB = [number, number, number];
type Scheme = 'light' | 'dark';
type Sample = { at: string; rgb: RGB; top?: boolean };

function parse(color: string): { rgb: RGB; a: number } {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
  // Six digits, or eight with the alpha last, as `${done}26` writes it.
  const h = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!h) throw new Error(`not a colour this test can read: ${color}`);
  const v = h[1];
  return { rgb: [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)], a: h[2] ? parseInt(h[2], 16) / 255 : 1 };
}

/** `color` (hex, or rgba with its alpha) painted over an opaque backdrop. */
function over(color: string, backdrop: RGB): RGB {
  const { rgb, a } = parse(color);
  return rgb.map((v, i) => v * a + backdrop[i] * (1 - a)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const PHASES = Object.keys(PHASE_GRADIENT) as Phase[];

function sky(scheme: Scheme): Sample[] {
  const [glow, rose] = PHASE_POOLS[scheme];
  return PHASES.flatMap((phase) => {
    const [top, mid, bottom] = PHASE_GRADIENT[phase][scheme];
    return [
      { at: `${phase} top`, rgb: parse(top).rgb, top: true },
      { at: `${phase} mid`, rgb: parse(mid).rgb },
      { at: `${phase} bottom`, rgb: parse(bottom).rgb },
      { at: `${phase} top under the glow`, rgb: over(glow, parse(top).rgb), top: true },
      { at: `${phase} mid under the rose pool`, rgb: over(rose, parse(mid).rgb) },
      { at: `${phase} bottom under the rose pool`, rgb: over(rose, parse(bottom).rgb) },
    ];
  });
}

type Surface = 'sky' | 'card' | 'shelf' | 'pill' | 'tint' | 'quietHeld' | 'quietDoneBand' | 'surface' | 'bg' | 'accentFill';

/** Every surface a token is drawn on, as the screen composites it, for one palette. */
function surfaces(p: Palette, scheme: Scheme): Record<Surface, Sample[]> {
  const s = sky(scheme);
  const card = s.map((b) => ({ at: `a card over ${b.at}`, rgb: over(p.surfaceCard, b.rgb) }));
  const solid = (name: string, color: string): Sample[] => [{ at: name, rgb: parse(color).rgb }];
  const pillFill = `rgba(${parse(p.surface).rgb.join(', ')}, ${PILL_FILL_ALPHA})`;
  return {
    sky: s,
    card,
    shelf: card.map((b) => ({ at: `the shelf on ${b.at}`, rgb: over(shelfTint(scheme), b.rgb) })),
    pill: s.filter((b) => b.top).map((b) => ({ at: `the Menu pill over ${b.at}`, rgb: over(pillFill, b.rgb) })),
    tint: solid('the accent tint', p.accentSoft),
    quietHeld: s.map((b) => ({ at: `Quiet's held card over ${b.at}`, rgb: over(quietTokens(p, scheme).pressWash, b.rgb) })),
    // A held row's closing line in Quiet, on its sage band, over the sky or the tint of a pinned row.
    quietDoneBand: [...s, ...solid('the accent tint', p.accentSoft)].map((b) => ({
      at: `Quiet's closing band over ${b.at}`,
      rgb: over(quietTokens(p, scheme).doneBand, b.rgb),
    })),
    surface: solid('a sheet (surface)', p.surface),
    bg: solid('the page (bg)', p.bg),
    accentFill: solid('the accent fill', p.accent),
  };
}

// A palette role, or one of Quiet's usage tokens (palette.ts quietTokens) as `quiet.ring`.
type Token = keyof Palette | `quiet.${keyof QuietTokens}`;

function colorOf(p: Palette, scheme: Scheme, token: Token): string {
  if (token.startsWith('quiet.')) return quietTokens(p, scheme)[token.slice('quiet.'.length) as keyof QuietTokens];
  return p[token as keyof Palette] as string;
}

// What each colour is for, and where it is drawn. A text colour gets a new surface only by adding it here, so
// this table is the contract and the test holds it. [what it is, the token, its surfaces, the ratio it needs, and
// 'light' on a row held in light mode only, each with its reason]
const ROLES: [string, Token, Surface[], number, Scheme?][] = [
  ['primary words (titles, task names)', 'ink', ['sky', 'card', 'shelf', 'tint', 'quietHeld', 'surface', 'bg'], 4.5],
  // A Quiet row has no card, so its words are on the sky, and on the tint when the row is pinned, picked in select
  // mode or washed (#35). Dark mode's sky roles are its card roles, so the dark pairs below are unchanged by them.
  ['words straight on the sky: the date, the greeting, the weight line, Energy, Later, the rested screen, the foot phrase (in light mode, see below for dark), the shared list\'s lines (on the page once a list is archived), in Quiet the Right now frame (RIGHT NOW, the caret, an unavailable tool\'s name), which has no card there, and in Quiet a task row\'s grey words (a done title, the note, "· Ours", the repeat mark, the tiny-step eyebrow, the n / N count, Hold to adjust, the hold line)', 'skyInk', ['sky', 'bg', 'tint'], 4.5],
  // Right now's frame and a task row are cards only in Standard. In Quiet their words are on the sky, so they take
  // skyInk and skyAccent, never these two rows (TaskRow's rowSoft and rowAccent).
  ['secondary words on a card, the shelf, a tint, a sheet or the page, and every placeholder (the Right now frame in Standard only)', 'inkSoft', ['card', 'shelf', 'tint', 'quietHeld', 'surface', 'bg'], 4.5],
  ['accent words on a card, the shelf, a tint, a sheet or the page: Close the day, More, Close, Normal, Got it, the Menu label, every link and action on the other screens, and the Right now frame\'s tool and "now" in Standard only', 'accentText', ['card', 'shelf', 'pill', 'tint', 'quietHeld', 'surface', 'bg'], 4.5],
  ['accent words straight on the sky: Reopen today, the reminder Yes, Quiet\'s Menu, + I also did that, the shared list\'s Restore, in Quiet the Right now frame\'s tool and its "now" tag, and in Quiet a task row\'s accent words (the big tag, the reminder time, "Looks big, break it down?", "Let it go")', 'skyAccent', ['sky', 'bg', 'tint'], 4.5],
  ['the repeat mark, step counts and the tiny-step eyebrow on a card', 'repeat', ['card', 'surface'], 4.5],
  // Not words on the page: periwinkle is 4.3:1 on paper in the light themes, so the break-down review's phase dates
  // (the one line that put it there) are inkSoft in light mode, and keep the periwinkle in dark. The Calendar's ↻ beside a day's task is a symbol that screen
  // readers skip, held as one.
  ['the Calendar\'s ↻ beside a day\'s task (a symbol, 3:1)', 'repeat', ['bg'], 3],
  // The Menu's room cards are solid surface in Standard and in Quiet (#36). The other ✦s still wear the gold dot,
  // accents[2], under 3:1 on their own surfaces: colour-sites.test.ts lists them and the BUILD-PLAN Backlog parks them.
  ['the honey ✦ beside Chart a course on the Menu (a symbol, 3:1)', 'premiumMark', ['surface'], 3],
  ['Remove and Skip today, and Settings\' Delete in Quiet, which drops the cards', 'danger', ['card', 'shelf', 'quietHeld', 'surface', 'bg'], 4.5],
  ['"done" as words (the affirmation, a closed hold line)', 'doneText', ['card', 'surface', 'bg'], 4.5],
  ['labels on the accent fill (the + pill, Break it down)', 'onAccent', ['accentFill'], 4.5],
  // The tint too: a pinned row sits on solid accentSoft with its ring always empty (Today pins only an open task),
  // and a row changed since you looked in Ours sits on the opaque wash for as long as you look.
  ['the empty check ring and the select ring in Standard (not text, 3:1), on a card and on the tint of a pinned row or an Ours row changed since you looked', 'inkFaint', ['card', 'tint'], 3],
  // In Quiet those rings sit on the sky, on the page of an archived shared list, and on the tint of a pinned or washed
  // row (#35). Light only for now: in dark quiet.ring is still inkFaint, 2.2 to 2.5:1 on the dark sky, and waits for the
  // dark colour pass with OPEN_IN_DARK below. Drop the 'light' in that commit.
  ['in Quiet, a row\'s empty check ring and select ring (not text, 3:1)', 'quiet.ring', ['sky', 'bg', 'tint'], 3, 'light'],
  // The closing line ("You closed the one I was holding.") plays on a sage band inside the held row, which is on the
  // sky in Quiet. Light only the same way: dark keeps its 15% band, where the sage words are 3.7 to 3.9:1.
  ['in Quiet, the closing line of a held task, on its sage band', 'doneText', ['quietDoneBand'], 4.5, 'light'],
];

type Failure = { key: string; r: number; text: string };

function failures(theme: (typeof THEME_NAMES)[number], scheme: Scheme): Failure[] {
  const p = paletteFor(theme, scheme);
  const on = surfaces(p, scheme);
  const out: Failure[] = [];
  for (const [what, token, where, need, only] of ROLES) {
    if (only && only !== scheme) continue;
    const color = colorOf(p, scheme, token);
    const fg = parse(color).rgb;
    for (const surface of where) {
      let worst = { r: Infinity, at: '' };
      for (const b of on[surface]) {
        const r = ratio(fg, b.rgb);
        if (r < worst.r) worst = { r, at: b.at };
      }
      if (worst.r < need) {
        const key = `${theme} ${scheme} ${token} on ${surface}`;
        out.push({ key, r: worst.r, text: `${key} (${color}): ${worst.r.toFixed(2)} < ${need} at ${worst.at} (${what})` });
      }
    }
  }
  return out;
}

// Open in DARK mode, by Melroy's call (store 1.9, 2026-10-19: light mode changes, dark mode keeps its values).
// Two kinds of gap. (1) Pale words straight on the sky lose contrast where the hero glow is brightest, at the very
// top of the screen: the date, the greeting, and Quiet's Menu label. The glow's centre sits above the screen, so a
// real line sees about 65% of its strength at rest and 80% at the top of its drift, which still leaves Dusk, Honey
// and Rose at about 4.4:1 there. The pools are off on Android, so this is the web and iPhones. (2) The empty check
// ring on the accent tint, a pinned row or an Ours row changed since you looked: dark inkFaint is 2.78 to 2.95:1
// there in Dusk, Rose, Fog and Slate, on every platform, where a ring needs 3:1. Each gap is held where it is: the
// test fails if one gets worse, and fails when one is fixed, so the entry is struck off.
const OPEN_IN_DARK: Record<string, number> = {
  // The floor each is held at: today's ratio, rounded down to two decimals.
  'dusk dark skyInk on sky': 4.12,
  'dusk dark skyAccent on sky': 3.93,
  'slate dark skyInk on sky': 4.46,
  'slate dark skyAccent on sky': 4.46,
  'heather dark skyInk on sky': 4.24,
  'heather dark skyAccent on sky': 4.26,
  'fog dark skyInk on sky': 4.34,
  'honey dark skyInk on sky': 4.1,
  'rose dark skyInk on sky': 4.16,
  'rose dark skyAccent on sky': 4.47,
  'dusk dark inkFaint on tint': 2.78,
  'rose dark inkFaint on tint': 2.8,
  'fog dark inkFaint on tint': 2.92,
  'slate dark inkFaint on tint': 2.95,
};

describe('contrast on the real surfaces, all 14 palettes', () => {
  for (const theme of THEME_NAMES) {
    for (const scheme of ['light', 'dark'] as const) {
      it(`${theme}, ${scheme}`, () => {
        const found = failures(theme, scheme);
        expect(found.filter((f) => !(f.key in OPEN_IN_DARK)).map((f) => f.text)).toEqual([]);
        for (const [key, floor] of Object.entries(OPEN_IN_DARK)) {
          if (!key.startsWith(`${theme} ${scheme} `)) continue;
          const f = found.find((x) => x.key === key);
          expect(f, `${key} now passes: strike it from OPEN_IN_DARK`).toBeDefined();
          expect(f!.r, `${key} got worse`).toBeGreaterThanOrEqual(floor);
        }
      });
    }
  }
});

describe('what dark mode keeps, because there it passes', () => {
  // Melroy's call kept dark mode as it was in this batch, and two hues light mode had to give up stay in dark. The
  // foot phrase wears the five task-dot hues in turn at the foot of Today, below the hero glow: the mid and bottom
  // stops, and the rose pool over them. Break it down's later-phase dates wear `repeat` on the page and on a sheet.
  // If a dark retune drops one under 4.5:1, it takes the light-mode role instead (skyInk, inkSoft).
  const below = sky('dark').filter((b) => !b.top);
  for (const theme of THEME_NAMES) {
    it(theme, () => {
      const p = paletteFor(theme, 'dark');
      for (const hue of p.accents) {
        const worst = Math.min(...below.map((b) => ratio(parse(hue).rgb, b.rgb)));
        expect(worst, `the foot phrase in ${hue}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const [name, color] of [['the page', p.bg], ['a sheet', p.surface]] as const) {
        expect(ratio(parse(p.repeat).rgb, parse(color).rgb), `the phase dates on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

/** Hue in degrees, saturation and lightness from 0 to 1, to hold a word shade to its dot. */
function hsl(color: string): [number, number, number] {
  const [r, g, b] = parse(color).rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

describe("Settle's words on the page, all 14 palettes (#36)", () => {
  // The breathing guide and the rare affirmation wear the five dot hues in turn, straight on the room's paper: the
  // blob sits above the word slot, never behind it. In light mode the dots are 2.4 to 4.3:1 there, so the words read
  // accentsText, each dot deepened to clear 4.6:1 on all seven papers. Dark mode's dots clear 6.0:1, so there
  // accentsText is accents, unchanged.
  for (const theme of THEME_NAMES) {
    for (const scheme of ['light', 'dark'] as const) {
      it(`${theme}, ${scheme}`, () => {
        const p = paletteFor(theme, scheme);
        expect(p.accentsText).toHaveLength(p.accents.length);
        for (const word of p.accentsText) {
          expect(ratio(parse(word).rgb, parse(p.bg).rgb), `${word} on the paper (${p.bg})`).toBeGreaterThanOrEqual(4.5);
        }
        if (scheme === 'dark') expect(p.accentsText).toEqual(p.accents);
      });
    }
  }

  it('deepens each dot in light mode and keeps its hue', () => {
    // The changing colour is the breath, so a word shade is its own dot made darker, never a grey or another hue.
    // Rose (the fifth) may also be a little dustier, which is what keeps it clear of the warning red (next test).
    const { accents, accentsText } = Colors.light;
    accentsText.forEach((word, i) => {
      const [h0, s0, l0] = hsl(accents[i]);
      const [h1, s1, l1] = hsl(word);
      const turn = Math.abs(h1 - h0);
      expect(Math.min(turn, 360 - turn), `${word}'s hue against ${accents[i]}`).toBeLessThan(2);
      if (i === 4) {
        expect(s0 - s1, `${word} is a dustier ${accents[i]}, never a grey`).toBeGreaterThan(0);
        expect(s0 - s1, `${word} is a dustier ${accents[i]}, never a grey`).toBeLessThan(0.08);
      } else {
        expect(Math.abs(s1 - s0), `${word}'s saturation against ${accents[i]}`).toBeLessThan(0.02);
      }
      expect(l1, `${word} is deeper than ${accents[i]}`).toBeLessThan(l0);
    });
  });

  it('never reads as the warning red that Remove wears', () => {
    // CIE76 distance in Lab. The saturated rose shade (#A7555C) was 8.9 from danger, close enough to read as a
    // warning in a room built to calm; every word now sits at least 12 away.
    const lab = (color: string): [number, number, number] => {
      const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const [r, g, b] = parse(color).rgb.map(lin);
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
      const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };
    const { accentsText, danger } = Colors.light;
    const d = lab(danger);
    for (const word of accentsText) {
      const w = lab(word);
      expect(Math.hypot(w[0] - d[0], w[1] - d[1], w[2] - d[2]), `${word} against danger ${danger}`).toBeGreaterThan(12);
    }
  });
});

describe('the Dusk preset is what Dusk renders (C9)', () => {
  // Only the Settings swatch reads THEME_PRESETS.dusk, while Dusk itself renders Colors. They had drifted
  // (light inkFaint, dark onAccent), so the swatch could show a token the app never draws.
  const keys = Object.keys(THEME_PRESETS.dusk.light) as (keyof ThemeTokens)[];
  for (const scheme of ['light', 'dark'] as const) {
    it(scheme, () => {
      const rendered = Object.fromEntries(keys.map((k) => [k, Colors[scheme][k]]));
      expect(THEME_PRESETS.dusk[scheme]).toEqual(rendered);
    });
  }
});
