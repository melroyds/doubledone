import '@/global.css';

import { Appearance, Platform } from 'react-native';

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
  done: string;
  doneSoft: string;
  repeat: string;
  danger: string;
  priorityGradient: readonly string[];
  accents: readonly string[];
};

const light = {
  bg: '#FAF6F1', // warm paper
  surface: '#FFFFFF', // cards
  surfaceCard: 'rgba(255,255,255,0.92)', // cards over the living background (legibility held)
  ink: '#2B2722', // primary text (warm near-black)
  inkSoft: '#7A7066', // secondary text
  inkFaint: '#A89E93', // tertiary / placeholder
  line: '#ECE4D8', // hairline borders
  accent: '#9B6A7D', // dusky mauve, the single accent, used sparingly
  accentSoft: '#F1E7EC', // mauve tint
  done: '#7E9B6B', // sage, completion, calm not alarming
  doneSoft: '#E9EFE2',
  repeat: '#6E72A0', // dusk periwinkle, marks repeating tasks
  danger: '#A1554C', // muted brick, the calm stand-in for "red" on destructive actions (Remove)
  priorityGradient: ['#3B82F6', '#8B5CF6'], // saved loud blue->violet, for the premium "Prioritise a task" feature
  // A small, calm set of accent hues (e.g. for per-task dots). Desaturated by design.
  accents: ['#9B6A7D', '#4E8C86', '#C19A4F', '#6E72A0', '#BE7F84'], // mauve, teal, gold, periwinkle, rose
} satisfies Palette;

const dark = {
  bg: '#1B1917', // warm charcoal-brown, not terminal black
  surface: '#252119',
  surfaceCard: 'rgba(37,33,25,0.86)', // cards over the living background
  ink: '#F2EBE0',
  inkSoft: '#A89E93',
  inkFaint: '#7A7066',
  line: '#34302A',
  accent: '#C68BA0', // lifted mauve
  accentSoft: '#352C32',
  done: '#9DB98A',
  doneSoft: '#2A3024',
  repeat: '#8E97C8', // lifted periwinkle
  danger: '#D2887E', // lifted brick for dark mode
  priorityGradient: ['#5B8DEF', '#9B6CF0'],
  accents: ['#C68BA0', '#6FB0A8', '#D6B36A', '#8E97C8', '#D6979C'],
} satisfies Palette;

export const Colors = { light, dark } as const;

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

// The resolved, swappable theme the app renders against. The colours come from
// the active scheme; `scale` multiplies every font size (the text-size setting);
// `reduceMotion` is the resolved motion preference. Built by the ThemeProvider.
export type Theme = {
  scheme: 'light' | 'dark';
  colors: Palette;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radius: typeof radius;
  scale: number;
  reduceMotion: boolean;
};

export function buildTheme(scheme: 'light' | 'dark', scale: number, reduceMotion: boolean): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? dark : light,
    fonts,
    spacing,
    radius,
    scale,
    reduceMotion,
  };
}
