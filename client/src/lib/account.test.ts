import { type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { deleteAccount } from './account';

function mockClient(rpcResult: { error: { message: string } | null }) {
  const signOut = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => rpcResult);
  return { client: { rpc, auth: { signOut } } as unknown as SupabaseClient, rpc, signOut };
}

describe('deleteAccount', () => {
  it('calls the delete_account RPC and signs out on success', async () => {
    const { client, rpc, signOut } = mockClient({ error: null });
    const res = await deleteAccount(client);
    expect(rpc).toHaveBeenCalledWith('delete_account');
    expect(signOut).toHaveBeenCalledOnce();
    expect(res).toEqual({ ok: true });
  });

  it('returns the error and does NOT sign out when the RPC fails', async () => {
    const { client, signOut } = mockClient({ error: { message: 'boom' } });
    const res = await deleteAccount(client);
    expect(signOut).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, error: 'boom' });
  });
});
