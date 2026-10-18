"""The break test for scripts/check-listings.mjs: every rule must FAIL on the copy it exists to stop.

    python scripts/check-listings-break.py            every group
    python scripts/check-listings-break.py nothing    one group (protected, nothing)

Why it exists: a gate that passes proves nothing about the rule you think it enforces. The 2026-10-19 build
review found three that always passed (the six-character code check, the "nothing leaves your device" ban, and
the clinical-word ban outside English), each proven only by a by-hand scratch run that nobody kept. These are
those runs, kept, so a rule that goes soft again is caught by the next person who touches the gate.

How: copy the four paste sources into a temporary folder, apply ONE change, re-measure every recorded count (so
a stale count can never be the failure), and run the real gate there. A case only counts as caught when the gate
fails for the EXPECTED reason: a probe that merely pushes a description over 4,000 characters proves nothing, so
each probe replaces a sentence instead of adding one. The untouched copies must pass first.

Run it after any change to check-listings.mjs or to the paste sources' protected lines. Python 3, no packages.
Set GATE=/path/to/another/check-listings.mjs to run the same cases against an older gate.
"""
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = {
    "playEn": "docs/play-store-submission-pack.md",
    "playL10n": "docs/play-store-listings-localised.md",
    "iosEn": "docs/appstore/listing-copy.md",
    "iosL10n": "docs/appstore/listing-localised.md",
}
FIELD_RE = re.compile(
    r"(\*\*(?:Title|Short description|Full description|Name|Subtitle|Keywords|Promotional text|Description)\*\*\s*\()"
    r"(\d+)(\s*/\s*\d+\)\s*\n+```\n)([\s\S]*?)(\n```)"
)


def read(rel):
    return io.open(os.path.join(REPO, rel), encoding="utf-8").read().replace("\r\n", "\n")


def recount(rel, s):
    """Re-measure every recorded count, the way the gate measures (characters, not bytes)."""
    s = FIELD_RE.sub(lambda m: m.group(1) + str(len(m.group(4))) + m.group(3) + m.group(4) + m.group(5), s)
    if rel == DOCS["playEn"]:
        at = s.index("**Full description** (<=4000)")
        open_ = s.index("```\n", at) + 4
        close = s.index("\n```", open_)
        head = re.sub(r"[\d,]+ characters of 4,000", "{:,} characters of 4,000".format(len(s[open_:close])), s[at:open_], count=1)
        s = s[:at] + head + s[open_:]
    return s


def section(s, code):
    """The [start, end) of a '## ... (`code`)' section, so a change can be aimed at one language."""
    m = re.search(r"^#{2,3}\s+.+?\s+\(`" + re.escape(code) + r"`\)\s*$", s, re.M)
    assert m, "no section " + code
    nxt = re.search(r"^#{2,3}\s+.+?\s+\(`[^`]+`\)\s*$", s[m.end():], re.M)
    return m.start(), (m.end() + nxt.start()) if nxt else len(s)


def apply(root, doc, old, new, code=None):
    rel = DOCS[doc]
    p = os.path.join(root, rel)
    s = io.open(p, encoding="utf-8").read()
    lo, hi = section(s, code) if code else (0, len(s))
    part = s[lo:hi]
    if old not in part:
        raise SystemExit("the case's anchor is gone from %s%s, so the case needs updating: %r" % (rel, " (" + code + ")" if code else "", old[:70]))
    s = recount(rel, s[:lo] + part.replace(old, new, 1) + s[hi:])
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


def run_gate(root):
    gate = os.environ.get("GATE") or os.path.join(REPO, "scripts", "check-listings.mjs")
    r = subprocess.run(["node", gate], cwd=root, capture_output=True, text=True, encoding="utf-8")
    fails = [l.strip()[2:] for l in (r.stdout + r.stderr).splitlines() if l.strip().startswith("✗ ") and " problem" not in l]
    return r.returncode, fails


