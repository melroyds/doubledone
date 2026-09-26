// Gate for the Google Play store listing paste sources.
//
// Reads every Play listing paste source in the repo:
//   docs/play-store-listings-localised.md   de / es / fr / it, plus the English short-description reference
//   docs/play-store-submission-pack.md      the English (en-AU) short and full description
//   docs/play-store-release.md              the section 4 draft, kept for the record but still pasteable
// and checks the four things that are invisible while editing and expensive after:
//
//   1. LENGTH. Play's caps are hard: 80 characters for the short description, 4000 for the full one.
//      The form refuses anything over, and the count is CHARACTERS, so it is measured here rather
//      than estimated. Where a doc records a count, it must also agree with the real count, or the
//      doc starts lying about itself.
//
//   2. DIACRITICS. Every non-English release note in this repo was silently ascii-fied once
//      ("Muelltonne", "manana", "partagee", "puo"), almost certainly by a Git Bash heredoc on a
//      non-UTF-8 codepage, and came one paste from the Console. A native reader sees broken
//      software, not economy. So: the accented characters must be PRESENT, and the known
//      ascii-fied spellings must be ABSENT.
//
//   3. THE PROTECTED CLAIMS. A trim that quietly drops the privacy URL, the six-character code or the
//      free-forever promise turns a copy edit into a policy or promise problem. Each must still be
//      findable in every full description.
//
//   4. NOTHING THAT SELLS (Path C, 2026-09-27). The Android app sells nothing. Play rejected 1.5.1 for
//      showing an A$ price, and the Payments policy (section 4) names the store listing itself as a
//      place an app must not lead users to another payment method. So no listing may carry a currency
//      amount, a price per month or year, "Stripe", "web checkout", a "not Google Play" line, a call to
//      buy or subscribe on the website, a Premium section, or a doubledone.app link other than the
//      privacy policy. This check used to REQUIRE the price and the Stripe line. It now fails on them.
//      The why is in docs/play-store-release.md 5d.
//
// Run it after ANY edit to those docs, and before pasting anything into the Play Console:
//   node scripts/check-listings.mjs
//
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOCS = {
  localised: path.join(ROOT, 'docs', 'play-store-listings-localised.md'),
  pack: path.join(ROOT, 'docs', 'play-store-submission-pack.md'),
  release: path.join(ROOT, 'docs', 'play-store-release.md'),
};

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
  ['the six-character code', /sechs|seis|six|sei\b/i],
];

// What a Play listing must never say while the Android app sells nothing (Path C). Each is written to
// catch the lines that were really there (A$5, 5 $A, "a month", "im Monat", "al mes", "par mois",
// "all'anno", "Stripe im Web", "pas par Google Play") and their obvious rewordings, in all five languages.
const PERIOD = String.raw`(?:month|year|mo|yr|monat|jahr|mes|año|ano|mois|an|mese|anno)`;
const PER = String.raw`(?:\/|per|a|an|al|im|pro|par|all'|each|every)`;
const CTA = [
  // en: buy / subscribe ... website, and website ... buy / subscribe
  String.raw`\b(?:buy|subscribe|upgrade|purchase|pay)\w*\b[^.\n]{0,40}\b(?:website|site|web|online)\b`,
  String.raw`\b(?:website|site)\b[^.\n]{0,40}\b(?:buy|subscribe|upgrade|purchase)`,
  // de
  String.raw`\b(?:kauf|abonnier|abschlie|bezahl|buch)\w*[^.\n]{0,40}\b(?:website|webseite|web|online)\b`,
  // es
  String.raw`\b(?:compr|suscr|pag|hazte)\w*[^.\n]{0,40}\b(?:web|sitio|página|en línea)`,
  // fr
  String.raw`\b(?:achet|abonne|souscri|paie|paye|payer)\w*[^.\n]{0,40}\b(?:site|web|en ligne)\b`,
  // it
  String.raw`\b(?:acquist|abbona|compra|paga)\w*[^.\n]{0,40}\b(?:sito|web|online)\b`,
].join('|');
const FORBIDDEN = [
  ['a currency amount', /A\$\s?\d|\d\s?\$\s?A\b|\$\s?\d|\d\s?\$|€\s?\d|\d\s?€|£\s?\d|\b(?:AUD|USD|EUR|GBP)\s?\d|\d\s?(?:AUD|USD|EUR|GBP)\b/i],
  ['a price per month or year', new RegExp(String.raw`\d[\d.,]*\s*(?:${PER}\s*)?${PERIOD}\b`, 'i')],
  ['"Stripe"', /stripe/i],
  ['"web checkout"', /web[\s-]?checkout/i],
  ['a "not Google Play" line', /\b(?:not|nicht|no|pas|non)\b[^.\n]{0,25}Google\s?Play/i],
  ['a call to buy or subscribe on the website', new RegExp(CTA, 'i')],
  ['a Premium section or a paid-only feature', /premium/i],
  ['a doubledone.app link other than the privacy policy', /doubledone\.app(?!\/privacy)/i],
];

