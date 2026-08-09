# Ours: the cross-language verification

*After four agents applied their own language's rewrite list to their own catalog, a fifth read all
five files together. This is its verdict, verbatim. Four defects survived, including the one
terminology break the terminology agent had named and the German pass had missed. Everything under
"Flags outside the edited blocks" was deliberately left alone and is in the Backlog.*

---

## Verdict

Four categories are clean. Two real defects, one typographic inconsistency worth fixing, and three flags outside the edited blocks. `npx tsc --noEmit -p client/tsconfig.json` passes with zero errors.

---

## Defects

### 1. de.ts:350 `notThem` still says "Person", not "dein Mensch" (category 6)

This is the exact break `lang-terminology.md` named as the one thing to fix, and the German pass did not apply it.

```
de.ts:350   notThem: 'Doch nicht die richtige Person? Verlass die Liste.',
```

`Person` is the **only** occurrence of that noun in all 1092 lines of `de.ts`. Nine other keys in the same block name the same human `dein Mensch` (`codeBody`, `codeTitle`, `enterCode`, `errInvalidCode`, `signedOutBody`, `theirEmail`, `theirEmailHint`, `waiting`, `yourName`), and `errListFull` counts the seats as `zwei Menschen`. It fires on the joiner's screen, at the moment someone is deciding whether a stranger holds their code.

**Fix:** `notThem: 'Doch nicht der richtige Mensch? Verlass die Liste.'`

### 2. `theirEmail` split two-and-two across the four locales (category 6, parity)

fr and de both moved to "address" in this pass. es and it were left on "email", so the five no longer agree on what the field is.

| | current | changed this pass |
|---|---|---|
| en.ts:364 | `"Your person's email"` | no (reference) |
| es.ts:360 | `'El correo de tu persona'` | no |
| fr.ts:360 | `"L'adresse e-mail de ta personne"` | **yes** |
| it.ts:360 | `"L'email della tua persona"` | no |
| de.ts:364 | `'Die E-Mail-Adresse von deinem Menschen'` | **yes** |

es and it carry the ambiguity fr and de just removed: *el correo de tu persona* and *l'email della tua persona* both read first as **the message your person sent**, on the one field sitting directly above a hint promising the app will never email them. Each locale's own `errBadEmail` already supplies the wording.

**Fixes:**
- `es.ts:360` → `theirEmail: 'La dirección de correo de tu persona',`
- `it.ts:360` → `theirEmail: "L'indirizzo email della tua persona",`

### 3. fr ours block breaks the file's French spacing convention (category 4)

Five of five opportunities in the block use a plain space before `?`. The rest of `fr.ts` uses U+00A0 in 53 places against 9 plain. The block is the densest plain-space cluster in the file.

```
fr.ts:323  ...Demandes-en un nouveau à ta personne ?"
fr.ts:331  errUnknown: "Ça n'a pas marché pour l'instant. On réessaie ?",
fr.ts:346  notThem: "Ce n'est pas la bonne personne ? Quitte la liste.",
fr.ts:365  whatFor: 'À quoi sert cette liste ?',
fr.ts:366  yourName: "Comment veux-tu qu'on t'appelle ?",
```

**Pre-existing, not introduced by this pass** (the old strings had it too). It still matters: a breakable space lets a lone `?` wrap to its own line on a narrow phone, which is precisely what the non-breaking space prevents, and `whatFor` and `yourName` are screen titles.

**Fix:** replace the space before each `?` with U+00A0, matching lines 25, 26, 158, 183 and 47 others.

---

## Flags outside the edited blocks

**Curly apostrophes (U+2019) exist in four of the five files.** None are in any `ours` block, all pre-existing, but the category was scoped to the whole files:
- `en.ts:860, 867` (`moveDownA11y`, `moveUpA11y`)
- `fr.ts:389, 512, 844, 845, 856, 863, 865`
- `it.ts:393, 856, 857, 863`
- `de.ts:115, 1000`

**Delimiter rule violated by backslash escapes,** also all outside the `ours` blocks: `fr.ts:573, 722, 724` (`'…l\'heure…'`) and `it.ts:32, 967`. Each should switch to a double-quote delimiter.

**en.ts:337 `forgetHint` is now the weakest of the five on "delete for good".**
```
forgetHint: 'This removes the list and everything on it, and it cannot be undone. …'
```
under a button reading `Delete this list for good`. After this pass all four target locales use their own delete verb in the hint (es *borra*, fr *supprime*, it *elimina*, de *löscht*). English is the only one that does not, and "removes" is the phrasing indistinguishable from "leave". The reference is now the outlier. Out of scope for the edit, so flagging, not proposing.

