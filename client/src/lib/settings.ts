// The settings model, kept pure so the resolution logic is unit-tested. The
// AsyncStorage read/write lives in storage.ts (a seam). The Settings page is the
// one deliberate exception to "remove friction, never add a setting": for this
// audience theme, text size and motion are access needs, not config knobs, so
// the page stays scoped to comfort/accessibility and never an everything-dashboard.
// aiEnabled is the other deliberate exception: a values / privacy choice (use the AI
// features, or run the app fully offline and AI-free), which for an AI-wary user is an
// access need too. Default on, so nothing changes for an existing user until they choose.

export type ThemePref = 'system' | 'light' | 'dark';
export type TextSize = 'small' | 'default' | 'large';
export type MotionPref = 'system' | 'reduce';
export type ThemeName = 'dusk' | 'sage' | 'slate' | 'heather' | 'fog' | 'honey' | 'rose';

export type Settings = {
  theme: ThemePref;
  textSize: TextSize;
  motion: MotionPref;
  themePreset: ThemeName; // Premium: the full colour theme (Dusk is the default and the free state)
  aiEnabled: boolean; // whether the AI features are offered at all; false = a fully offline, AI-free app
};

// System-following, default size, system-following motion: the calmest defaults,
// and the same behaviour the app had before the page existed.
export const DEFAULT_SETTINGS: Settings = { theme: 'system', textSize: 'default', motion: 'system', themePreset: 'dusk', aiEnabled: true };

const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark'];
const TEXT_SIZES: readonly TextSize[] = ['small', 'default', 'large'];
const MOTION_PREFS: readonly MotionPref[] = ['system', 'reduce'];
export const THEME_NAMES: readonly ThemeName[] = ['dusk', 'sage', 'slate', 'heather', 'fog', 'honey', 'rose'];

/** The active colour scheme, from the preference and the device scheme. */
export function resolveScheme(theme: ThemePref, system: 'light' | 'dark' | null | undefined): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return system === 'dark' ? 'dark' : 'light';
}

/**
 * The multiplier applied to every font size. Capped deliberately: large enough
 * to genuinely help, small enough that the calm layouts do not break.
 */
export function scaleFor(size: TextSize): number {
  switch (size) {
    case 'small':
      return 0.92;
    case 'large':
      return 1.18;
    default:
      return 1;
  }
}

/** Whether motion should be reduced, from the preference and the system flag. */
export function resolveReduceMotion(motion: MotionPref, systemReduce: boolean): boolean {
  return motion === 'reduce' || systemReduce;
}

/** Parse persisted settings, falling back per-field so a partial or corrupt blob never throws. */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      theme: THEME_PREFS.includes(o.theme as ThemePref) ? (o.theme as ThemePref) : DEFAULT_SETTINGS.theme,
      textSize: TEXT_SIZES.includes(o.textSize as TextSize) ? (o.textSize as TextSize) : DEFAULT_SETTINGS.textSize,
      motion: MOTION_PREFS.includes(o.motion as MotionPref) ? (o.motion as MotionPref) : DEFAULT_SETTINGS.motion,
      themePreset: THEME_NAMES.includes(o.themePreset as ThemeName) ? (o.themePreset as ThemeName) : DEFAULT_SETTINGS.themePreset,
      aiEnabled: typeof o.aiEnabled === 'boolean' ? o.aiEnabled : DEFAULT_SETTINGS.aiEnabled,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function serializeSettings(s: Settings): string {
  return JSON.stringify(s);
}
