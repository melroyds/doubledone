// The colour palettes, and how each theme's full palette is derived from its preset. Kept in its own pure
// module (no react-native, no global.css) so the contrast test, palette.test.ts, can load the real values under
// the node test runner, the motion.ts precedent. theme.ts re-exports all of it, so components keep importing
// colours from the theme.
//
// DoubleDone's "Dusk" palette: calm and warm, the opposite of an "epic" productivity app. Soft paper background,
// warm ink, a single dusky-mauve accent used sparingly, sage for "done" (never an alarming green), and periwinkle
// for repeating tasks. Dark mode is a warm charcoal-brown, never a terminal black, the lights dimmed not a
// different room; every hue lifts in lightness so it still clears WCAG AA, and nothing gains saturation or
// urgency. Light stays the default; dark follows the system, or the user's choice on the Settings page.
//
// Which token is for which surface is the contract palette.test.ts holds: a text token is only ever drawn on the
// surfaces its row there names, and every one of those pairs clears 4.5:1 in all 14 palettes.

import type { ThemeName } from '../lib/settings';

export type Palette = {
  bg: string;
  surface: string;
  surfaceCard: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  done: string;
  doneSoft: string;
  doneText: string;
  onDone: string;
  repeat: string;
  danger: string;
  // Text that sits straight on the living sky, with no card under it (the date, the greeting, the rested
  // screen's lines). The sky's light pools darken it in light mode, so this is darker than inkSoft there.
  skyInk: string;
  // The accent used as TEXT on a card, a tint, the shelf or a sheet. The accent itself stays for fills.
  accentText: string;
  // The accent used as text straight on the sky (Reopen today, the reminder's Yes, Quiet's Menu).
  skyAccent: string;
  scrim: string;
  priorityGradient: readonly string[];
  accents: readonly string[];
};

const light = {
  bg: '#FAF6F1', // warm paper
  surface: '#FFFFFF', // cards
  surfaceCard: 'rgba(255,255,255,0.92)', // cards over the living background (legibility held)
  ink: '#2B2722', // primary text (warm near-black)
  inkSoft: '#6F665C', // secondary text; was #7A7066, 4.36:1 on the held card's shelf and 4.01:1 on the accent tint
  inkFaint: '#8A7F73', // NOT text in light mode (3.8:1 on a card, 2.3:1 on the sky): the check rings, borders, disabled and decoration
  line: '#ECE4D8', // hairline borders
  accent: '#946475', // dusky mauve, the single accent, used sparingly; deepened from #9B6A7D so a white label clears WCAG AA (4.84:1)
  accentSoft: '#F1E7EC', // mauve tint
  onAccent: '#FFFFFF', // foreground (labels, glyphs) on the accent fill; white clears AA on the deepened accent
  done: '#7E9B6B', // sage, completion, calm not alarming (a FILL; the tick on it is onDone, "done" as TEXT uses doneText)
  doneSoft: '#E9EFE2',
  doneText: '#526546', // a deepened sage for "done" rendered as TEXT (affirmations, success), so it clears AA on paper (5.9:1)
  onDone: '#21261F', // the completion tick: a dark warm ink on the sage fill (4.98:1), matching dark mode's dark tick
  repeat: '#6B6F9B', // dusk periwinkle (was #6E72A0, 4.41:1 on a card), the structured / multi-part accent: recurring tasks, the one-off task border, slice progress counts, the make-it-tiny chain eyebrow
  danger: '#A1554C', // muted brick, the calm stand-in for "red" on destructive actions (Remove)
  // The three text roles, solved against the real surfaces (palette.test.ts), the sky with both of its light pools.
  skyInk: '#574F48', // inkSoft (#7A7066) was 2.8:1 on the sky where the rose pool sits behind the rested screen
  accentText: '#865C6A', // the accent itself is 4.0:1 on its own tint and 4.4:1 on the shelf
  skyAccent: '#654950',
  scrim: 'rgba(43,39,34,0.45)', // warm-ink backdrop behind modals and sheets
  priorityGradient: ['#3B82F6', '#8B5CF6'], // saved loud blue->violet, for the premium "Prioritise a task" feature
  // A small, calm set of accent hues (e.g. for per-task dots). Desaturated by design.
  accents: ['#9B6A7D', '#4E8C86', '#C19A4F', '#6E72A0', '#BE7F84'], // mauve, teal, gold, periwinkle, rose
} satisfies Palette;