**fr.ts:351 `presetOwn` drops the self-agency the other four keep.** en `'Name it yourself'`, es `'Ponle tú el nombre'`, it `'Dalle un nome tu'`, de `'Selbst benennen'`, fr `'Lui donner un nom'`. Low severity, and it also near-duplicates fr's own `namePlaceholder: 'Donne-lui un nom'` on the very next screen. Fix if you want parity: `presetOwn: 'Lui donner un nom toi-même',`

---

## Clean

**1. Key parity.** Clean. All five hold exactly 54 keys, identical sets, no key present in some and missing from others.

**2. Alphabetical order.** Clean. All five are codepoint-sorted in identical order. Note for anyone tempted to "fix" it: `joinInstead` before `joined` and `signIn` before `signedOutBody` are correct under codepoint sort (uppercase `I` precedes lowercase `e`), and all five agree.

**3. Placeholders.** Clean. `{name}` in `joined`, `partnerJoined`, `sharingWith` and `{code}` in `shareMessage`, spelled identically in all five, no gains, no losses, no stray braces. Bonus check: every locale's `shareMessage` quotes its own `joinInstead` label verbatim, so the instruction matches the button in all five.

**4. Typography, within the ours blocks.** Clean. Zero U+2019, zero em-dashes, zero en-dashes, zero double-hyphen surrogates. Every string containing a straight apostrophe uses a double-quote delimiter, every string without one uses single quotes, no escapes. German's `„…“` in `de.ts:358` is correct German typography and matches the glossary.

**5. Syntax.** Clean. `tsc --noEmit` passes. All 270 entry lines parse as `key: <quote>…<quote>,`, every one carries a trailing comma, no delimiter appears unescaped inside its own string, no CRLF, no tabs, no trailing whitespace.

**6. Terminology, apart from defects 1 and 2.** "Your person" holds: 8 uses in es, 8 in fr, 8 in it, 9 in de, against 5 in the English reference, so the four locales name it *more* often than the source does, which is correct given English "they" is genderless and the target pronouns are not. No competing noun for the referent in es, fr or it. "Leave" versus "delete for good" are two clearly distinct verbs in all five: *salir / borrar*, *quitter / supprimer*, *uscire / eliminare*, *verlassen / löschen*, and each locale's `forgetHint` now uses its own delete verb while `leave`, `leaveHint`, `errAlreadyPaired` and `notThem` all stay on the leave verb.

**7. Regional Spanish.** Clean. Zero vosotros forms anywhere in `es.ts`, not just the block: no *vosotros/vuestro*, no *-áis/-éis/-ís* second-person-plural endings, no *podéis/lleváis/tenéis/sois/habéis*. Every second person is tú (`Puedes` ×6, `tienes`, `quieres` ×2, `pusiste`, `estás`, and tú imperatives `Léeselo`, `Ponle`, `Sal`, `Prueba`, `Abre`, `elige`, `escribe`, `consigue`, `lleva`). No Peninsular vocabulary: `teléfono` not *móvil*, `correo` not *mail*, no *coger*, *ordenador*, *vale*, *apetece*, *piso* or *zumo*. The pass also neutralised the Peninsular present perfect to preterite (*has puesto* → *pusiste*, *he puesto* → *puse*, *no ha funcionado* → *no funcionó*), which is a genuine improvement.

**8. German register.** Clean apart from defect 1. du throughout, zero formal *Sie/Ihnen/Ihre* (the nine `Sie` hits in `de.ts` are all sentence-initial third-person *sie* referring to tasks or lists, correct German). Zero exclamation marks in the entire file. Zero banned particles (*endlich*, *schon wieder*, *erst jetzt*, *immer noch*). Warmth is carried by the sanctioned particles instead, *ruhig* in `errRateLimited`, `forgetHint` and `waiting`, *erst mal* in `errAlreadyPaired*`. No nominalised UI style: every action label is a verbal infinitive (`Diese Liste verlassen`, `Gemeinsame Liste anfangen`, `Code holen`, `Mit einem Code beitreten`), never *das Verlassen einer Liste*.

---

## One open decision, not a defect

`defaultName` still diverges from `docs/shared-lists.md` §1's locked transcreation in all four locales: shipped `Nuestra lista` / `Notre liste` / `La nostra lista` / `Unsere Liste` against §1's `Nuestro` / `Ensemble` / `Nostro` / `Unser`-or-`Gemeinsam`. `lang-terminology.md` recommended amending the doc rather than the strings, and noted that `Gemeinsam` is now foreclosed because *gemeinsame Liste* is the generic term in six German strings in the same block. Nobody has amended §1 yet, so doc and code still disagree on paper.