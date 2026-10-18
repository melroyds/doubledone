import { describe, expect, it } from 'vitest';

import { PHASE_GRADIENT, PHASE_POOLS, type Phase } from '../lib/phase';
import { THEME_NAMES } from '../lib/settings';
import { Colors, paletteFor, PILL_FILL_ALPHA, quietTokens, shelfTint, THEME_PRESETS, type Palette, type ThemeTokens } from './palette';

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
// held card can sit anywhere in the list, so they are laid over every one of those. The Menu pill only ever sits
// in the header, so it is laid over the top of the sky: the top stops, and the glow over them.

type RGB = [number, number, number];
type Scheme = 'light' | 'dark';
type Sample = { at: string; rgb: RGB; top?: boolean };

function parse(color: string): { rgb: RGB; a: number } {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
  const h = /^#([0-9a-f]{6})$/i.exec(color);
  if (!h) throw new Error(`not a colour this test can read: ${color}`);
  const v = h[1];
  return { rgb: [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)], a: 1 };
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

type Surface = 'sky' | 'card' | 'shelf' | 'pill' | 'tint' | 'quietHeld' | 'surface' | 'bg' | 'accentFill';

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
    surface: solid('a sheet (surface)', p.surface),
    bg: solid('the page (bg)', p.bg),
    accentFill: solid('the accent fill', p.accent),
  };
}

// What each colour is for, and where it is drawn. A text colour gets a new surface only by adding it here, so
// this table is the contract and the test holds it. [what it is, the token, its surfaces, the ratio it needs]
const ROLES: [string, keyof Palette, Surface[], number][] = [
  ['primary words (titles, task names)', 'ink', ['sky', 'card', 'shelf', 'tint', 'quietHeld', 'surface', 'bg'], 4.5],
  ['words straight on the sky: the date, the greeting, the weight line, Energy, Later, the rested screen, the foot phrase, the shared list\'s lines (on the page once a list is archived), and in Quiet the Right now frame (RIGHT NOW, the caret, an unavailable tool\'s name), which has no card there', 'skyInk', ['sky', 'bg'], 4.5],
  // Right now's frame is a card only in Standard. In Quiet its words are on the sky, so they take skyInk and
  // skyAccent above, never these two rows.
  ['secondary words on a card, the shelf, a tint, a sheet or the page, and every placeholder (the Right now frame in Standard only)', 'inkSoft', ['card', 'shelf', 'tint', 'quietHeld', 'surface', 'bg'], 4.5],
  ['accent words on a card, the shelf, a tint, a sheet or the page: Close the day, More, Close, Normal, Got it, the Menu label, every link and action on the other screens, and the Right now frame\'s tool and "now" in Standard only', 'accentText', ['card', 'shelf', 'pill', 'tint', 'quietHeld', 'surface', 'bg'], 4.5],
  ['accent words straight on the sky: Reopen today, the reminder Yes, Quiet\'s Menu, + I also did that, the shared list\'s Restore, and in Quiet the Right now frame\'s tool and its "now" tag', 'skyAccent', ['sky', 'bg'], 4.5],
  ['the repeat mark, step counts and the tiny-step eyebrow on a card', 'repeat', ['card', 'surface'], 4.5],
  // Not words on the page: periwinkle is 4.3:1 on paper in the light themes, so the break-down review's phase dates
  // (the one line that put it there) are inkSoft. The Calendar's ↻ beside a day's task is a symbol that screen
  // readers skip, held as one.
  ['the Calendar\'s ↻ beside a day\'s task (a symbol, 3:1)', 'repeat', ['bg'], 3],
  ['Remove and Skip today, and Settings\' Delete in Quiet, which drops the cards', 'danger', ['card', 'shelf', 'quietHeld', 'surface', 'bg'], 4.5],
  ['"done" as words (the affirmation, a closed hold line)', 'doneText', ['card', 'surface', 'bg'], 4.5],
  ['labels on the accent fill (the + pill, Break it down)', 'onAccent', ['accentFill'], 4.5],
  ['the empty check ring and the select ring (not text, 3:1)', 'inkFaint', ['card'], 3],
];

type Failure = { key: string; r: number; text: string };

function failures(theme: (typeof THEME_NAMES)[number], scheme: Scheme): Failure[] {
  const p = paletteFor(theme, scheme);
  const on = surfaces(p, scheme);
  const out: Failure[] = [];
  for (const [what, token, where, need] of ROLES) {
    const fg = parse(p[token] as string).rgb;
    for (const surface of where) {
      let worst = { r: Infinity, at: '' };
      for (const b of on[surface]) {
        const r = ratio(fg, b.rgb);
        if (r < worst.r) worst = { r, at: b.at };
      }
      if (worst.r < need) {
        const key = `${theme} ${scheme} ${token} on ${surface}`;
        out.push({ key, r: worst.r, text: `${key} (${p[token]}): ${worst.r.toFixed(2)} < ${need} at ${worst.at} (${what})` });
      }
    }
  }
  return out;
}

// Open in DARK mode, by Melroy's call (store 1.9, 2026-10-19: light mode changes, dark mode keeps its values).
// Pale words straight on the sky lose contrast where the hero glow is brightest, at the very top of the screen:
// the date, the greeting, and Quiet's Menu label. The glow's centre sits above the screen, so a real line sees
// about 65% of its strength at rest and 80% at the top of its drift, which still leaves Dusk, Honey and Rose at
// about 4.4:1 there. The pools are off on Android, so this is the web and iPhones. Each gap is held where it is:
// the test fails if one gets worse, and fails when one is fixed, so the entry is struck off.
const OPEN_IN_DARK: Record<string, number> = {
  // The floor each is held at: today's ratio, rounded down.
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