const dark = {
  bg: '#1B1917', // warm charcoal-brown, not terminal black
  surface: '#252119',
  surfaceCard: 'rgba(37,33,25,0.86)', // cards over the living background
  ink: '#F2EBE0',
  inkSoft: '#A89E93', // matches THEME_PRESETS.dusk.dark; #8A7F73 was 4.09:1 on the dark surface the Settings cards use
  inkFaint: '#7A7066',
  line: '#34302A',
  accent: '#C68BA0', // lifted mauve
  accentSoft: '#352C32',
  onAccent: '#2B2722', // warm ink on the lifted accent (~5.37:1); white here was only ~2.2-2.8:1
  done: '#9DB98A',
  doneSoft: '#2A3024',
  doneText: '#9DB98A', // dark mode: the lifted sage already clears AA as text on the dark paper (~7.9:1), so done == doneText
  onDone: '#2B2722', // warm ink on the lifted done fill (~6.88:1); white here failed AA
  repeat: '#8E97C8', // lifted periwinkle
  danger: '#D2887E', // lifted brick for dark mode
  // Dark mode's sky is dark and its text pale, so the three text roles keep the values they had.
  skyInk: '#A89E93', // = inkSoft
  accentText: '#C68BA0', // = accent
  skyAccent: '#C68BA0', // = accent
  scrim: 'rgba(10,8,6,0.6)', // deeper warm wash so it actually dims the dark surface, never cold black
  priorityGradient: ['#5B8DEF', '#9B6CF0'],
  accents: ['#C68BA0', '#6FB0A8', '#D6B36A', '#8E97C8', '#D6979C'],
} satisfies Palette;

export const Colors = { light, dark } as const;

// The Premium custom-theme presets (the "Dusk" family): seven calm, paper-like FULL palettes, each with a
// light and dark variant on the same token names (designed and WCAG-verified in Claude Design). Dusk is the
// unchanged default and the free state; the other six are Premium. Each preset carries the 12 core tokens; the
// rest of the Palette is derived per preset (surfaceCard / doneSoft / onDone, and the light text roles below) or
// kept fixed (scrim, the loud priorityGradient, and the per-task `accents` dots are deliberately
// theme-independent). IMPORTANT: onAccent is PER-THEME, Honey uses DARK label text because a calm gold cannot
// clear AA with white, so button labels must always read t.colors.onAccent, never a hardcoded white.
export type ThemeTokens = {
  bg: string; surface: string; ink: string; inkSoft: string; inkFaint: string; line: string;
  accent: string; accentSoft: string; onAccent: string; done: string; repeat: string; danger: string;
};

