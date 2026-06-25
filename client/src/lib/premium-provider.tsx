import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { FREE_ENTITLEMENT, type Entitlement } from './entitlement';
import { type DevPremium, gateEntitlement } from './premium-flag';
import { loadDevPremium, saveDevPremium } from './storage';
import { loadEntitlement } from './stripe';

// The dev premium override is honoured only in a local dev or preview build, never production, so
// it is inert once `premium` merges to main. __DEV__ covers `npm run dev`; the env flag (set only
// on the preview EAS profile, never the production one) covers a sideloaded preview APK.
export const DEV_PREMIUM_ALLOWED =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_PREMIUM_DEV === 'true';

type PremiumValue = {
  premium: boolean; // the effective flag every gated feature reads
  entitlement: Entitlement; // the RAW server entitlement (its premium reflects the server, not the override)
  effectiveEntitlement: Entitlement; // what to GATE on: real tenure/period, premium = the resolved flag
  loading: boolean; // true until the first entitlement load resolves; `premium` is meaningful only once false
  devOverride: DevPremium; // null unless a dev forced it (dev / preview only)
  devAllowed: boolean; // whether the dev override is usable in this build (false in production)
  setDevOverride: (v: DevPremium) => void;
  refresh: () => void; // re-read the server entitlement, e.g. after returning from checkout
};

const PremiumContext = createContext<PremiumValue | null>(null);

// The value for a consumer rendered OUTSIDE the provider: a stable, free, no-op default so a stray
// consumer never crashes, never reads as premium, and never churns identity. Module-level so its
// reference is stable, mirroring ThemeProvider's FALLBACK_THEME.
const OUTSIDE_PROVIDER: PremiumValue = {
  premium: false,
  entitlement: FREE_ENTITLEMENT,
  effectiveEntitlement: FREE_ENTITLEMENT,
  loading: false,
  devOverride: null,
  devAllowed: false,
  setDevOverride: () => {},
  refresh: () => {},
};

// Holds the premium entitlement plus the dev override, and exposes the resolved `premium` flag and a
// gate-ready `effectiveEntitlement` app-wide. Wraps the router in _layout, below ThemeProvider. The
// server entitlement (lib/stripe -> the Worker /entitlement, fed by Stripe) is the real source of
// truth; the dev override only bends it where DEV_PREMIUM_ALLOWED, for testing premium and free
// without a live sub. EVERY gated feature reads this provider, so the override drives them all.
export function PremiumProvider({ children }: { children: ReactNode }) {
  const [entitlement, setEntitlement] = useState<Entitlement>(FREE_ENTITLEMENT);
  const [loading, setLoading] = useState(true);
  const [devOverride, setDevOverrideState] = useState<DevPremium>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load (and reload on refresh) the server entitlement. `loading` starts true and flips false after
  // the first load; a refresh does not re-toggle it, so a re-fetch never blanks the UI.
  useEffect(() => {
    let active = true;
    void loadEntitlement().then((e) => {
      if (!active) return;
      setEntitlement(e);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Load the persisted dev override once (it only takes effect where DEV_PREMIUM_ALLOWED).
  useEffect(() => {
    let active = true;
    void loadDevPremium().then((v) => {
      if (active) setDevOverrideState(v);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const setDevOverride = useCallback((v: DevPremium) => {
    setDevOverrideState(v);
    void saveDevPremium(v);
  }, []);

  // Memoize the context value (like ThemeProvider) so consumers re-render only when a real input
  // changes, not on every provider render. effectiveEntitlement is the single gate input: the real
  // entitlement with `premium` resolved through the override, so tenure-aware gates honour it too.
  const value = useMemo<PremiumValue>(() => {
    const effectiveEntitlement = gateEntitlement(entitlement, devOverride, DEV_PREMIUM_ALLOWED);
    return {
      premium: effectiveEntitlement.premium,
      entitlement,
      effectiveEntitlement,
      loading,
      devOverride,
      devAllowed: DEV_PREMIUM_ALLOWED,
      setDevOverride,
      refresh,
    };
  }, [entitlement, devOverride, loading, setDevOverride, refresh]);

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

/**
 * The premium flag and the gate-ready entitlement. `premium` is the resolved switch every paid
 * feature reads; `effectiveEntitlement` is what tenure-aware gates (e.g. canMakeScrapbook) pass.
 * `premium` is only meaningful once `loading` is false. Defaults to free outside the provider.
 */
export function usePremium(): PremiumValue {
  return useContext(PremiumContext) ?? OUTSIDE_PROVIDER;
}
