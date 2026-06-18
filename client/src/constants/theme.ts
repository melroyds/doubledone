import '@/global.css';

import { Appearance, Platform } from 'react-native';

// DoubleDone's "Dusk" palette: calm and warm, the opposite of an "epic"
// productivity app. Soft paper background, warm ink, a single dusky-mauve accent
// used sparingly, sage for "done" (never an alarming green), and periwinkle for
// repeating tasks. Dark mode is a warm charcoal-brown, never a terminal black,
// the lights dimmed not a different room; every hue lifts in lightness so it
// still clears WCAG AA, and nothing gains saturation or urgency. Light stays the
// default; dark is an optional, system-following loadout, not a setting to manage.

const light = {
  bg: '#FAF6F1', // warm paper
  surface: '#FFFFFF', // cards
  ink: '#2B2722', // primary text (warm near-black)
  inkSoft: '#7A7066', // secondary text
  inkFaint: '#A89E93', // tertiary / placeholder
  line: '#ECE4D8', // hairline borders
  accent: '#9B6A7D', // dusky mauve, the single accent, used sparingly
  accentSoft: '#F1E7EC', // mauve tint
  done: '#7E9B6B', // sage, completion, calm not alarming
  doneSoft: '#E9EFE2',
  repeat: '#6E72A0', // dusk periwinkle, marks repeating tasks
  priorityGradient: ['#3B82F6', '#8B5CF6'], // saved loud blue->violet, for the premium "Prioritise a task" feature
  // A small, calm set of accent hues (e.g. for per-task dots). Desaturated by design.
  accents: ['#9B6A7D', '#4E8C86', '#C19A4F', '#6E72A0', '#BE7F84'], // mauve, teal, gold, periwinkle, rose
} as const;

const dark = {
  bg: '#1B1917', // warm charcoal-brown, not terminal black
  surface: '#252119',
  ink: '#F2EBE0',
  inkSoft: '#A89E93',
  inkFaint: '#7A7066',
  line: '#34302A',
  accent: '#C68BA0', // lifted mauve
  accentSoft: '#352C32',
  done: '#9DB98A',
  doneSoft: '#2A3024',
  repeat: '#8E97C8', // lifted periwinkle
  priorityGradient: ['#5B8DEF', '#9B6CF0'],
  accents: ['#C68BA0', '#6FB0A8', '#D6B36A', '#8E97C8', '#D6979C'],
} as const;

export const Colors = { light, dark } as const;

// The active theme, resolved once at launch from the device colour scheme (web:
// prefers-color-scheme). Light-first; dark follows the system automatically, with
// no in-app setting to manage. Resolved at module load so component StyleSheets
// stay static (no per-component theme hook needed).
export const colors = Appearance.getColorScheme() === 'dark' ? dark : light;

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

// System font everywhere; on web we lean on the display var from global.css.
// (Typography overhaul to Newsreader + Atkinson Hyperlegible follows.)
export const fonts = {
  sans: Platform.OS === 'web' ? 'var(--font-display), system-ui, sans-serif' : 'System',
} as const;
