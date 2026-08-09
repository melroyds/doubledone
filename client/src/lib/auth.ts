import { type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { resetClockSkew } from './clock';
import { supabase } from './supabase';

// Thin wrapper over Supabase auth state. Returns the current session (or null
// when sync is not configured or nobody is signed in) and keeps it live via
// onAuthStateChange. Local-first: a null session just means the app runs offline.
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // The clock correction was established for THAT session's account against the server. When a
      // session ends, drop it, so the next person to use this device is owed their own device's
      // clock rather than an offset learned for somebody else. Here rather than at the three
      // sign-out call sites, because a fourth one will be added some day and will forget: this is
      // the one place every session ending must pass through.
      if (!next) resetClockSkew();
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return session;
}
