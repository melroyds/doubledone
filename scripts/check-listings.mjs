// Gate for the store listing paste sources, Google Play and the App Store.
//
//   node scripts/check-listings.mjs              both stores
//   node scripts/check-listings.mjs --play       Google Play only
//   node scripts/check-listings.mjs --appstore   the App Store only
//
// CI runs both modes on every push and pull request (.github/workflows/ci.yml, the listings job).
// Run it after ANY edit to these docs, and before pasting anything into either console. Then print each field
// from the gated file and diff what was sent (a hand-retyped Italian listing once went live with a typo).
// After any change to THIS file, run its break test too, `python scripts/check-listings-break.py`, which breaks
// each rule once in a temporary copy and fails unless the gate fails for that reason. Three rules here passed
// everything until the 2026-10-19 build review proved it by hand; the break test keeps that proof.
//
// The paste sources, and nothing else (the retired Play docs carry a "do not paste" banner and are not read):
//   docs/play-store-submission-pack.md      Play English (en-AU): title, short and full description
//   docs/play-store-listings-localised.md   Play de / es (es-ES and es-419) / fr / it
//   docs/appstore/listing-copy.md           App Store English: name, subtitle, keywords, promo, description,
//                                           and the second English keyword set (en-GB or en-AU)
//   docs/appstore/listing-localised.md      App Store de / es (es-MX and es-ES) / fr / it
//
// What it checks, and why each is here:
//
//   1. LENGTH. Every cap is hard and counted in CHARACTERS, so it is measured here, never estimated. Play: title
//      30, short 80, full 4000. App Store: name 30, subtitle 30, keywords 100, promotional text 170, description
//      4000, and the keyword field is also held to 100 UTF-8 bytes, the stricter reading, so an accented letter
//      can never tip it over. Where a doc records a count it must agree with the real count.
//
//   2. DIACRITICS AND TYPOGRAPHY. Every non-English release note in this repo was once silently ascii-fied
//      ("Muelltonne", "manana", "partagee", "puo"), almost certainly by a Git Bash heredoc on a non-UTF-8
//      codepage. So the accented characters must be present and the known ascii-fied spellings absent. French
//      takes U+00A0 before : ; ? ! and inside guillemets, never a plain space. Spanish is neutral: no vosotros,
//      no ustedes, because one text serves Spain and Latin America on both stores.
//
//   3. THE PROTECTED CLAIMS. A trim that drops the privacy URL, the Terms URL (the App Store's EULA link), the
//      medical lines, the six-character code or the free-forever promise turns a copy edit into a policy or
//      promise problem. Each must still be findable, on both stores, by its own phrase in its own language: all
//      three medical sentences (not a medical device, does not diagnose or treat, talk to a professional) and the
//      code as a phrase ("six-character code"), never a bare number, which the Premium line's "six more colour
//      themes" would satisfy on its own (the 2026-10-19 build review).
//
//   4. NOTHING THAT SELLS ANYWHERE BUT THE STORE ITSELF. Play rejected 1.5.1 for an A$ price, and its Payments
//      policy names the listing as a place an app must not lead users to another payment method. Since Path A
//      (2026-10) a Play listing may name Premium, never a price, Stripe, a "not Google Play" line, a call to buy
//      on the website, or trial wording (Google gives "Try Premium free" as its own example). The App Store page
//      showed "A$5.00" on the US store for two months beside US$3.00, so it may never carry a figure either:
//      Apple shows each country's own price.
//
//   5. TRUE ON THE PLATFORM THAT STORE SERVES. The App Store listing never names Android, Google, the widget
//      (Android only), Speak (the web only: speech.ts is a stub on phones), the web or a browser, or Stripe.
//
//   6. THE CLAIMS THE CODE PROVED FALSE, banned by name so they cannot drift back: "heavier" (your person can
//      give a shared row today's date), "colleagues" (friends, Melroy 2026-10-18), the "nothing leaves your
//      device" family in five languages (sync, Ours, a feedback note and the usage counts still run with AI
//      off: the wordings that were really there by name, and their common rewordings by pattern, "nothing ...
//      leaves or is sent" and "never leaves your device or phone" in each language; a pattern is a net, not a
//      proof, so a native read still reads for the idea), "Private by default" (AI starts on), "third-party
//      trackers" (RevenueCat gets an install id on Android), "Export your data" (it exports tasks and what you
//      finished), seven themes as Premium (Dusk is free), a comparison nobody can check, and any accessibility
//      claim, which nothing in the app has earned.
//
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOCS = {
  playEn: path.join(ROOT, 'docs', 'play-store-submission-pack.md'),
  playLocalised: path.join(ROOT, 'docs', 'play-store-listings-localised.md'),
  iosEn: path.join(ROOT, 'docs', 'appstore', 'listing-copy.md'),
  iosLocalised: path.join(ROOT, 'docs', 'appstore', 'listing-localised.md'),
};

