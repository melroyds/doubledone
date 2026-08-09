// Stamp the WEB version into the exported client/dist/version.json.
//
// WHY THIS EXISTS: the app asks doubledone.app/version.json whether a newer DoubleDone exists, so
// that two people on a shared list are not stuck on builds that read each other's rhythms
// differently. The web half of that answer must never be hand-maintained: the web deploys the
// moment main is pushed, so a number somebody has to remember to bump would sit stale, and a stale
// LATEST would tell every web user forever that a newer version is ready while reloading changes
// nothing. Stamped from app.json at build, it IS the deployed version and cannot be wrong.
//
// The store numbers are deliberately NOT touched here. iOS and Android lag behind review and
// staged rollout, so auto-stamping them would point somebody at a store page showing the version
// they already have. Those two are bumped by hand in client/public/version.json when a release
// actually goes live, which is a moment Melroy is already in those dashboards.
//
// Runs in deploy-web.yml before the Pages deploy, and in ci.yml so a broken stamp fails the build
// rather than the deploy. Idempotent.
//
//   node scripts/stamp-version.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = join(ROOT, 'client', 'app.json');
const OUT = join(ROOT, 'client', 'dist', 'version.json');

const version = JSON.parse(readFileSync(APP_JSON, 'utf8'))?.expo?.version;
if (typeof version !== 'string' || !version) {
  throw new Error('stamp-version: no expo.version in client/app.json');
}

// The exported copy of client/public/version.json, which carries the hand-maintained store numbers.
const current = JSON.parse(readFileSync(OUT, 'utf8'));
const next = { ...current, web: version };

writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`);
console.log(`stamped web=${version} (ios=${next.ios}, android=${next.android}) into dist/version.json`);
