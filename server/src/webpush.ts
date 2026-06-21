// Web Push sender (Phase 2). Sends a PAYLOADLESS daily push: a VAPID-signed ping with no
// body, so no task content is ever encrypted or transmitted (the message lives in the
// service worker). The only crypto is VAPID JWT signing (ECDSA P-256 / ES256), done with
// Workers' Web Crypto. The b64url helpers + JWT assembly are unit-tested; signing is
// verified by a sign-then-verify roundtrip.

export type VapidJwk = { kty: string; crv: string; x: string; y: string; d: string };

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}

/** The url-base64 uncompressed public point (the VAPID `k` param), derived from the private
 *  JWK's x/y, so only the private key need be configured. */
export function publicKeyB64url(jwk: VapidJwk): string {
  const x = b64urlToBytes(jwk.x);
  const y = b64urlToBytes(jwk.y);
  const pub = new Uint8Array(65);
  pub[0] = 0x04;
  pub.set(x, 1);
  pub.set(y, 33);
  return bytesToB64url(pub);
}

/** The JWT `header.payload` signing input for a VAPID token (ES256). */
export function vapidSigningInput(aud: string, sub: string, expSeconds: number): string {
  const header = strToB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = strToB64url(JSON.stringify({ aud, exp: expSeconds, sub }));
  return `${header}.${payload}`;
}

/** Sign a VAPID JWT (ES256) with the private JWK. The signature is raw r||s (what JWS
 *  wants), so no DER conversion is needed. */
export async function signVapidJwt(jwk: VapidJwk, aud: string, sub: string, expSeconds: number): Promise<string> {
  const input = vapidSigningInput(aud, sub, expSeconds);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${bytesToB64url(new Uint8Array(sig))}`;
}

/** Send one payloadless web push. Returns the HTTP status (the cron prunes 404/410). Best
 *  effort: a network error resolves to 0. */
export async function sendPush(jwk: VapidJwk, subject: string, endpoint: string, nowSeconds: number): Promise<number> {
  try {
    const aud = new URL(endpoint).origin;
    const jwt = await signVapidJwt(jwk, aud, subject, nowSeconds + 12 * 3600);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${publicKeyB64url(jwk)}`,
        TTL: '86400',
      },
    });
    return res.status;
  } catch {
    return 0;
  }
}
