import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Purchases from 'react-native-purchases';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable import/no-duplicates -- ESLint's resolver reads the base and its platform files as one module */
import { PURCHASER_HEADER } from './ai';
import { ANON_PURCHASER_RE } from './iap';
import * as web from './purchases';
import * as android from './purchases.android';
import * as ios from './purchases.ios';
/* eslint-enable import/no-duplicates */

// Premium without an account (2026-11-03): the proof each platform hands lib/ai, the identity the root layout
// reconciles behind, and the two constants the phone and the Worker must agree on. The platform files are glue
// around the RevenueCat native module, which cannot run in node, so the SDK is a stub here that answers what a phone
// would (vi.mock is hoisted above the imports). Only the configure wait, the identity and the proof are tested
// through it: the rest of those files stays the untested glue their headers describe.
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
    logIn: vi.fn(async (id: string) => {
      if (sdk.throws) throw new Error('the store is not answering');
      sdk.appUserId = id;
      return { customerInfo: {}, created: false };
    }),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', WARN: 'WARN' },
}));
vi.mock('react-native', () => ({ Linking: { openURL: vi.fn() } }));
vi.mock('./supabase', () => ({ authHeader: vi.fn(), sessionUserId: vi.fn(), supabase: null, isSyncConfigured: false }));

const ANON = '$RCAnonymousID:0123456789abcdef0123456789abcdef';
const UID = '11111111-2222-3333-4444-555555555555';
const rc = vi.mocked(Purchases);

// Each platform file configures once and remembers the attempt, so its key (and __DEV__, which configure reads)
// must be in place before its first call.
beforeAll(() => {
  vi.stubGlobal('__DEV__', false);
  process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_test';
  process.env.EXPO_PUBLIC_RC_ANDROID_KEY = 'goog_test';
});
afterAll(() => {
  delete process.env.EXPO_PUBLIC_RC_IOS_KEY;
  delete process.env.EXPO_PUBLIC_RC_ANDROID_KEY;
  vi.unstubAllGlobals();
});
beforeEach(() => {
  sdk.appUserId = ANON;
  sdk.throws = false;
  rc.logIn.mockClear();
});

describe('purchaserProof, per platform', () => {
  it('the web never has one: it sells through Stripe, to accounts only', async () => {
    expect(await web.purchaserProof()).toBeNull();
  });

  it('Android never has one: it sells only to accounts, so a signed-out id never holds a purchase', async () => {
    expect(await android.purchaserProof()).toBeNull();
  });
});

describe('the iPhone waits for its store, then links and proves', () => {
  it('a call made while configure is still running waits for it, rather than skipping the logIn', async () => {
    let finishConfigure: () => void = () => {};
    rc.setLogLevel.mockImplementationOnce(() => new Promise<void>((done) => (finishConfigure = done)));
    const linked = ios.identifyPurchaser(UID); // a session found in the first moments of a launch
    let proofAnswered = false;
    const proof = ios.purchaserProof().then(() => (proofAnswered = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(rc.configure).not.toHaveBeenCalled();
    expect(rc.logIn).not.toHaveBeenCalled(); // it used to return here, silently, with no logIn at all
    expect(proofAnswered).toBe(false); // and the proof waits too, rather than answering "none"
    finishConfigure();
    expect(await linked).toBe(true);
    expect(rc.logIn).toHaveBeenCalledWith(UID);
    await proof;
    await ios.configurePurchases();
    expect(rc.configure).toHaveBeenCalledTimes(1); // one configure, however many callers waited on it
  });

  it("says whether RevenueCat's customer is the account, so the root layout reconciles only then", async () => {
    sdk.appUserId = UID;
    expect(await ios.identifyPurchaser(UID)).toBe(true);
    expect(rc.logIn).not.toHaveBeenCalled(); // already linked: no logIn
    sdk.appUserId = ANON;
    sdk.throws = true;
    expect(await ios.identifyPurchaser(UID)).toBe(false); // a failed logIn is no link, never a throw
    sdk.throws = false;
    rc.logIn.mockImplementationOnce(async () => ({ customerInfo: {}, created: false }) as never); // answered, linked nothing
    expect(await ios.identifyPurchaser(UID)).toBe(false);
  });

  it("proves with the anonymous id only, and never an account's", async () => {
    expect(await ios.purchaserProof()).toBe(ANON); // signed out: the id RevenueCat gave this install
    sdk.appUserId = UID;
    expect(await ios.purchaserProof()).toBeNull(); // signed in: the id is the Supabase uuid, never sent as a proof
    sdk.appUserId = `${ANON}x`;
    expect(await ios.purchaserProof()).toBeNull(); // anything not exactly the anonymous form
    sdk.throws = true;
    expect(await ios.purchaserProof()).toBeNull(); // and a store error is no proof, never a throw
  });
});

describe('the other platforms say whether the account is linked too', () => {
  it('Android: true once linked, false when the logIn fails', async () => {
    expect(await android.identifyPurchaser(UID)).toBe(true);
    sdk.appUserId = ANON;
    sdk.throws = true;
    expect(await android.identifyPurchaser(UID)).toBe(false);
  });

  it('the web: never, there is no store to link', async () => {
    expect(await web.identifyPurchaser(UID)).toBe(false);
  });
});

// The two screens that reconcile are not rendered by the harness, so their rules are held in their source (the
// settings.test.ts precedent): the reconcile runs behind a logIn that linked the account, and after a Restore while
// signed in, so a restored purchase reaches the four server features without a relaunch.
describe('the root layout and the paywall reconcile only when it can attach', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

  it('the root layout reconciles only behind a logIn that linked the account', () => {
    const src = read('app', '_layout.tsx');
    expect(src).toContain('void identifyPurchaser(id).then((linked) => {');
    expect(src).toContain('if (IAP_AVAILABLE && linked) void reconcileApple();');
  });

  it('a Restore while signed in reconciles, then re-reads', () => {
    const src = read('app', 'premium.tsx');
    expect(src).toContain('if (uid) void reconcileApple().then(() => refresh());');
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
