import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { FREE_ENTITLEMENT, type Entitlement } from './entitlement';
import { type DevPremium, resolvePremium } from './premium-flag';
import { loadDevPremium, saveDevPremium } from './storage';
import { loadEntitlement } from './stripe';

// The dev premium override is honoured only in a local dev or preview build, never production, so
// it is inert once `premium` merges to main. __DEV__ covers `npm run dev`; the env flag (set only
// on the preview EAS profile, never the production one) covers a sideloaded preview APK.
export const DEV_PREMIUM_ALLOWED =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_PREMIUM_DEV === 'true';

type PremiumValue = {
  premium: boolean; // the effective flag every gated feature reads
  entitlement: Entitlement; // the raw server entitlement (the Premium card, tenure, period end)
  loading: boolean;
  devOverride: DevPremium; // null unless a dev forced it (dev / preview only)
  devAllowed: boolean; // whether the dev override is usable in this build (false in production)
  setDevOverride: (v: DevPremium) => void;
  refresh: () => void; // re-read the server entitlement, e.g. after returning from checkout
};

const PremiumContext = createContext<PremiumValue | null>(null);

// Holds the premium entitlement plus the dev override and exposes the resolved `premium` flag
// app-wide. Wraps the router in _layout, below ThemeProvider. The server entitlement (lib/stripe
// -> the Worker's /entitlement, fed by Stripe) is the real source of truth; the dev override only
// bends it where DEV_PREMIUM_ALLOWED, for testing the premium and free states without a live sub.
export function PremiumProvider({ children }: { children: ReactNode }) {
  const [entitlement, setEntitlement] = useState<Entitlement>(FREE_ENTITLEMENT);
  const [loading, setLoading] = useState(true);
  const [devOverride, setDevOverrideState] = useState<DevPremium>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load (and reload on refresh) the server entitlement. `loading` starts true and flips false
  // after the first load; a refresh does not re-toggle it, so a re-fetch never blanks the UI.
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

  const premium = resolvePremium(entitlement.premium, devOverride, DEV_PREMIUM_ALLOWED);

  return (
    <PremiumContext.Provider
      value={{ premium, entitlement, loading, devOverride, devAllowed: DEV_PREMIUM_ALLOWED, setDevOverride, refresh }}
    >
      {children}
    </PremiumContext.Provider>
  );
}

/** The effective premium flag plus the entitlement detail. Defaults to free outside the provider,
 *  so a stray consumer never crashes and never accidentally reads as premium. */
export function usePremium(): PremiumValue {
  return (
    useContext(PremiumContext) ?? {
      premium: false,
      entitlement: FREE_ENTITLEMENT,
      loading: false,
      devOverride: null,
      devAllowed: false,
      setDevOverride: () => {},
      refresh: () => {},
    }
  );
}