export const THEME_PRESETS: Record<ThemeName, { name: string; light: ThemeTokens; dark: ThemeTokens }> = {
  dusk: { name: 'Dusk',
    light: { bg: '#FAF6F1', surface: '#FFFFFF', ink: '#2B2722', inkSoft: '#6F665C', inkFaint: '#8A7F73', line: '#ECE4D8', accent: '#946475', accentSoft: '#F1E7EC', onAccent: '#FFFFFF', done: '#7E9B6B', repeat: '#6B6F9B', danger: '#A1554C' },
    dark: { bg: '#1B1917', surface: '#252119', ink: '#F2EBE0', inkSoft: '#A89E93', inkFaint: '#7A7066', line: '#34302A', accent: '#C68BA0', accentSoft: '#352C32', onAccent: '#2B2722', done: '#9DB98A', repeat: '#8E97C8', danger: '#D2887E' } },
  sage: { name: 'Sage',
    light: { bg: '#F3F5EF', surface: '#FFFFFF', ink: '#262A22', inkSoft: '#656A5F', inkFaint: '#808678', line: '#E3E8DD', accent: '#5E7E62', accentSoft: '#E5EDE2', onAccent: '#FFFFFF', done: '#5E9E7E', repeat: '#65738C', danger: '#A1554C' },
    dark: { bg: '#1A1C17', surface: '#23261F', ink: '#ECEFE4', inkSoft: '#A6AC9C', inkFaint: '#767B6C', line: '#32362C', accent: '#93B196', accentSoft: '#2A3328', onAccent: '#1A1C17', done: '#7FB7A4', repeat: '#9AA7C6', danger: '#D2887E' } },
  slate: { name: 'Slate',
    light: { bg: '#F2F4F6', surface: '#FFFFFF', ink: '#232830', inkSoft: '#626A72', inkFaint: '#7E858D', line: '#E1E6EB', accent: '#5C7790', accentSoft: '#E6ECF1', onAccent: '#FFFFFF', done: '#6E9B6B', repeat: '#7B6C8F', danger: '#A1554C' },
    dark: { bg: '#15181B', surface: '#1E2226', ink: '#E7EBEF', inkSoft: '#A0A7AE', inkFaint: '#717880', line: '#2D3238', accent: '#8FA9C2', accentSoft: '#28313A', onAccent: '#15181B', done: '#8FB98C', repeat: '#B0A2C4', danger: '#D2887E' } },
  heather: { name: 'Heather',
    light: { bg: '#F4F2F7', surface: '#FFFFFF', ink: '#29262F', inkSoft: '#6A6573', inkFaint: '#878290', line: '#E6E2EC', accent: '#74699B', accentSoft: '#ECE7F2', onAccent: '#FFFFFF', done: '#6E9B6B', repeat: '#56778E', danger: '#A1554C' },
    dark: { bg: '#18161C', surface: '#211E26', ink: '#EAE7F0', inkSoft: '#A4A0AC', inkFaint: '#75717C', line: '#302C38', accent: '#A99BCB', accentSoft: '#2C2838', onAccent: '#18161C', done: '#8FB98C', repeat: '#93A9C4', danger: '#D2887E' } },
  fog: { name: 'Fog',
    light: { bg: '#F1F4F3', surface: '#FFFFFF', ink: '#232826', inkSoft: '#626B67', inkFaint: '#7D8682', line: '#E0E6E3', accent: '#517672', accentSoft: '#E5EDEB', onAccent: '#FFFFFF', done: '#6E9B6B', repeat: '#776E90', danger: '#A1554C' },
    dark: { bg: '#141716', surface: '#1D211F', ink: '#E6EBE8', inkSoft: '#9DA6A1', inkFaint: '#6F7873', line: '#2B302D', accent: '#8FB3AE', accentSoft: '#243230', onAccent: '#141716', done: '#8FB98C', repeat: '#AEA2C6', danger: '#D2887E' } },
  honey: { name: 'Honey',
    light: { bg: '#FAF6EC', surface: '#FFFFFF', ink: '#2B2720', inkSoft: '#716958', inkFaint: '#8C8372', line: '#ECE5D3', accent: '#B5862B', accentSoft: '#F6EDD6', onAccent: '#2B2720', done: '#6E9B6B', repeat: '#627589', danger: '#A1554C' },
    dark: { bg: '#1A1813', surface: '#232017', ink: '#F1EAD9', inkSoft: '#A89E8C', inkFaint: '#7A7363', line: '#332E22', accent: '#D9B65E', accentSoft: '#322A18', onAccent: '#1A1813', done: '#9DB98A', repeat: '#93A6BE', danger: '#D2887E' } },
  rose: { name: 'Rose',
    light: { bg: '#FBF3F2', surface: '#FFFFFF', ink: '#2E2426', inkSoft: '#766468', inkFaint: '#937F84', line: '#F0E2E2', accent: '#AE5468', accentSoft: '#F7E6E9', onAccent: '#FFFFFF', done: '#7E9B6B', repeat: '#62748A', danger: '#A1554C' },
    dark: { bg: '#1C1719', surface: '#251D20', ink: '#F2E7EA', inkSoft: '#B09BA0', inkFaint: '#7C6B6F', line: '#352B2E', accent: '#E0909F', accentSoft: '#38272C', onAccent: '#1C1719', done: '#9DB98A', repeat: '#93A6BE', danger: '#D2887E' } },
};

type TextRoles = Pick<Palette, 'skyInk' | 'accentText' | 'skyAccent'>;

// The three text roles in LIGHT mode for the six Premium themes. They are solved values, not a formula: each is
// the lightest shade that clears 4.6:1 on every surface its role names in palette.test.ts. A preset missing here
// falls back to inkSoft and the accent, which is what dark mode uses.
const LIGHT_TEXT: Partial<Record<ThemeName, TextRoles>> = {
  sage: { skyInk: '#4D5248', accentText: '#546F56', skyAccent: '#435543' },
  slate: { skyInk: '#4B5159', accentText: '#536B82', skyAccent: '#415263' },
  heather: { skyInk: '#534E5A', accentText: '#6B618E', skyAccent: '#534C6D' },
  fog: { skyInk: '#4B524F', accentText: '#4D6F6B', skyAccent: '#3D5552' },
  // Honey's words go bronze: a calm gold cannot clear 4.5:1 as text on white. Its fills stay gold.
  honey: { skyInk: '#564F43', accentText: '#856527', skyAccent: '#624D25' },
  rose: { skyInk: '#5C4C50', accentText: '#A04F61', skyAccent: '#773F4C' },
};

