import '@/global.css';

import { Appearance, Platform } from 'react-native';

import { type ThemeName } from '@/lib/settings';

// DoubleDone's "Dusk" palette: calm and warm, the opposite of an "epic"
// productivity app. Soft paper background, warm ink, a single dusky-mauve accent
// used sparingly, sage for "done" (never an alarming green), and periwinkle for
// repeating tasks. Dark mode is a warm charcoal-brown, never a terminal black,
// the lights dimmed not a different room; every hue lifts in lightness so it
// still clears WCAG AA, and nothing gains saturation or urgency. Light stays the
// default; dark follows the system, or the user's choice on the Settings page.

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
  onDone: string;
  repeat: string;
  danger: string;
  scrim: string;
  priorityGradient: readonly string[];
  accents: readonly string[];
};

const light = {
  bg: '#FAF6F1', // warm paper
  surface: '#FFFFFF', // cards
  surfaceCard: 'rgba(255,255,255,0.92)', // cards over the living background (legibility held)
  ink: '#2B2722', // primary text (warm near-black)
  inkSoft: '#7A7066', // secondary text
  inkFaint: '#8A7F73', // tertiary / placeholder
  line: '#ECE4D8', // hairline borders
  accent: '#9B6A7D', // dusky mauve, the single accent, used sparingly
  accentSoft: '#F1E7EC', // mauve tint
  onAccent: '#FFFFFF', // foreground (labels, glyphs) on the accent fill; white reads fine on the light accent
  done: '#7E9B6B', // sage, completion, calm not alarming
  doneSoft: '#E9EFE2',
  onDone: '#FFFFFF', // foreground (the completion tick) on the done fill; white reads fine on the light sage
  repeat: '#6E72A0', // dusk periwinkle, the structured / multi-part accent: recurring tasks, the one-off task border, slice progress counts, the make-it-tiny chain eyebrow
  danger: '#A1554C', // muted brick, the calm stand-in for "red" on destructive actions (Remove)
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
  inkSoft: '#8A7F73',
  inkFaint: '#7A7066',
  line: '#34302A',
  accent: '#C68BA0', // lifted mauve
  accentSoft: '#352C32',
  onAccent: '#2B2722', // warm ink on the lifted accent (~5.37:1); white here was only ~2.2-2.8:1
  done: '#9DB98A',
  doneSoft: '#2A3024',
  onDone: '#2B2722', // warm ink on the lifted done fill (~6.88:1); white here failed AA
  repeat: '#8E97C8', // lifted periwinkle
  danger: '#D2887E', // lifted brick for dark mode
  scrim: 'rgba(10,8,6,0.6)', // deeper warm wash so it actually dims the dark surface, never cold black
  priorityGradient: ['#5B8DEF', '#9B6CF0'],
  accents: ['#C68BA0', '#6FB0A8', '#D6B36A', '#8E97C8', '#D6979C'],
} satisfies Palette;

export const Colors = { light, dark } as const;

// The DoubleDone Premium gradient (mauve -> rose -> honey): the shared visual signal that a surface or action
// is premium. The one deliberate glow against the calm Dusk palette. Used by the Settings premium card and the
// PremiumButton (Plan my order, Chart a course, Reflect on this week).
export const PREMIUM_GRADIENT = ['#8E5E72', '#B5798F', '#D6A77E'] as const;

// The Premium custom-theme presets (the "Dusk" family): seven calm, paper-like FULL palettes, each with a
// light and dark variant on the same token names (designed and WCAG-verified in Claude Design). Dusk is the
// unchanged default and the free state; the other six are Premium. Each preset carries the 12 core tokens; the
// rest of the Palette is derived per preset (surfaceCard / doneSoft / onDone) or kept fixed (scrim, the loud
// priorityGradient, and the per-task `accents` dots are deliberately theme-independent). IMPORTANT: onAccent is
// PER-THEME, Honey uses DARK label text because a calm gold cannot clear AA with white, so button labels must
// always read t.colors.onAccent, never a hardcoded white.
export type ThemeTokens = {
  bg: string; surface: string; ink: string; inkSoft: string; inkFaint: string; line: string;
  accent: string; accentSoft: string; onAccent: string; done: string; repeat: string; danger: string;
};

