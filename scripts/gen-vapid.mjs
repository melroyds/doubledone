// Generate a VAPID keypair for DoubleDone web push (Phase 2). Run once:
//   node scripts/gen-vapid.mjs
// Then:
//   - EXPO_PUBLIC_VAPID_KEY  -> client .env + the Cloudflare Pages project env (public, safe)
//   - VAPID_PRIVATE_KEY      -> Worker secret:  npx wrangler secret put VAPID_PRIVATE_KEY --name doubledone-ai
//   - VAPID_SUBJECT          -> Worker secret:  npx wrangler secret put VAPID_SUBJECT --name doubledone-ai  (e.g. mailto:you@example.com)
// The private key is the EC private JWK (it carries x/y/d); the Worker derives the public
// key from it. Keep the private JWK out of git; it is a secret.
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privJwk = await subtle.exportKey('jwk', pair.privateKey);
const pubRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey)); // 65-byte uncompressed point
const b64url = (buf) => Buffer.from(buf).toString('base64url');

console.log('VAPID keypair generated.\n');
console.log('EXPO_PUBLIC_VAPID_KEY  (public, client .env + Pages env):');
console.log(b64url(pubRaw));
console.log('\nVAPID_PRIVATE_KEY  (Worker secret, the private JWK on one line):');
console.log(JSON.stringify(privJwk));
console.log('\nThen set the Worker secrets:');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY --name doubledone-ai');
console.log('  npx wrangler secret put VAPID_SUBJECT --name doubledone-ai   # e.g. mailto:you@example.com');
