// Gate for the localised Play store listings.
//
// Reads docs/play-store-listings-localised.md, which is the paste source for the de / es / fr / it
// listings, and checks the three things that are invisible while editing and expensive after:
//
//   1. LENGTH. Play's caps are hard: 80 characters for the short description, 4000 for the full one.
//      The form refuses anything over, and the count is CHARACTERS, so it is measured here rather
//      than estimated. The header on each block must also agree with the real count, or the doc
//      starts lying about itself.
//
//   2. DIACRITICS. Every non-English release note in this repo was silently ascii-fied once
//      ("Muelltonne", "manana", "partagee", "puo"), almost certainly by a Git Bash heredoc on a
//      non-UTF-8 codepage, and came one paste from the Console. A native reader sees broken
//      software, not economy. So: the accented characters must be PRESENT, and the known
//      ascii-fied spellings must be ABSENT.
//
//   3. THE PROTECTED CLAIMS. A trim that quietly drops the Stripe-not-Google-Play line, a price, or
//      the privacy URL turns a copy edit into a policy problem. Each must still be findable.
//
// Run it after ANY edit to that doc, and before pasting anything into the Play Console:
//   node scripts/check-listings.mjs
//
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DOC = path.join(process.cwd(), 'docs', 'play-store-listings-localised.md');

const LOCALES = {
  'de-DE': {
    name: 'German',
    marks: /[äöüßÄÖÜ]/,
    // Native German legitimately contains these letter pairs (aktuell, neue, Dauer), so this
    // matches whole known-bad WORDS, never the bare pairs. A blind find-and-replace is the wrong fix.
    ascii: /\b(zaehlt|Muelltonne|fuer|laesst|aendern|Groesse|ueber|fuenf|Ueber)\b/,
    forever: /für immer/i,
  },
  'es-ES': {
    name: 'Spanish',
    marks: /[áéíóúñÁÉÍÓÚÑ]/,
    ascii: /\b(manana|dia|demas|asi|quien|que hacer|album)\b/,
    forever: /para siempre/i,
  },
  'fr-FR': {
    name: 'French',
    marks: /[éèêàçôûùîâÉÈÀÇŒœ]/,
    ascii: /\b(partagee|etre|change|retire|apres|donnees|creer)\b|jour-la\b/,
    forever: /pour toujours/i,
  },
  'it-IT': {
    name: 'Italian',
    marks: /[àèéìòù]/,
    ascii: /\b(puo|martedi|cio|piu|gia|perche|attivita)\b/i,
    forever: /per sempre/i,
  },
};

// Claims that are legal, policy or promise-critical. Losing one to a trim is not a style regression.
const PROTECTED = [
  ['the privacy URL', /doubledone\.app\/privacy/],
  ['Stripe named as the biller', /Stripe/i],
  ['the not-via-Google-Play line', /Google Play/],
  ['the monthly price', /A\$\s?5\b|5\s?\$A/],
  ['the annual price', /A\$\s?50\b|50\s?\$A/],
  ['the six-character code', /sechs|seis|six|sei\b/i],
];

const CAPS = { short: 80, full: 4000 };

function blocks(md) {
  // Each locale section is "## <Name> (`xx-XX`)" followed by a short block then a full block, each
  // introduced by a "**... description** (N / CAP)" header and a fenced code block.
  const found = {};
  const re = /\*\*(Short|Full) description\*\*\s*\((\d+)\s*\/\s*(\d+)\)\s*\n+```\n([\s\S]*?)\n```/g;
  const secRe = /^##\s+(.+?)\s+\(`([a-z]{2}-[A-Z]{2})`\)\s*$/gm;

  const sections = [];
  let m;
  while ((m = secRe.exec(md)) !== null) sections.push({ code: m[2], start: m.index });
  for (let i = 0; i < sections.length; i += 1) {
    const end = i + 1 < sections.length ? sections[i + 1].start : md.length;
    const body = md.slice(sections[i].start, end);
    const fields = {};
    re.lastIndex = 0;
    let f;
    while ((f = re.exec(body)) !== null) {
      fields[f[1].toLowerCase()] = { claimed: Number(f[2]), cap: Number(f[3]), text: f[4] };
    }
    found[sections[i].code] = fields;
  }
  return found;
}

let failures = 0;
const fail = (loc, msg) => { failures += 1; console.error(`  ✗ ${loc}: ${msg}`); };

let md;
try {
  md = readFileSync(DOC, 'utf8');
} catch {
  console.error(`✗ cannot read ${path.relative(process.cwd(), DOC)}. Run from the repo root.`);
  process.exit(1);
}

const parsed = blocks(md);
console.log(`checking ${path.relative(process.cwd(), DOC)}\n`);

for (const [code, rules] of Object.entries(LOCALES)) {
  const got = parsed[code];
  if (!got || !got.short || !got.full) {
    fail(code, `section missing, or it has no short/full block (found: ${Object.keys(got ?? {}).join(', ') || 'nothing'})`);
    continue;
  }

  for (const kind of ['short', 'full']) {
    const { claimed, cap, text } = got[kind];
    const real = [...text].length;
    if (real > CAPS[kind]) fail(code, `${kind} description is ${real} characters, over Play's cap of ${CAPS[kind]}. The form will refuse it.`);
    if (cap !== CAPS[kind]) fail(code, `${kind} header states a cap of ${cap}; Play's cap is ${CAPS[kind]}.`);
    if (claimed !== real) fail(code, `${kind} header claims ${claimed} characters but the block measures ${real}. Re-count before pasting.`);
  }

  const full = got.full.text;
  if (!rules.marks.test(full)) fail(code, `${rules.name} full description contains no accented characters at all. It has been ascii-fied.`);
  const bad = full.match(rules.ascii);
  if (bad) fail(code, `found ascii-fied ${rules.name}: "${bad[0]}". Write the accented form.`);
  if (full.includes('—')) fail(code, 'em-dash in the full description.');
  if (full.includes('!')) fail(code, 'exclamation mark in the full description.');
  if (!rules.forever.test(full)) fail(code, 'the free-forever promise is missing.');
  for (const [name, re] of PROTECTED) if (!re.test(full)) fail(code, `${name} is missing from the full description.`);

  if (failures === 0 || !Object.keys(parsed).length) { /* keep going */ }
  console.log(`  ${code}  short ${String([...got.short.text].length).padStart(2)}/80   full ${String([...got.full.text].length).padStart(4)}/4000   ${rules.name}`);
}

console.log('');
if (failures) {
  console.error(`✗ ${failures} problem${failures === 1 ? '' : 's'}. Do not paste into the Play Console until these are fixed.`);
  process.exit(1);
}
console.log('✓ all four localised listings are inside their caps, keep their diacritics, and carry every protected claim.');
