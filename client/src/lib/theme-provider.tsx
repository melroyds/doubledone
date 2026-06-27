import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Appearance, Platform } from 'react-native';

import { buildTheme, type Theme } from '@/constants/theme';
import { DEFAULT_SETTINGS, resolveReduceMotion, resolveScheme, scaleFor, type Settings } from '@/lib/settings';
import { loadSettings, saveSettings } from '@/lib/storage';

type ThemeContextValue = {
  theme: Theme;
  settings: Settings;
  setSettings: (partial: Partial<Settings>) => void;
  ready: boolean;
};

// Resolved once at module load so a component rendered outside the provider (or
// before persisted settings land) still gets a sane theme: system-following, no
// text scaling, motion on. The provider replaces it with the live resolution.
const FALLBACK_THEME = buildTheme(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light', 1, false);

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Holds the resolved theme and the user's settings, and re-resolves on a settings
// change or a system change (colour scheme / reduced motion), so the whole app
// re-paints live. Wraps the router in _layout.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(() =>
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );
  const [systemReduce, setSystemReduce] = useState(getReduceInitial);

  // Load persisted settings once.
  useEffect(() => {
    let active = true;
    void loadSettings().then((s) => {
      if (!active) return;
      setSettingsState(s);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Follow the device colour scheme so a 'system' theme tracks it live.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) =>
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light'),
    );
    return () => sub.remove();
  }, []);

  // Track the system reduced-motion flag (web media query / native a11y).
  useEffect(() => {
    let active = true;
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
      if (!mq) return;
      const handler = (e: MediaQueryListEvent) => {
        if (active) setSystemReduce(e.matches);
      };
      mq.addEventListener?.('change', handler);
      return () => {
        active = false;
        mq.removeEventListener?.('change', handler);
      };
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (active) setSystemReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      if (active) setSystemReduce(v);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const setSettings = useCallback((partial: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      void saveSettings(next);
      return next;
    });
  }, []);

  const theme = useMemo(
    () =>
      buildTheme(
        resolveScheme(settings.theme, systemScheme),
        scaleFor(settings.textSize),
        resolveReduceMotion(settings.motion, systemReduce),
        settings.themePreset,
      ),
    [settings, systemScheme, systemReduce],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, settings, setSettings, ready }),
    [theme, settings, setSettings, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The active theme. Falls back to a system-resolved theme outside the provider. */
export function useTheme(): Theme {
  return useContext(ThemeContext)?.theme ?? FALLBACK_THEME;
}

/** Build StyleSheet styles from the active theme; re-runs only when the theme changes. */
export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}

/** Read + update the user's settings. Throws outside the provider (a real bug). */
export function useSettings(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useSettings must be used within ThemeProvider');
  return ctx;
}

/** Whether motion should be reduced (the resolved preference, system or chosen). */
export function useReducedMotion(): boolean {
  return useTheme().reduceMotion;
}

function getReduceInitial(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }
  return false;
}
