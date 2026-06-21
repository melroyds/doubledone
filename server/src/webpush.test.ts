import { describe, expect, it } from 'vitest';

import { b64urlToBytes, bytesToB64url, publicKeyB64url, signVapidJwt, type VapidJwk, vapidSigningInput } from './webpush';

describe('b64url', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(Array.from(b64urlToBytes(bytesToB64url(bytes)))).toEqual(Array.from(bytes));
  });

  it('produces url-safe output (no +, /, =)', () => {
    const s = bytesToB64url(new Uint8Array([251, 255, 191, 254]));
    expect(s).not.toMatch(/[+/=]/);
  });
});

describe('vapidSigningInput', () => {
  it('encodes a JWT header + payload that decode back', () => {
    const input = vapidSigningInput('https://push.example', 'mailto:a@b.c', 123);
    const [h, p] = input.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))).toEqual({ aud: 'https://push.example', exp: 123, sub: 'mailto:a@b.c' });
  });
});

describe('signing', () => {
  it('derives the 65-byte uncompressed public point from the JWK', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as VapidJwk;
    const point = b64urlToBytes(publicKeyB64url(jwk));
    expect(point.length).toBe(65);
    expect(point[0]).toBe(0x04);
  });

  it('signs a VAPID JWT that verifies against the public key', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as VapidJwk;
    const jwt = await signVapidJwt(jwk, 'https://push.example', 'mailto:a@b.c', 9_999_999_999);
    const [h, p, s] = jwt.split('.');
    const input = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlToBytes(s), input);
    expect(ok).toBe(true);
  });
});