// Tiny colour helpers to derive the Palette tokens the presets do not carry (surfaceCard / doneSoft).
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
export function mix(hexA: string, hexB: string, tB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return `#${a.map((v, i) => Math.round(v * (1 - tB) + b[i] * tB).toString(16).padStart(2, '0')).join('')}`;
}

// Build a full Palette from a preset's 12 tokens: the rest is derived (surfaceCard a translucent surface,
// doneSoft a pale tint of done, doneText a deepened done that clears AA as text, onDone a dark ink tick on light
// / the dark paper on dark) or carried from the fixed, theme-independent extras (scrim, priorityGradient, dots).
function toPalette(tk: ThemeTokens, scheme: 'light' | 'dark', preset: ThemeName): Palette {
  const base = scheme === 'dark' ? dark : light;
  const roles: TextRoles = (scheme === 'light' ? LIGHT_TEXT[preset] : undefined) ?? { skyInk: tk.inkSoft, accentText: tk.accent, skyAccent: tk.accent };
  return {
    bg: tk.bg, surface: tk.surface, ink: tk.ink, inkSoft: tk.inkSoft, inkFaint: tk.inkFaint, line: tk.line,
    accent: tk.accent, accentSoft: tk.accentSoft, onAccent: tk.onAccent, done: tk.done, repeat: tk.repeat, danger: tk.danger,
    ...roles,
    surfaceCard: rgba(tk.surface, scheme === 'light' ? 0.92 : 0.86),
    doneSoft: mix(tk.done, tk.bg, 0.84),
    doneText: scheme === 'light' ? mix(tk.done, '#000000', 0.35) : tk.done, // deepened green for "done" as TEXT (AA on paper)
    onDone: scheme === 'light' ? '#21261F' : tk.onAccent, // the tick: a dark warm ink on the sage fill (light) / dark paper (dark)
    scrim: base.scrim,
    priorityGradient: base.priorityGradient,
    accents: base.accents,
  };
}

/** The full palette a theme renders. Dusk (the default and the free state) is the canonical light / dark
 *  palette unchanged; the six Premium presets derive theirs from their 12 preset tokens. */
export function paletteFor(preset: ThemeName, scheme: 'light' | 'dark'): Palette {
  if (preset === 'dusk') return scheme === 'dark' ? dark : light;
  return toPalette(THEME_PRESETS[preset][scheme], scheme, preset);
}

/** The held card's shelf: a quiet tint flush to the card's foot (TaskRow's terminalRow, Today's select shelf). */
export function shelfTint(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? 'rgba(0,0,0,0.16)' : 'rgba(43,39,34,0.035)';
}

/** The Menu pill's fill: the surface at this alpha, over the sky. */
export const PILL_FILL_ALPHA = 0.6;

export type QuietTokens = {
  hairline: string; // the 5%-ink row separator that replaces the card border
  pressWash: string; // the soft press / hold wash (accentSoft tint)
  captureUnderline: string; // the 1px capture-line underline
  secondary: string; // quiet secondary actions (soft ink)
  link: string; // the accent text links that stay coloured (rendered bold)
  remove: string; // destructive text (muted brick, never red)
  nOfM: string; // the "n of m" multi-step counter (soft ink)
};

/** The quiet usage tokens, derived from the ACTIVE palette so Quiet works on every colour theme, not just Dusk.
 *  No new colours, just usage (and alphas) of what the theme already carries. */
export function quietTokens(colors: Palette, scheme: 'light' | 'dark'): QuietTokens {
  return {
    hairline: rgba(colors.ink, scheme === 'light' ? 0.05 : 0.06),
    // Opaque in light (C5): at 0.78 the sky's rose pool showed through and took the card's words to 3.7:1.
    pressWash: scheme === 'light' ? mix(colors.accentSoft, colors.surface, 0.3) : rgba(colors.accentSoft, 0.85),
    captureUnderline: colors.line,
    secondary: colors.inkSoft,
    link: colors.accentText, // words, so the text role (the accent itself is a fill)
    remove: colors.danger,
    nOfM: colors.inkSoft,
  };
}