export const THEME_PRESETS: Record<ThemeName, { name: string; light: ThemeTokens; dark: ThemeTokens }> = {
  dusk: { name: 'Dusk',
    light: { bg: '#FAF6F1', surface: '#FFFFFF', ink: '#2B2722', inkSoft: '#7A7066', inkFaint: '#A89E92', line: '#ECE4D8', accent: '#9B6A7D', accentSoft: '#F1E7EC', onAccent: '#FFFFFF', done: '#7E9B6B', repeat: '#6E72A0', danger: '#A1554C' },
    dark: { bg: '#1B1917', surface: '#252119', ink: '#F2EBE0', inkSoft: '#A89E93', inkFaint: '#7A7066', line: '#34302A', accent: '#C68BA0', accentSoft: '#352C32', onAccent: '#1B1917', done: '#9DB98A', repeat: '#8E97C8', danger: '#D2887E' } },
  sage: { name: 'Sage',
    light: { bg: '#F3F5EF', surface: '#FFFFFF', ink: '#262A22', inkSoft: '#6A7064', inkFaint: '#9AA08F', line: '#E3E8DD', accent: '#5E7E62', accentSoft: '#E5EDE2', onAccent: '#FFFFFF', done: '#4E8C7A', repeat: '#6E7D9B', danger: '#A1554C' },
    dark: { bg: '#1A1C17', surface: '#23261F', ink: '#ECEFE4', inkSoft: '#A6AC9C', inkFaint: '#767B6C', line: '#32362C', accent: '#93B196', accentSoft: '#2A3328', onAccent: '#1A1C17', done: '#7FB7A4', repeat: '#9AA7C6', danger: '#D2887E' } },
  slate: { name: 'Slate',
    light: { bg: '#F2F4F6', surface: '#FFFFFF', ink: '#232830', inkSoft: '#687078', inkFaint: '#99A0A8', line: '#E1E6EB', accent: '#5C7790', accentSoft: '#E6ECF1', onAccent: '#FFFFFF', done: '#6E9B6B', repeat: '#8A78A0', danger: '#A1554C' },
    dark: { bg: '#15181B', surface: '#1E2226', ink: '#E7EBEF', inkSoft: '#A0A7AE', inkFaint: '#717880', line: '#2D3238', accent: '#8FA9C2', accentSoft: '#28313A', onAccent: '#15181B', done: '#8FB98C', repeat: '#B0A2C4', danger: '#D2887E' } },
  heather: { name: 'Heather',
    light: { bg: '#F4F2F7', surface: '#FFFFFF', ink: '#29262F', inkSoft: '#6F6A78', inkFaint: '#9F9AA8', line: '#E6E2EC', accent: '#74699B', accentSoft: '#ECE7F2', onAccent: '#FFFFFF', done: '#6E9B6B', repeat: '#5F86A0', danger: '#A1554C' },
    dark: { bg: '#18161C', surface: '#211E26', ink: '#EAE7F0', inkSoft: '#A4A0AC', inkFaint: '#75717C', line: '#302C38', accent: '#A99BCB', accentSoft: '#2C2838', onAccent: '#18161C', done: '#8FB98C', repeat: '#93A9C4', danger: '#D2887E' } },
  fog: { name: 'Fog',
    light: { bg: '#F1F4F3', surface: '#FFFFFF', ink: '#232826', inkSoft: '#67706C', inkFaint: '#97A09B', line: '#E0E6E3', accent: '#517672', accentSoft: '#E5EDEB', onAccent: '#FFFFFF', done: '#6E9B6B', repeat: '#8478A0', danger: '#A1554C' },
    dark: { bg: '#141716', surface: '#1D211F', ink: '#E6EBE8', inkSoft: '#9DA6A1', inkFaint: '#6F7873', line: '#2B302D', accent: '#8FB3AE', accentSoft: '#243230', onAccent: '#141716', done: '#8FB98C', repeat: '#AEA2C6', danger: '#D2887E' } },
  honey: { name: 'Honey',
    light: { bg: '#FAF6EC', surface: '#FFFFFF', ink: '#2B2720', inkSoft: '#736B5A', inkFaint: '#A89E8C', line: '#ECE5D3', accent: '#B5862B', accentSoft: '#F6EDD6', onAccent: '#2B2720', done: '#6E9B6B', repeat: '#6E86A0', danger: '#A1554C' },
    dark: { bg: '#1A1813', surface: '#232017', ink: '#F1EAD9', inkSoft: '#A89E8C', inkFaint: '#7A7363', line: '#332E22', accent: '#D9B65E', accentSoft: '#322A18', onAccent: '#1A1813', done: '#9DB98A', repeat: '#93A6BE', danger: '#D2887E' } },
  rose: { name: 'Rose',
    light: { bg: '#FBF3F2', surface: '#FFFFFF', ink: '#2E2426', inkSoft: '#7A676B', inkFaint: '#B09BA0', line: '#F0E2E2', accent: '#AE5468', accentSoft: '#F7E6E9', onAccent: '#FFFFFF', done: '#7E9B6B', repeat: '#6E86A0', danger: '#A1554C' },
    dark: { bg: '#1C1719', surface: '#251D20', ink: '#F2E7EA', inkSoft: '#B09BA0', inkFaint: '#7C6B6F', line: '#352B2E', accent: '#E0909F', accentSoft: '#38272C', onAccent: '#1C1719', done: '#9DB98A', repeat: '#93A6BE', danger: '#D2887E' } },
};