const CAPS = { short: 80, full: 4000 };

let failures = 0;
const fail = (loc, msg) => { failures += 1; console.error(`  ✗ ${loc}: ${msg}`); };

function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    console.error(`✗ cannot read ${path.relative(ROOT, file)}. Run from the repo root.`);
    process.exit(1);
  }
}

// "**Short description** (N / 80)" or "**Full description** (N / 4000)", then a fenced block.
const FIELD_RE = /\*\*(Short|Full) description\*\*\s*\((\d+)\s*\/\s*(\d+)\)\s*\n+```\n([\s\S]*?)\n```/g;

function fields(body) {
  const out = {};
  FIELD_RE.lastIndex = 0;
  let f;
  while ((f = FIELD_RE.exec(body)) !== null) {
    out[f[1].toLowerCase()] = { claimed: Number(f[2]), cap: Number(f[3]), text: f[4] };
  }
  return out;
}

function localisedBlocks(md) {
  // Each locale section is "## <Name> (`xx-XX`)" followed by a short block then a full block.
  const found = {};
  const secRe = /^##\s+(.+?)\s+\(`([a-z]{2}-[A-Z]{2})`\)\s*$/gm;
  const sections = [];
  let m;
  while ((m = secRe.exec(md)) !== null) sections.push({ code: m[2], start: m.index });
  for (let i = 0; i < sections.length; i += 1) {
    const end = i + 1 < sections.length ? sections[i + 1].start : md.length;
    found[sections[i].code] = fields(md.slice(sections[i].start, end));
  }
  return found;
}

function checkLength(loc, kind, { claimed, cap, text }) {
  const real = [...text].length;
  if (real > CAPS[kind]) fail(loc, `${kind} description is ${real} characters, over Play's cap of ${CAPS[kind]}. The form will refuse it.`);
  if (cap !== CAPS[kind]) fail(loc, `${kind} header states a cap of ${cap}; Play's cap is ${CAPS[kind]}.`);
  if (claimed !== real) fail(loc, `${kind} header claims ${claimed} characters but the block measures ${real}. Re-count before pasting.`);
  return real;
}

function checkSells(loc, kind, text) {
  for (const [name, re] of FORBIDDEN) {
    const hit = text.match(re);
    if (hit) fail(loc, `${kind} description contains ${name}: "${hit[0]}". The Android app sells nothing (Path C), and the listing must not point anywhere else to pay. See docs/play-store-release.md 5d.`);
  }
}

const md = read(DOCS.localised);
const pack = read(DOCS.pack);
const release = read(DOCS.release);

console.log('checking the Play listing paste sources\n');

// 1. The localised listings (de / es / fr / it).
console.log(`  ${path.relative(ROOT, DOCS.localised)}`);
const parsed = localisedBlocks(md);
for (const [code, rules] of Object.entries(LOCALES)) {
  const got = parsed[code];
  if (!got || !got.short || !got.full) {
    fail(code, `section missing, or it has no short/full block (found: ${Object.keys(got ?? {}).join(', ') || 'nothing'})`);
    continue;
  }

  for (const kind of ['short', 'full']) {
    checkLength(code, kind, got[kind]);
    checkSells(code, kind, got[kind].text);
  }

  const full = got.full.text;
  if (!rules.marks.test(full)) fail(code, `${rules.name} full description contains no accented characters at all. It has been ascii-fied.`);
  const bad = full.match(rules.ascii);
  if (bad) fail(code, `found ascii-fied ${rules.name}: "${bad[0]}". Write the accented form.`);
  if (full.includes('—')) fail(code, 'em-dash in the full description.');
  if (full.includes('!')) fail(code, 'exclamation mark in the full description.');
  if (!rules.forever.test(full)) fail(code, 'the free-forever promise is missing.');
  for (const [name, re] of PROTECTED) if (!re.test(full)) fail(code, `${name} is missing from the full description.`);

  console.log(`    ${code}  short ${String([...got.short.text].length).padStart(2)}/80   full ${String([...full].length).padStart(4)}/4000   ${rules.name}`);
}

