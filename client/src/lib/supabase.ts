import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Sync is opt-in. The client only wires up when both env values are present;
// with them absent (the default build, and anywhere the keys are not configured)
// `supabase` is null and the whole app stays local-first, anonymous and offline.
// Nothing about Today changes. The publishable/anon key is safe to ship; the
// service_role key must never appear here or anywhere in the client.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false, // native + typed-code OTP; we never parse a magic link from the URL
        },
      })
    : null;

/** True when the keys are configured and cloud sync can be offered. */
export const isSyncConfigured = supabase != null;

/** The Authorization header for an authed Worker call, or null when signed out or sync is off. The
 *  single client path that sends the user's token: the Stripe seams and OCR both read it. */
export async function authHeader(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  // getSession() reads AsyncStorage; a native-bridge or storage-corruption rejection here must not escape
  // as an unhandled promise (it would strand a caller's busy state). Return null and let every caller's
  // existing `if (!auth)` fallback take the calm signed-out path.
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}