// Tiny colour helpers to derive the Palette tokens the presets do not carry (surfaceCard / doneSoft).
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function mix(hexA: string, hexB: string, tB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return `#${a.map((v, i) => Math.round(v * (1 - tB) + b[i] * tB).toString(16).padStart(2, '0')).join('')}`;
}

// Build a full Palette from a preset's 12 tokens: the rest is derived (surfaceCard a translucent surface,
// doneSoft a pale tint of done, onDone white on light / the dark paper on dark) or carried from the fixed,
// theme-independent extras (scrim, priorityGradient, the per-task accents dots).
function toPalette(tk: ThemeTokens, scheme: 'light' | 'dark'): Palette {
  const base = scheme === 'dark' ? dark : light;
  return {
    bg: tk.bg, surface: tk.surface, ink: tk.ink, inkSoft: tk.inkSoft, inkFaint: tk.inkFaint, line: tk.line,
    accent: tk.accent, accentSoft: tk.accentSoft, onAccent: tk.onAccent, done: tk.done, repeat: tk.repeat, danger: tk.danger,
    surfaceCard: rgba(tk.surface, scheme === 'light' ? 0.92 : 0.86),
    doneSoft: mix(tk.done, tk.bg, 0.84),
    onDone: scheme === 'light' ? '#FFFFFF' : tk.onAccent,
    scrim: base.scrim,
    priorityGradient: base.priorityGradient,
    accents: base.accents,
  };
}

// The launch-resolved palette (system-following), kept as the default and as the
// ThemeProvider's fallback. Live switching (theme + text size) flows through the
// provider via useTheme / useThemedStyles; this static export stays for any
// module-scope use and so a component rendered outside the provider still works.
export const colors: Palette = Appearance.getColorScheme() === 'dark' ? dark : light;

export const spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

// Layout caps shared across screens. `maxContentWidth` is the page-content column width every full-screen
// route (and the Rooms sheet) centres its content at, so wide-desktop layouts stay a calm centred column
// instead of stretching edge-to-edge. `cardMediaWidth` caps a card's media (the Lookback polaroid, the
// scrapbook image, the date-picker card) so it never balloons on wide hosts. `maxCalendarWidth` caps the
// month-grid date picker so its square day-cells stay a comfortable size regardless of host-card width.
// One source of truth, previously per-screen literals.
export const layout = {
  maxContentWidth: 560,
  cardMediaWidth: 360,
  maxCalendarWidth: 340,
} as const;

// The canonical pressed-state dim: one opacity for the "you're pressing this" feedback, instead of the
// 0.6/0.7/0.8/0.85/0.9 spread that had crept across the app. The one documented exception is PremiumButton's
// gradient, which stays at 0.9 (a gradient dims differently than a flat fill).
export const PRESSED_OPACITY = 0.7;

// Control sizes shared across components. `check` is the round sage completion-check diameter (TaskRow's hero
// size), unified so the breakdown and chart checks match it.
export const control = { check: 26 } as const;

// Border-width family. `hair` is the default hairline, `thin` and `thick` the two heavier emphases. Literals
// routed here at their current values (no reconciliation of the 1.5-vs-2 selected-emphasis split yet).
export const border = { hair: 1, thin: 1.5, thick: 2 } as const;

// Motion language (the redesign) lives in its own pure module so non-UI code can import it
// under the test runner. Re-exported here so components keep importing it from the theme
// alongside spacing / radius.
export { motion } from './motion';