def copy_docs(root):
    if os.path.isdir(root):
        shutil.rmtree(root)
    for rel in DOCS.values():
        dst = os.path.join(root, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        io.open(dst, "w", encoding="utf-8", newline="\n").write(recount(rel, read(rel)))


# ---------------------------------------------------------------------------------------------------------------
# The cases: (name, [(doc, old, new, section)], the words the failure must contain)
# ---------------------------------------------------------------------------------------------------------------
CODE = "six-character code is missing"
MED = "a medical sentence is missing"
GROUPS = {
    # The protected claims: the code (once checked as a bare number, which "six colour themes" satisfied) and all
    # three medical sentences, on both stores and in every language.
    "protected": [
        ("Play en: the code sentence deleted", [("playEn", "You start it by reading somebody a six-character code, which only works for the email you invited. ", "", None)], CODE),
        ("Play de: the code sentence deleted", [("playL10n", "Sie fängt damit an, dass du deinem Menschen einen Code aus sechs Zeichen vorliest. ", "", "de-DE")], CODE),
        ("Play es: the code reworded away", [("playL10n", "y el código de seis caracteres que le lees a tu persona solo sirve", "y lo que le lees a tu persona solo sirve", "es-ES")], CODE),
        ("Play fr: the code sentence deleted", [("playL10n", "Ça commence par un code de six caractères, que tu lis à ta personne. ", "", "fr-FR")], CODE),
        ("Play it: the code sentence deleted", [("playL10n", "Si comincia leggendo un codice di sei caratteri alla tua persona. ", "", "it-IT")], CODE),
        ("App Store en: the code sentence deleted", [("iosEn", " It starts with a six-character code.", "", None)], CODE),
        ("App Store de: the code cut", [("iosL10n", " Sie fängt mit einem Code aus sechs Zeichen an, den du deinem Menschen vorliest, und nötig", " Nötig", "de-DE")], CODE),
        ("App Store es: the code cut", [("iosL10n", " Empieza con un código de seis caracteres que le lees a tu persona, y cada uno", " Cada uno", "es-MX, es-ES")], CODE),
        ("App Store fr: the code sentence deleted", [("iosL10n", " Ça commence par un code de six caractères, que tu lis à ta personne.", "", "fr-FR")], CODE),
        ("App Store it: the code cut", [("iosL10n", " Si comincia leggendo un codice di sei caratteri alla tua persona, e serve", " Serve", "it-IT")], CODE),
        ("App Store en: cut to 'DoubleDone is not a medical device.'",
         [("iosEn", " It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for professional care. For medical advice, talk to a health professional.", "", None)], MED),
        ("App Store en: the diagnose sentence deleted", [("iosEn", " It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for professional care.", "", None)], MED),
        ("Play en: the diagnose sentence trimmed", [("playEn", ", and it is not a substitute for professional care.", ".", None)], MED),
        ("Play de: the diagnose sentence deleted", [("playL10n", " Die App diagnostiziert, behandelt, heilt oder verhindert keine Erkrankungen und ersetzt keine professionelle Hilfe.", "", "de-DE")], MED),
        ("App Store es: the diagnose sentence deleted", [("iosL10n", " No diagnostica, trata, cura ni previene ninguna afección, y no sustituye la atención de un profesional.", "", "es-MX, es-ES")], MED),
        ("App Store fr: the diagnose sentence deleted",
         [("iosL10n", " L'appli ne diagnostique, ne traite, ne guérit ni ne prévient aucun problème de santé, et ne remplace pas le suivi d'un professionnel de santé.", "", "fr-FR")], MED),
        ("Play it: the diagnose sentence deleted", [("playL10n", " Non diagnostica, non tratta, non cura né previene alcuna condizione di salute, e non sostituisce il supporto di un professionista.", "", "it-IT")], MED),
    ],
}

# Each probe REPLACES the scrapbook-picture sentence of the privacy line, so no description grows past its cap.
PIC = {
    "en": "Scrapbook pictures are made with Cloudflare's AI models.",
    "de": "Die Bilder im Erinnerungsalbum entstehen mit KI-Modellen von Cloudflare.",
    "es": "Las imágenes del álbum se crean con modelos de IA de Cloudflare.",
    "fr": "Les images des albums souvenirs sont créées avec les modèles d'IA de Cloudflare.",
    "it": "Le immagini dell'album dei ricordi sono create con i modelli AI di Cloudflare.",
}
SEC = {
    ("play", "de"): "de-DE", ("play", "es"): "es-ES", ("play", "fr"): "fr-FR", ("play", "it"): "it-IT",
    ("ios", "de"): "de-DE", ("ios", "es"): "es-MX, es-ES", ("ios", "fr"): "fr-FR", ("ios", "it"): "it-IT",
}


def probe(store, lang, sentence):
    doc = ("playEn" if store == "play" else "iosEn") if lang == "en" else ("playL10n" if store == "play" else "iosL10n")
    return [(doc, PIC[lang], sentence, SEC.get((store, lang)))]


LEAVES_EN = '"nothing leaves your device", or a rewording'
LEAVES_TR = 'a translated "no text leaves your device"'
GROUPS["nothing"] = [
    # The English family, from the review's own probes, and the translations a native read could reach for. The
    # German line is the one recorded at play-store-listings-localised.md (2026-08-16), "nichts mehr irgendwohin".
    ("Play en: 'nothing leaves the device'", probe("play", "en", "With AI off, nothing leaves the device."), LEAVES_EN),
    ("Play en: 'nothing leaves your phone'", probe("play", "en", "With AI off, nothing leaves your phone."), LEAVES_EN),
    ("Play en: 'your words never leave your device'", probe("play", "en", "With AI off, your words never leave your device."), LEAVES_EN),
    ("Play en: 'nothing you write leaves your device'", probe("play", "en", "With AI off, nothing you write leaves your device."), LEAVES_EN),
    ("Play en: 'nothing leaves your device'", probe("play", "en", "With AI off, nothing leaves your device."), LEAVES_EN),
    ("Play en: 'no text is sent anywhere'", probe("play", "en", "With AI off, no text is sent anywhere."), LEAVES_EN),
    ("App Store en: 'your tasks never leave the phone'", probe("ios", "en", "With AI off, your tasks never leave the phone."), LEAVES_EN),
    ("App Store en: 'what you type does not leave your device'", probe("ios", "en", "With AI off, what you type does not leave your device."), LEAVES_EN),
    ("Play de: 'dann wird nichts mehr irgendwohin geschickt'", probe("play", "de", "Ist sie aus, wird nichts mehr irgendwohin geschickt."), LEAVES_TR),
    ("App Store de: 'verlässt nichts dein Handy'", probe("ios", "de", "Ist die KI aus, verlässt nichts dein Handy."), LEAVES_TR),
    ("Play es: 'nada se envía'", probe("play", "es", "Con la IA apagada, nada se envía."), LEAVES_TR),
    ("App Store es: 'tu texto nunca sale de tu teléfono'", probe("ios", "es", "Con la IA apagada, tu texto nunca sale de tu teléfono."), LEAVES_TR),
    ("Play fr: 'rien ne quitte ton appareil'", probe("play", "fr", "Sans l'IA, rien ne quitte ton appareil."), LEAVES_TR),
    ("App Store fr: 'rien n'est envoyé'", probe("ios", "fr", "Sans l'IA, rien n'est envoyé."), LEAVES_TR),
    ("Play it: 'niente lascia il tuo telefono'", probe("play", "it", "Con l'AI spenta, niente lascia il tuo telefono."), LEAVES_TR),
    ("App Store it: 'nulla viene inviato'", probe("ios", "it", "Con l'AI spenta, nulla viene inviato."), LEAVES_TR),
]


def main():
    # The case names carry accented words; a Windows console defaults to cp1252.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    which = sys.argv[1:] or list(GROUPS)
    for w in which:
        if w not in GROUPS:
            raise SystemExit("unknown group %s. Groups: %s" % (w, ", ".join(GROUPS)))
    root = tempfile.mkdtemp(prefix="listings-break-")
    try:
        copy_docs(root)
        code, fails = run_gate(root)
        if code != 0:
            print("the untouched copies FAIL the gate, so nothing below would mean anything:\n  " + "\n  ".join(fails))
            sys.exit(1)
        print("untouched copies pass\n")
        misses = 0
        total = 0
        for g in which:
            for name, muts, expect in GROUPS[g]:
                total += 1
                copy_docs(root)
                for doc, old, new, sec in muts:
                    apply(root, doc, old, new, sec)
                code, fails = run_gate(root)
                hit = next((f for f in fails if expect in f), None)
                if hit:
                    print("  caught  [%s] %s" % (g, name))
                else:
                    misses += 1
                    why = "it passed" if code == 0 else "it failed for another reason: " + (fails[0][:120] if fails else "?")
                    print("  MISSED  [%s] %s (%s)" % (g, name, why))
        print("\n%d of %d caught" % (total - misses, total))
        sys.exit(1 if misses else 0)
    finally:
        shutil.rmtree(root, ignore_errors=True)


main()
