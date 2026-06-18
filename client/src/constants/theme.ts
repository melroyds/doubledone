import '@/global.css';

import { Platform } from 'react-native';

// DoubleDone's palette is deliberately calm and warm, the opposite of an
// "epic" productivity app (that is Chronoloria's job). Soft paper background,
// warm ink, a single clay accent used sparingly, and a gentle sage for "done"
// (never an alarming green). Light-first by design: near-zero maintenance and
// no theme toggle to forget. Dark values are kept for when there's a reason.

const light = {
  bg: '#FBF7F1', // warm paper
  surface: '#FFFFFF', // cards
  ink: '#2B2722', // primary text (warm near-black)
  inkSoft: '#7A7066', // secondary text
  inkFaint: '#A89E93', // tertiary / placeholder
  line: '#ECE4D8', // hairline borders
  accent: '#C4715A', // clay, the single accent, used sparingly
  accentSoft: '#F3E4DC', // clay tint
  done: '#7E9B6B', // sage, completion, calm not alarming
  doneSoft: '#E9EFE2',
  repeat: '#5F7E9B', // cool denim, marks repeating tasks as distinct from one-offs
} as const;

const dark = {
  bg: '#1C1A17',
  surface: '#25221E',
  ink: '#F2EBE0',
  inkSoft: '#A89E93',
  inkFaint: '#7A7066',
  line: '#322E28',
  accent: '#D98A72',
  accentSoft: '#3A2C26',
  done: '#9DB98A',
  doneSoft: '#2A3024',
  repeat: '#8AA6C2',
} as const;

export const Colors = { light, dark } as const;

// The active theme. Light for now. Wiring a scheme switch is deferred until
// there is a reason to (decision-log: remove friction, never add a setting).
export const colors = light;

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
export const fonts = {
  sans: Platform.OS === 'web' ? 'var(--font-display), system-ui, sans-serif' : 'System',
} as const;