// The English short-description reference in the same doc.
{
  const start = md.indexOf('## English, for reference');
  const end = start < 0 ? -1 : md.indexOf('\n---', start);
  const got = start < 0 ? {} : fields(md.slice(start, end < 0 ? md.length : end));
  if (!got.short) {
    fail('en (reference)', 'the English short-description reference block is missing or malformed.');
  } else {
    const real = checkLength('en (reference)', 'short', got.short);
    checkSells('en (reference)', 'short', got.short.text);
    console.log(`    en ref short ${String(real).padStart(2)}/80`);
  }
}

// 2. The English (en-AU) listing in the submission pack.
console.log(`\n  ${path.relative(ROOT, DOCS.pack)}`);
{
  const loc = 'en-AU';
  const short = pack.match(/\*\*Short description\*\*\s*\(<=80\):\s*`([^`\n]+)`/);
  if (!short) {
    fail(loc, 'short description not found (expected "**Short description** (<=80): `...`").');
  } else {
    const real = [...short[1]].length;
    if (real > CAPS.short) fail(loc, `short description is ${real} characters, over Play's cap of ${CAPS.short}.`);
    checkSells(loc, 'short', short[1]);
  }

  const at = pack.indexOf('**Full description** (<=4000)');
  const open = at < 0 ? -1 : pack.indexOf('```\n', at);
  const close = open < 0 ? -1 : pack.indexOf('\n```', open + 4);
  if (close < 0) {
    fail(loc, 'full description block not found (expected "**Full description** (<=4000)" then a fenced block).');
  } else {
    const full = pack.slice(open + 4, close);
    const real = [...full].length;
    if (real > CAPS.full) fail(loc, `full description is ${real} characters, over Play's cap of ${CAPS.full}. The form will refuse it.`);
    const stated = pack.slice(at, open).match(/([\d,]+) characters of 4,000/);
    if (!stated) fail(loc, 'the full description has no recorded "N characters of 4,000." line.');
    else if (Number(stated[1].replace(/,/g, '')) !== real) fail(loc, `the doc records ${stated[1]} characters but the block measures ${real}. Re-count before pasting.`);
    if (full.includes('—')) fail(loc, 'em-dash in the full description.');
    if (!/free forever/i.test(full)) fail(loc, 'the free-forever promise is missing.');
    for (const [name, re] of PROTECTED) if (!re.test(full)) fail(loc, `${name} is missing from the full description.`);
    checkSells(loc, 'full', full);
    console.log(`    ${loc}  short ${String(short ? [...short[1]].length : 0).padStart(2)}/80   full ${String(real).padStart(4)}/4000   English`);
  }
}

// 3. The section 4 draft in the release guide. Kept for the record, but a draft on disk is one paste
//    from the Console, so it is held to the same no-selling rule.
console.log(`\n  ${path.relative(ROOT, DOCS.release)}`);
{
  const loc = 'release-guide draft';
  const start = release.indexOf('## 4. Store listing');
  const end = start < 0 ? -1 : release.indexOf('\n## 5.', start);
  if (start < 0 || end < 0) {
    fail(loc, 'section 4 ("## 4. Store listing") not found, so the gate cannot vouch for it.');
  } else {
    const sec = release.slice(start, end);
    const short = sec.match(/\*\*Short description\*\*[^`\n]*`([^`\n]+)`/);
    if (short) checkSells(loc, 'short', short[1]);
    const open = sec.indexOf('```\n');
    const close = open < 0 ? -1 : sec.indexOf('\n```', open + 4);
    if (close < 0) fail(loc, 'the section 4 full-description draft block is missing.');
    else checkSells(loc, 'full', sec.slice(open + 4, close));
    console.log('    section 4 draft checked for selling');
  }
}

console.log('');
if (failures) {
  console.error(`✗ ${failures} problem${failures === 1 ? '' : 's'}. Do not paste into the Play Console until these are fixed.`);
  process.exit(1);
}
console.log('✓ every Play listing paste source is inside its caps, keeps its diacritics, carries every protected claim, and sells nothing.');
