import { type SupabaseClient } from '@supabase/supabase-js';

// Account deletion (the right to erasure). Calls the SECURITY DEFINER
// `delete_account` RPC, which removes the caller's auth.users row; their tasks
// cascade via the foreign key. The RPC is scoped to auth.uid() server-side, so a
// caller can only ever delete themselves. On success, sign out locally; on
// failure, leave the session intact and surface the error. A seam (it touches
// Supabase), but the contract, that it calls the right RPC and signs out only on
// success, is unit-tested with a mock client.
export async function deleteAccount(client: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.rpc('delete_account');
  if (error) return { ok: false, error: error.message };
  await client.auth.signOut();
  return { ok: true };
}
