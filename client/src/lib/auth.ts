import { type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { resetClockSkew } from './clock';
import { supabase } from './supabase';

// Thin wrapper over Supabase auth state. Returns the current session (or null
// when sync is not configured or nobody is signed in) and keeps it live via
// onAuthStateChange. Local-first: a null session just means the app runs offline.
/**
 * The session AND whether we have actually found out yet.
 *
 * `useSession()` returns null for BOTH "signed out" and "still hydrating", and any screen that
 * treats those two the same will act on a guess. That is not theoretical: the shared list read null
 * on its first render, concluded the user had no list, and redirected to the pairing screen, which
 * made opening your own list a loop you could not get out of.
 *
 * `known` is false only for the moment between mount and the first answer. Screens that redirect,
 * or that say "you need an account", must wait for it.
 */
export function useSessionState(): { session: Session | null; known: boolean } {
  // No Supabase configured at all is a definitive answer and it is knowable at mount, so it is the
  // initial state rather than a setState in an effect (which would be a cascading render).
  const [state, setState] = useState<{ session: Session | null; known: boolean }>(() => ({ session: null, known: !supabase }));

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, known: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // The clock correction was established for THAT session's account against the server. When a
      // session ends, drop it, so the next person to use this device is owed their own device's
      // clock rather than an offset learned for somebody else. Here rather than at the three
      // sign-out call sites, because a fourth one will be added some day and will forget: this is
      // the one place every session ending must pass through.
      if (!next) resetClockSkew();
      setState({ session: next, known: true });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** Just the session, for the many screens that only ever render it and never redirect on it. One
 *  implementation, so the two can never drift. */
export function useSession(): Session | null {
  return useSessionState().session;
}