const args = new Set(process.argv.slice(2));
for (const a of args) {
  if (a !== '--play' && a !== '--appstore') {
    console.error(`✗ unknown option ${a}. Use --play, --appstore, or nothing for both.`);
    process.exit(2);
  }
}
const RUN_PLAY = args.size === 0 || args.has('--play');
const RUN_IOS = args.size === 0 || args.has('--appstore');

// ---------------------------------------------------------------------------------------------------------------
// Language rules
// ---------------------------------------------------------------------------------------------------------------
const LANG = {
  en: {
    name: 'English',
    forever: /free,? forever|free for good/i,
    code: /six-character code/,
    medical: [
      /DoubleDone is not a medical device\./,
      /It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for professional care\./,
      /For medical advice, talk to a health professional\./,
    ],
  },
  de: {
    name: 'German',
    marks: /[äöüßÄÖÜ]/,
    // Native German legitimately contains these letter pairs (aktuell, neue, Dauer), so this matches whole
    // known-bad WORDS, never the bare pairs. A blind find-and-replace is the wrong fix.
    ascii: /\b(zaehlt|Muelltonne|fuer|laesst|aendern|Groesse|ueber|fuenf|Ueber)\b/,
    forever: /für immer/i,
    code: /Code aus sechs Zeichen/,
    medical: [
      /DoubleDone ist kein Medizinprodukt\./,
      /Die App diagnostiziert, behandelt, heilt oder verhindert keine Erkrankungen und ersetzt keine professionelle Hilfe\./,
      /Für medizinischen Rat wende dich an medizinisches Fachpersonal\./,
    ],
  },
  es: {
    name: 'Spanish',
    marks: /[áéíóúñÁÉÍÓÚÑ]/,
    ascii: /\b(manana|dia|demas|asi|quien|que hacer|album)\b/,
    forever: /para siempre/i,
    code: /código de seis caracteres/,
    medical: [
      /DoubleDone no es un producto sanitario\./,
      /No diagnostica, trata, cura ni previene ninguna afección, y no sustituye la atención de un profesional\./,
      /Si necesitas consejo médico, consulta con un profesional de la salud\./,
    ],
  },
  fr: {
    name: 'French',
    marks: /[éèêàçôûùîâÉÈÀÇŒœ]/,
    ascii: /\b(partagee|etre|change|retire|apres|donnees|creer)\b|jour-la\b/,
    forever: /pour toujours/i,
    code: /code de six caractères/,
    medical: [
      /DoubleDone n'est pas un dispositif médical\./,
      /L'appli ne diagnostique, ne traite, ne guérit ni ne prévient aucun problème de santé, et ne remplace pas le suivi d'un professionnel de santé\./,
      /Pour un avis médical, adresse-toi à un professionnel de santé\./,
    ],
  },
  it: {
    name: 'Italian',
    marks: /[àèéìòù]/,
    ascii: /\b(puo|martedi|cio|piu|gia|perche|attivita)\b/i,
    forever: /per sempre/i,
    code: /codice di sei caratteri/,
    medical: [
      /DoubleDone non è un dispositivo medico\./,
      /Non diagnostica, non tratta, non cura né previene alcuna condizione di salute, e non sostituisce il supporto di un professionista\./,
      /Per un consiglio medico, rivolgiti a un professionista della salute\./,
    ],
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------------------------
const PERIOD = String.raw`(?:month|year|mo|yr|monat|jahr|mes|año|ano|mois|an|mese|anno)`;
const PER = String.raw`(?:\/|per|a|an|al|im|pro|par|all'|each|every)`;
const CURRENCY = [
  ['a currency amount', /A\$\s?\d|\d\s?\$\s?A\b|\$\s?\d|\d\s?\$|€\s?\d|\d\s?€|£\s?\d|\b(?:AUD|USD|EUR|GBP)\s?\d|\d\s?(?:AUD|USD|EUR|GBP)\b/i],
  ['a price per month or year', new RegExp(String.raw`\d[\d.,]*\s*(?:${PER}\s*)?${PERIOD}\b`, 'i')],
];

// Play: nothing that leads to another biller (Path A; Path C before it). Each is written to catch the lines that
// were really there (A$5, 5 $A, "a month", "im Monat", "Stripe im Web", "pas par Google Play") and their obvious
// rewordings, in all five languages.
const CTA = [
  String.raw`\b(?:buy|subscribe|upgrade|purchase|pay)\w*\b[^.\n]{0,40}\b(?:website|site|web|online)\b`,
  String.raw`\b(?:website|site)\b[^.\n]{0,40}\b(?:buy|subscribe|upgrade|purchase)`,
  String.raw`\b(?:kauf|abonnier|abschlie|bezahl|buch)\w*[^.\n]{0,40}\b(?:website|webseite|web|online)\b`,
  String.raw`\b(?:compr|suscr|pag|hazte)\w*[^.\n]{0,40}\b(?:web|sitio|página|en línea)`,
  String.raw`\b(?:achet|abonne|souscri|paie|paye|payer)\w*[^.\n]{0,40}\b(?:site|web|en ligne)\b`,
  String.raw`\b(?:acquist|abbona|compra|paga)\w*[^.\n]{0,40}\b(?:sito|web|online)\b`,
].join('|');
const PLAY_ONLY = [
  ['"Stripe"', /stripe/i],
  ['"web checkout"', /web[\s-]?checkout/i],
  ['a "not Google Play" line', /\b(?:not|nicht|no|pas|non)\b[^.\n]{0,25}Google\s?Play/i],
  ['a call to buy or subscribe on the website', new RegExp(CTA, 'i')],
  ['a doubledone.app link other than the privacy policy', /doubledone\.app(?!\/privacy)/i],
  [
    'trial wording (Google gives "Try Premium free" as its own example of a violation)',
    /free trial|try premium free|free for a month|free month\b|Gratismonat|kostenlos testen|gratis testen|mes gratis|prueba gratis|probar premium gratis|mois gratuit|essai gratuit|essayer premium gratuitement|mese gratuito|prova gratuita|provare premium gratis/i,
  ],
];

// The App Store serves iPhones. Each of these is true somewhere else and false there.
const IOS_ONLY = [
  ['"Android"', /android/i],
  ['"Google"', /google/i],
  ['the widget (Android only)', /widget/i],
  ['spoken capture (Speak is the web only; speech.ts is a stub on phones)', /\bspeak|\bspoken\b|\bvoice\b|dictat|diktier|Sprach(?:eingabe|erkennung)|dictado|reconocimiento de voz|dictée|reconnaissance vocale|dettatura|riconoscimento vocale/i],
  ["Speak's name in another language", /„Sprechen“|\bHablar\b|\bDicter\b|\bParla\b/],
  ['the web or a browser', /\bweb\b|\bbrowser\b|\bwebsite\b|\bwebseite\b|\bsite\b|\bsitio\b|\bsito\b|navigateur|navegador/i],
  ['"Stripe"', /stripe/i],
  ['a doubledone.app link other than /privacy and /terms', /doubledone\.app(?!\/(?:privacy|terms)\b)/i],
];

// Claims the code proved false, and the words the plan rules out. Every language, both stores.
const BANNED = [
  ['"heavier" (your person can give a shared row a date, and it lands on your Today)', /heavier/i],
  ['"colleagues" (friends with ADHD and OCD, Melroy 2026-10-18)', /colleague/i],
  ['"nothing you type leaves" (sync, Ours, a feedback note and the usage counts still run with AI off)', /nothing you type (?:leaves|is sent)/i],
  // The old wordings by name, then their rewordings by pattern: "nothing / no text / none of what you write", up to
  // 40 characters, then "leaves / is sent / goes anywhere"; and "never / not / n't leave your (or the) device or phone".
  [
    '"nothing leaves your device", or a rewording of it',
    /nothing leaves your device|nothing is sent anywhere|entirely on your device|\b(?:nothing|no text|none of (?:it|what you \w+))\b[^.\n]{0,40}\b(?:leaves?|is sent|goes anywhere)\b|(?:\bnever|\bnot|n['’]t) leaves? (?:your|the|this) (?:device|phone|iphone)\b/i,
  ],
  ['"Private by default" (AI starts on; the phrase is kept for the AI-off screen only)', /private by default|Privat von Haus aus|Privado por defecto|Privé par défaut|Privata di default/i],
  // The same family in the four translations: the lines that were really there by name, then each language's own
  // "nothing ... is sent / leaves" and "never leaves your device / phone", the rewordings a native read reaches for.
  [
    'a translated "no text leaves your device" (still false: sync, Ours, a feedback note, the usage counts)',
    new RegExp(
      [
        // German, e.g. "dann wird nichts mehr irgendwohin geschickt" (play-store-listings-localised.md, 2026-08-16)
        String.raw`verlässt (?:kein Text|nichts) (?:mehr )?dein Gerät`,
        String.raw`\bnichts\b[^.\n]{0,40}(?:\bgeschickt|\bgesendet|\bverschickt|übertragen|\bverlässt)`,
        String.raw`\bverlässt\s+(?:nichts|kein\w*)\b[^.\n]{0,30}\b(?:Gerät|Handy|Telefon|iPhone)`,
        // Spanish
        String.raw`ese texto ya no sale|nada sale de tu dispositivo`,
        String.raw`\bnada\b[^.\n]{0,40}\b(?:sale|se envía|se envia|se manda)\b`,
        String.raw`\b(?:no|nunca) salen? de tu (?:dispositivo|teléfono|móvil|celular|iPhone)`,
        // French
        String.raw`rien de ce que tu écris ne (?:part|sort)|plus rien de ce que tu écris`,
        String.raw`\brien\b[^.\n]{0,40}(?:\bne (?:part|sort|quitte)\b|\bn['’]est (?:envoyé|transmis))`,
        String.raw`\bne (?:quitte|sort) (?:jamais |pas )?(?:de )?(?:ton |l['’])(?:appareil|téléphone|iPhone)`,
        // Italian
        String.raw`niente di quello che scrivi esce`,
        String.raw`\b(?:niente|nulla)\b[^.\n]{0,40}\b(?:esce|lascia|viene inviat\w*|viene mandat\w*)\b`,
        String.raw`\bnon (?:esce|lascia) (?:mai )?(?:dal|il) (?:tuo )?(?:dispositivo|telefono|iPhone)`,
      ].join('|'),
      'i',
    ),
  ],
  ['"third-party trackers" (RevenueCat gets an install id on every Android phone)', /third-party trackers|Tracker von Dritten|rastreadores de terceros|traqueur tiers|tracciamento di terze parti/i],
  ['"Export your data" (it exports your tasks and what you finished, not everything)', /export your data|Deine Daten exportieren|Exporta tus datos|Exporte tes données|Esporta i tuoi dati/i],
  ['"unlike every shared list" (a comparison nobody can check)', /unlike every shared list/i],
  ['seven colour themes as Premium (Dusk is free, so Premium adds six)', /seven (?:calm )?colou?r themes|sieben\s+(?:\S+\s+)?Farbthemen|siete\s+temas|sept\s+thèmes|sette\s+temi/i],
  ['an accessibility claim (nothing in the app has earned one)', /\baccessible\b|\bWCAG\b|screen[- ]reader friendly|barrierefrei|\baccesible\b|\baccessibile\b/i],
  ['"Lighten today re-spreads" (it suggests, and nothing moves until you say yes)', /re-spreads/i],
  ['a clinical claim (TGA: what a product is for is judged from its claims)', /\btreatment\b|\btherapy\b|\bsymptoms?\b|ADHD management/i],
];
const BANNED_BY_LANG = {
  de: [['"je nach zu viel" (a native first reads "depending on")', /je nach zu viel/i]],
  es: [
    ['vosotros Spanish (one neutral text serves Spain and Latin America)', /\bvosotr[oa]s\b|\bvuestr[oa]s?\b|\b\p{L}+(?:áis|éis)\b/iu],
    ['ustedes Spanish (neutral tú throughout)', /\bustedes\b/i],
  ],
  it: [['"Nostro" as the shared list\'s name (it is always La nostra lista)', /\bNostro\b/]],
};

// Play's protected claims, on every full description. The six-character code is checked on both stores, by its
// phrase per language, in checkLongCopy (a bare /six|sechs|seis|sei/ always passed once the Premium line named the
// six colour themes).
const PLAY_PROTECTED = [['the privacy URL', /doubledone\.app\/privacy/]];

const CAPS = {
  play: { title: 30, short: 80, full: 4000 },
  ios: { name: 30, subtitle: 30, keywords: 100, promo: 170, desc: 4000 },
};

// ---------------------------------------------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------------------------------------------
let failures = 0;
const fail = (loc, msg) => {
  failures += 1;
  console.error(`  ✗ ${loc}: ${msg}`);
};
const len = (s) => [...s].length;
const pad = (n, w) => String(n).padStart(w);

function read(file) {
  try {
    return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    console.error(`✗ cannot read ${path.relative(ROOT, file)}. Run from the repo root.`);
    process.exit(1);
  }
}

const FIELD_KEYS = {
  Title: 'title',
  'Short description': 'short',
  'Full description': 'full',
  Name: 'name',
  Subtitle: 'subtitle',
  Keywords: 'keywords',
  'Promotional text': 'promo',
  Description: 'desc',
};
// "**Name** (27 / 30)" then a fenced block.
const FIELD_RE = /\*\*(Title|Short description|Full description|Name|Subtitle|Keywords|Promotional text|Description)\*\*\s*\((\d+)\s*\/\s*(\d+)\)\s*\n+```\n([\s\S]*?)\n```/g;

function fields(body) {
  const out = {};
  FIELD_RE.lastIndex = 0;
  let f;
  while ((f = FIELD_RE.exec(body)) !== null) {
    const key = FIELD_KEYS[f[1]];
    if (out[key]) out[`${key}#dup`] = true;
    out[key] = { claimed: Number(f[2]), cap: Number(f[3]), text: f[4] };
  }
  return out;
}

// Sections are headed "## <Name> (`code`)" (or ###). The code's first two letters pick the language rules.
function sections(md) {
  const re = /^#{2,3}\s+(.+?)\s+\(`([^`]+)`\)\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(md)) !== null) marks.push({ title: m[1], code: m[2], start: m.index });
  return marks.map((s, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : md.length;
    return { ...s, lang: s.code.slice(0, 2), fields: fields(md.slice(s.start, end)) };
  });
}

function checkCount(loc, label, { claimed, cap, text }, realCap) {
  const real = len(text);
  if (real > realCap) fail(loc, `${label} is ${real} characters, over the cap of ${realCap}. The form will refuse it.`);
  if (cap !== realCap) fail(loc, `${label} header states a cap of ${cap}; the real cap is ${realCap}.`);
  if (claimed !== real) fail(loc, `${label} header claims ${claimed} characters but the block measures ${real}. Re-count before pasting.`);
  return real;
}

function checkRules(loc, label, text, rules) {
  for (const [name, re] of rules) {
    const hit = text.match(re);
    if (hit) fail(loc, `${label} contains ${name}: "${hit[0]}".`);
  }
}

function checkLanguage(loc, label, text, lang, { long }) {
  const rules = LANG[lang];
  checkRules(loc, label, text, BANNED);
  checkRules(loc, label, text, BANNED_BY_LANG[lang] ?? []);
  checkRules(loc, label, text, CURRENCY);
  if (text.includes('\u2014')) fail(loc, `${label} has an em-dash.`);
  if (text.includes('!')) fail(loc, `${label} has an exclamation mark.`);
  if (lang === 'fr') {
    const plain = text.match(/ [:;?!»]|« /);
    if (plain) fail(loc, `${label} has a plain space where French needs U+00A0: "${plain[0]}".`);
  }
  if (long && rules.marks) {
    if (!rules.marks.test(text)) fail(loc, `${rules.name} ${label} contains no accented characters at all. It has been ascii-fied.`);
    const bad = text.match(rules.ascii);
    if (bad) fail(loc, `found ascii-fied ${rules.name} in ${label}: "${bad[0]}". Write the accented form.`);
  }
}

function checkLongCopy(loc, label, text, lang) {
  const rules = LANG[lang];
  if (!rules.forever.test(text)) fail(loc, `${label}: the free-forever promise is missing.`);
  if (!rules.code.test(text)) fail(loc, `${label}: the six-character code is missing or reworded (expected ${rules.code}).`);
  for (const re of rules.medical) if (!re.test(text)) fail(loc, `${label}: a medical sentence is missing or reworded (expected ${re}).`);
}

// ---------------------------------------------------------------------------------------------------------------
// Google Play
// ---------------------------------------------------------------------------------------------------------------
const PLAY_CODES = { 'de-DE': 'de', 'es-ES': 'es', 'fr-FR': 'fr', 'it-IT': 'it' };

function checkPlay(iosNames) {
  console.log('checking the Google Play paste sources\n');

  const playFull = (loc, text, lang) => {
    checkLanguage(loc, 'full description', text, lang, { long: true });
    checkRules(loc, 'full description', text, PLAY_ONLY);
    checkLongCopy(loc, 'full description', text, lang);
    for (const [name, re] of PLAY_PROTECTED) if (!re.test(text)) fail(loc, `${name} is missing from the full description.`);
  };
  const playLine = (loc, label, text, lang) => {
    checkLanguage(loc, label, text, lang, { long: false });
    checkRules(loc, label, text, PLAY_ONLY);
  };
  const sameTitle = (loc, title, lang) => {
    const ios = iosNames[lang];
    if (ios && ios !== title) fail(loc, `the Play title "${title}" differs from the App Store name "${ios}". One name per language on both stores (decision 6, 2026-10-19).`);
  };

  // 1. English (en-AU), the submission pack.
  const pack = read(DOCS.playEn);
  console.log(`  ${path.relative(ROOT, DOCS.playEn)}`);
  {
    const loc = 'play en-AU';
    const title = pack.match(/\*\*Title\*\*\s*\(<=30\):\s*`([^`\n]+)`/);
    const short = pack.match(/\*\*Short description\*\*\s*\(<=80\):\s*`([^`\n]+)`/);
    if (!title) fail(loc, 'title not found (expected "**Title** (<=30): `...`").');
    else {
      if (len(title[1]) > CAPS.play.title) fail(loc, `title is ${len(title[1])} characters, over Play's cap of 30.`);
      playLine(loc, 'title', title[1], 'en');
      sameTitle(loc, title[1], 'en');
    }
    if (!short) fail(loc, 'short description not found (expected "**Short description** (<=80): `...`").');
    else {
      if (len(short[1]) > CAPS.play.short) fail(loc, `short description is ${len(short[1])} characters, over Play's cap of 80.`);
      playLine(loc, 'short description', short[1], 'en');
    }
    const at = pack.indexOf('**Full description** (<=4000)');
    const open = at < 0 ? -1 : pack.indexOf('```\n', at);
    const close = open < 0 ? -1 : pack.indexOf('\n```', open + 4);
    if (close < 0) fail(loc, 'full description block not found (expected "**Full description** (<=4000)" then a fenced block).');
    else {
      const full = pack.slice(open + 4, close);
      const real = len(full);
      if (real > CAPS.play.full) fail(loc, `full description is ${real} characters, over Play's cap of 4000. The form will refuse it.`);
      const stated = pack.slice(at, open).match(/([\d,]+) characters of 4,000/);
      if (!stated) fail(loc, 'the full description has no recorded "N characters of 4,000." line.');
      else if (Number(stated[1].replace(/,/g, '')) !== real) fail(loc, `the doc records ${stated[1]} characters but the block measures ${real}. Re-count before pasting.`);
      playFull(loc, full, 'en');
      console.log(`    en-AU  title ${pad(title ? len(title[1]) : 0, 2)}/30   short ${pad(short ? len(short[1]) : 0, 2)}/80   full ${pad(real, 4)}/4000   English`);
    }
  }

  // 2. The four translations.
  const md = read(DOCS.playLocalised);
  console.log(`\n  ${path.relative(ROOT, DOCS.playLocalised)}`);
  const secs = sections(md);
  for (const [code, lang] of Object.entries(PLAY_CODES)) {
    const loc = `play ${code}`;
    const sec = secs.find((s) => s.code === code);
    const got = sec?.fields ?? {};
    if (!got.title || !got.short || !got.full) {
      fail(loc, `section missing, or it lacks a title/short/full block (found: ${Object.keys(got).join(', ') || 'nothing'})`);
      continue;
    }
    for (const k of Object.keys(got)) if (k.endsWith('#dup')) fail(loc, `two ${k.replace('#dup', '')} blocks in one section; which one is the paste?`);
    checkCount(loc, 'title', got.title, CAPS.play.title);
    checkCount(loc, 'short description', got.short, CAPS.play.short);
    checkCount(loc, 'full description', got.full, CAPS.play.full);
    playLine(loc, 'title', got.title.text, lang);
    playLine(loc, 'short description', got.short.text, lang);
    playFull(loc, got.full.text, lang);
    sameTitle(loc, got.title.text, lang);
    console.log(`    ${code}  title ${pad(len(got.title.text), 2)}/30   short ${pad(len(got.short.text), 2)}/80   full ${pad(len(got.full.text), 4)}/4000   ${LANG[lang].name}`);
  }
  // Only the five listings above are paste sources. A stray English block here is how a second, never-shipped
  // English short description once sat beside the live one with the gate passing both.
  for (const s of secs) if (!PLAY_CODES[s.code]) fail(`play ${s.code}`, `"${s.title}" is not one of the four Play translations. The English listing lives only in ${path.relative(ROOT, DOCS.playEn)}.`);
  if (/\*\*Short description\*\*\s*\(\d+\s*\/\s*80\)/.test(md.slice(0, secs[0]?.start ?? md.length))) {
    fail('play localised', 'a short-description block sits above the first translation. Only the submission pack holds English.');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The App Store
// ---------------------------------------------------------------------------------------------------------------
const tokens = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function checkKeywords(loc, kw, visible, alsoTaken = new Set()) {
  const text = kw.text;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > CAPS.ios.keywords) fail(loc, `keywords are ${bytes} UTF-8 bytes. Hold them to 100 bytes so an accented letter cannot tip the field over.`);
  if (/\s/.test(text)) fail(loc, 'keywords contain a space. Apple splits on commas, so a space only spends a character.');
  const words = text.split(',');
  if (words.some((w) => w === '')) fail(loc, 'keywords contain an empty entry (a doubled or trailing comma).');
  const seen = new Set();
  for (const w of words) {
    if (seen.has(w)) fail(loc, `keyword "${w}" appears twice.`);
    seen.add(w);
    if (alsoTaken.has(w)) fail(loc, `keyword "${w}" is already in the primary English field. The second set must add words, not repeat them.`);
    for (const t of tokens(w)) {
      if (visible.has(t)) fail(loc, `keyword "${w}" repeats "${t}" from the name or subtitle. Apple already indexes those words, so it wastes the field.`);
    }
  }
}

function checkIosLocale(loc, f, lang, { inherit } = {}) {
  const has = (k) => Boolean(f[k]);
  for (const k of Object.keys(f)) if (k.endsWith('#dup')) fail(loc, `two ${k.replace('#dup', '')} blocks in one section; which one is the paste?`);
  const name = has('name') ? f.name : inherit?.name;
  const subtitle = has('subtitle') ? f.subtitle : inherit?.subtitle;
  if (!name || !subtitle || !has('keywords')) {
    fail(loc, `needs a name, a subtitle and keywords (found: ${Object.keys(f).join(', ') || 'nothing'}).`);
    return null;
  }
  if (!inherit && (!has('promo') || !has('desc'))) {
    fail(loc, `needs promotional text and a description (found: ${Object.keys(f).join(', ')}).`);
    return null;
  }
  const counts = {};
  for (const k of ['name', 'subtitle', 'keywords', 'promo', 'desc']) {
    if (!has(k)) continue;
    counts[k] = checkCount(loc, k === 'desc' ? 'description' : k === 'promo' ? 'promotional text' : k, f[k], CAPS.ios[k]);
    const label = k === 'desc' ? 'description' : k === 'promo' ? 'promotional text' : k;
    checkLanguage(loc, label, f[k].text, lang, { long: k === 'desc' });
    checkRules(loc, label, f[k].text, IOS_ONLY);
  }
  if (has('desc')) {
    const d = f.desc.text;
    checkLongCopy(loc, 'description', d, lang);
    if (!/https:\/\/doubledone\.app\/privacy/.test(d)) fail(loc, 'the description has lost the privacy URL (https://doubledone.app/privacy).');
    if (!/https:\/\/doubledone\.app\/terms/.test(d)) fail(loc, 'the description has lost the Terms URL, which is also its EULA link (https://doubledone.app/terms).');
  }
  const visible = new Set([...tokens(name.text), ...tokens(subtitle.text)]);
  return { name, subtitle, visible, counts };
}

function checkAppStore() {
  console.log('checking the App Store paste sources\n');
  const names = {};

  // 1. English.
  const en = read(DOCS.iosEn);
  console.log(`  ${path.relative(ROOT, DOCS.iosEn)}`);
  const enSecs = sections(en);
  const primary = enSecs.find((s) => s.code === 'en');
  let enResult = null;
  if (!primary) fail('appstore en', 'the primary English section ("## ... (`en`)") is missing.');
  else {
    enResult = checkIosLocale('appstore en', primary.fields, 'en');
    if (enResult) {
      checkKeywords('appstore en', primary.fields.keywords, enResult.visible);
      names.en = enResult.name.text;
      const c = enResult.counts;
      console.log(`    en     name ${pad(c.name, 2)}/30   subtitle ${pad(c.subtitle, 2)}/30   keywords ${pad(c.keywords, 3)}/100   promo ${pad(c.promo, 3)}/170   description ${pad(c.desc, 4)}/4000`);
    }
  }
  // The second English keyword set, written once per slot it can go into, and identical in both.
  const second = enSecs.filter((s) => s.code === 'en-GB' || s.code === 'en-AU');
  if (second.length !== 2) fail('appstore en second set', 'expected two second-set sections, (`en-GB`) and (`en-AU`).');
  if (enResult && primary) {
    const taken = new Set(primary.fields.keywords.text.split(','));
    for (const s of second) {
      const loc = `appstore ${s.code}`;
      const r = checkIosLocale(loc, s.fields, 'en', { inherit: enResult });
      if (!r) continue;
      if (s.fields.name || s.fields.subtitle || s.fields.promo || s.fields.desc) fail(loc, 'the second set carries visible text of its own. It pastes the primary English name, subtitle, promotional text and description unchanged, so only its keywords live here.');
      checkKeywords(loc, s.fields.keywords, enResult.visible, taken);
      console.log(`    ${s.code}  keywords ${pad(r.counts.keywords, 3)}/100 (name, subtitle, promo and description: the primary's)`);
    }
    if (second.length === 2 && second[0].fields.keywords?.text !== second[1].fields.keywords?.text) {
      fail('appstore en second set', 'the en-GB and en-AU sets differ. They are one set drafted for whichever slot ASC needs, so they must match.');
    }
  }

  // 2. The localisations.
  const loc10n = read(DOCS.iosLocalised);
  console.log(`\n  ${path.relative(ROOT, DOCS.iosLocalised)}`);
  const want = { 'de-DE': 'de', 'es-MX, es-ES': 'es', 'fr-FR': 'fr', 'it-IT': 'it' };
  const secs = sections(loc10n);
  for (const [code, lang] of Object.entries(want)) {
    const loc = `appstore ${code}`;
    const sec = secs.find((s) => s.code === code);
    if (!sec) {
      fail(loc, `section missing (expected a heading ending in (\`${code}\`)).`);
      continue;
    }
    const r = checkIosLocale(loc, sec.fields, lang);
    if (!r) continue;
    checkKeywords(loc, sec.fields.keywords, r.visible);
    names[lang] = r.name.text;
    const c = r.counts;
    console.log(`    ${code.padEnd(12)} name ${pad(c.name, 2)}/30   subtitle ${pad(c.subtitle, 2)}/30   keywords ${pad(c.keywords, 3)}/100   promo ${pad(c.promo, 3)}/170   description ${pad(c.desc, 4)}/4000`);
  }
  for (const s of secs) if (!want[s.code]) fail(`appstore ${s.code}`, `"${s.title}" is not one of the four App Store localisations this doc holds.`);
  return names;
}

// The App Store names are read in both modes: Play's titles must match them, one name per language.
function iosNames() {
  const out = {};
  const grab = (md, code, lang) => {
    const s = sections(md).find((x) => x.code === code);
    if (s?.fields.name) out[lang] = s.fields.name.text;
  };
  const en = read(DOCS.iosEn);
  const l10n = read(DOCS.iosLocalised);
  grab(en, 'en', 'en');
  for (const [code, lang] of [['de-DE', 'de'], ['es-MX, es-ES', 'es'], ['fr-FR', 'fr'], ['it-IT', 'it']]) grab(l10n, code, lang);
  return out;
}

const names = RUN_IOS ? checkAppStore() : iosNames();
if (RUN_IOS && RUN_PLAY) console.log('');
if (RUN_PLAY) checkPlay(names);

console.log('');
const which = RUN_PLAY && RUN_IOS ? 'Play or App Store' : RUN_PLAY ? 'Play' : 'App Store';
if (failures) {
  console.error(`✗ ${failures} problem${failures === 1 ? '' : 's'}. Do not paste into the ${which} console until these are fixed.`);
  process.exit(1);
}
console.log(`✓ every ${which} paste source is inside its caps, keeps its diacritics and its protected claims, names no price, and says nothing the code has proved false.`);