// Two faces, applied per text style (RN-web gives every Text its own default
// font, so neither inherits from the page): `sans` is Newsreader for headings,
// `body` is Atkinson Hyperlegible, the Braille Institute legibility face, for
// everything else. On web they come from CSS vars (global.css @import); on native
// they are the real families loaded by expo-google-fonts in the root layout
// (Newsreader 600 is the heaviest weight that package ships, and reads as a calm
// editorial heading). Native weight/italic beyond these is synthesised, which is
// fine for v1; loading more variants is a small follow-on (see BUILD-PLAN).
// `bodyBold` exists because Android does not synthesise bold for a custom-loaded
// font: a bold body label set with `fontWeight` alone renders at regular weight
// on device. So bold body text points at the real Atkinson 700 family on native.
// On web every token is the SAME CSS var (fontWeight on the style drives the
// weight), so `body` and `bodyBold` are byte-identical there, the web build never
// changes. Headings stay Newsreader 600 (600-vs-700 is imperceptible at heading
// size, so no separate bold heading token).
export const fonts = {
  sans: Platform.OS === 'web' ? 'var(--font-display), system-ui, sans-serif' : 'Newsreader_600SemiBold',
  body: Platform.OS === 'web' ? 'var(--font-body), ui-sans-serif, system-ui, sans-serif' : 'AtkinsonHyperlegible_400Regular',
  bodyBold: Platform.OS === 'web' ? 'var(--font-body), ui-sans-serif, system-ui, sans-serif' : 'AtkinsonHyperlegible_700Bold',
} as const;

// The named type scale. Font sizes were inline literals scattered across every screen, which
// let title and eyebrow sizes drift apart over time. A step is a ready-to-spread style object
// carrying fontSize, lineHeight, fontFamily, fontWeight (and letterSpacing where the step needs
// it). The text-size accessibility multiplier `scale` is baked into the size + lineHeight here,
// so a component spreads `t.type.title` and gets the accessible size with no `* t.scale` at the
// call site. A site keeps its own colour, margins and textAlign; the token supplies the metrics.
export type TypeStep = {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: '400' | '600' | '700';
  letterSpacing?: number;
};

export function makeTypeScale(scale: number) {
  return {
    display: { fontSize: 40 * scale, lineHeight: 46 * scale, fontFamily: fonts.sans, fontWeight: '600' },
    title: { fontSize: 34 * scale, lineHeight: 40 * scale, fontFamily: fonts.sans, fontWeight: '600' },
    heading: { fontSize: 24 * scale, lineHeight: 30 * scale, fontFamily: fonts.sans, fontWeight: '600' },
    subheading: { fontSize: 22 * scale, lineHeight: 28 * scale, fontFamily: fonts.sans, fontWeight: '600' },
    body: { fontSize: 17 * scale, lineHeight: 23 * scale, fontFamily: fonts.body, fontWeight: '400' },
    bodyStrong: { fontSize: 17 * scale, lineHeight: 23 * scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    label: { fontSize: 15 * scale, lineHeight: 20 * scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    eyebrow: { fontSize: 12 * scale, lineHeight: 16 * scale, fontFamily: fonts.bodyBold, fontWeight: '700', letterSpacing: 0.5 },
    caption: { fontSize: 13 * scale, lineHeight: 18 * scale, fontFamily: fonts.body, fontWeight: '400' },
  } satisfies Record<string, TypeStep>;
}

export type TypeScale = ReturnType<typeof makeTypeScale>;

// The resolved, swappable theme the app renders against. The colours come from
// the active scheme; `scale` multiplies every font size (the text-size setting);
// `reduceMotion` is the resolved motion preference. Built by the ThemeProvider.
export type Theme = {
  scheme: 'light' | 'dark';
  colors: Palette;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radius: typeof radius;
  type: TypeScale;
  scale: number;
  reduceMotion: boolean;
};

export function buildTheme(scheme: 'light' | 'dark', scale: number, reduceMotion: boolean, preset: ThemeName = 'dusk'): Theme {
  // Dusk (the default + free state) renders the canonical light/dark palettes UNCHANGED; the six Premium
  // presets derive their full Palette from their 12 preset tokens.
  const colors = preset === 'dusk' ? (scheme === 'dark' ? dark : light) : toPalette(THEME_PRESETS[preset][scheme], scheme);
  return {
    scheme,
    colors,
    fonts,
    spacing,
    radius,
    type: makeTypeScale(scale),
    scale,
    reduceMotion,
  };
}

// The soft card elevation shared by TaskRow and the routines list. One recipe, two
// per-scheme strings (a deeper shadow on dark, a warm-ink one on light), so the two
// call sites can't drift apart.
export function cardShadow(t: Theme): string {
  return t.scheme === 'dark' ? '0px 6px 18px -10px rgba(0,0,0,0.5)' : '0px 6px 18px -10px rgba(43,39,34,0.18)';
}
