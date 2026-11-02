import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable import/no-duplicates -- ESLint's resolver reads the base and its platform files as one module */
import { PURCHASER_HEADER } from './ai';
import { ANON_PURCHASER_RE } from './iap';
import * as web from './purchases';
import * as android from './purchases.android';
import * as ios from './purchases.ios';
/* eslint-enable import/no-duplicates */

// Premium without an account (2026-11-03): the proof each platform hands lib/ai, and the two constants the phone
// and the Worker must agree on. The platform files are glue around the RevenueCat native module, which cannot run in
// node, so the SDK is a stub here that answers what a phone would (vi.mock is hoisted above the imports). Only the
// proof is tested through it: the rest of those files stays the untested glue their headers describe.
const sdk = vi.hoisted(() => ({ appUserId: '', throws: false }));
vi.mock('react-native-purchases', () => ({
  default: {
    setLogLevel: vi.fn(async () => {}),
    configure: vi.fn(),
    addCustomerInfoUpdateListener: vi.fn(),
    getAppUserID: vi.fn(async () => {
      if (sdk.throws) throw new Error('the store is not answering');
      return sdk.appUserId;
    }),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', WARN: 'WARN' },
}));
vi.mock('react-native', () => ({ Linking: { openURL: vi.fn() } }));
vi.mock('./supabase', () => ({ authHeader: vi.fn(), supabase: null, isSyncConfigured: false }));

const ANON = '$RCAnonymousID:0123456789abcdef0123456789abcdef';
const UID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  sdk.appUserId = ANON;
  sdk.throws = false;
});

describe('purchaserProof, per platform', () => {
  it('the web never has one: it sells through Stripe, to accounts only', async () => {
    expect(await web.purchaserProof()).toBeNull();
  });

  it('Android never has one: it sells only to accounts, so a signed-out id never holds a purchase', async () => {
    expect(await android.purchaserProof()).toBeNull();
  });

  it("the iPhone: nothing before the store has configured, then the anonymous id, and never an account's", async () => {
    // Before configure: no proof, and no configure started from here.
    expect(await ios.purchaserProof()).toBeNull();

    vi.stubGlobal('__DEV__', false);
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_test';
    try {
      await ios.configurePurchases();
    } finally {
      delete process.env.EXPO_PUBLIC_RC_IOS_KEY;
      vi.unstubAllGlobals();
    }

    expect(await ios.purchaserProof()).toBe(ANON); // signed out: the id RevenueCat gave this install
    sdk.appUserId = UID;
    expect(await ios.purchaserProof()).toBeNull(); // signed in: the id is the Supabase uuid, never sent as a proof
    sdk.appUserId = `${ANON}x`;
    expect(await ios.purchaserProof()).toBeNull(); // anything not exactly the anonymous form
    sdk.throws = true;
    expect(await ios.purchaserProof()).toBeNull(); // and a store error is no proof, never a throw
  });
});

// The Worker's side lives in server/, a separate workspace this one never imports, so its two constants are read as
// text. If either side changed alone, the phone would send a header nobody reads, or a proof the server refuses.
describe('the phone and the Worker agree', () => {
  const SERVER = join(__dirname, '..', '..', '..', 'server', 'src');

  it('on the exact anonymous form (server/src/purchaser.ts ANON_PURCHASER_RE)', () => {
    const src = readFileSync(join(SERVER, 'purchaser.ts'), 'utf8');
    const m = src.match(/export const ANON_PURCHASER_RE = (\/.+\/);/);
    expect(m?.[1]).toBe(String(ANON_PURCHASER_RE));
  });

  it('on the header name (server/src/store-premium.ts PURCHASER_HEADER)', () => {
    const src = readFileSync(join(SERVER, 'store-premium.ts'), 'utf8');
    const m = src.match(/export const PURCHASER_HEADER = '([^']+)';/);
    expect(m?.[1]).toBe(PURCHASER_HEADER);
  });
});
